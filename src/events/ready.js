import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";

import {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      // =====================================================
      // 24/7 Voice Channels
      // Add more servers here if needed.
      // =====================================================
      const voiceConnections = [
        {
          guildId: "1502923562506256407",
          channelId: "1502962402654818335",
        },
        {
          guildId: "1522597888096473349",
          channelId: "1522597888528617625",
        },
      ];

      for (const vc of voiceConnections) {
        const guild = client.guilds.cache.get(vc.guildId);
        const channel = guild?.channels.cache.get(vc.channelId);

        if (!guild || !channel) {
          logger.warn(
            `Unable to find guild/channel: ${vc.guildId} / ${vc.channelId}`
          );
          continue;
        }

        const connectToVoice = () => {
          const existingConnection = getVoiceConnection(guild.id);

          if (existingConnection) {
            return existingConnection;
          }

          const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
          });

          startupLog(
            `[VOICE] Joined "${channel.name}" in "${guild.name}"`
          );

          connection.on("stateChange", (oldState, newState) => {
            startupLog(
              `[VOICE][${guild.name}] ${oldState.status} -> ${newState.status}`
            );
          });

          connection.on("error", (error) => {
            logger.error(`[VOICE ERROR][${guild.name}]`, error);
          });

          connection.on(
            VoiceConnectionStatus.Disconnected,
            async () => {
              try {
                await entersState(
                  connection,
                  VoiceConnectionStatus.Connecting,
                  5000
                );

                startupLog(
                  `[VOICE][${guild.name}] Voice reconnect successful`
                );
              } catch (error) {
                logger.error(
                  `[VOICE][${guild.name}] Voice reconnect failed:`,
                  error
                );

                startupLog(
                  `[VOICE][${guild.name}] Voice disconnected, reconnecting...`
                );

                connection.destroy();

                setTimeout(() => {
                  connectToVoice();
                }, 5000);
              }
            }
          );

          return connection;
        };

        connectToVoice();

        // Health check every minute
        setInterval(() => {
          const botMember = guild.members.me;

          if (!botMember?.voice?.channelId) {
            startupLog(
              `[VOICE][${guild.name}] Bot not in VC, reconnecting...`
            );

            const existingConnection = getVoiceConnection(guild.id);

            if (existingConnection) {
              existingConnection.destroy();
            }

            connectToVoice();
          }
        }, 60000);
      }

      const reconciliationSummary =
        await reconcileReactionRoleMessages(client);

      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
