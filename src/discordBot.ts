import { Interaction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message } from 'discord.js';
import 'dotenv/config';
import { discordClient } from './core/discordClient';
import { calendarCommand, buildCalendarEmbed } from './commands/calendar';
import { sendHealthAlert } from './utils/alerting';
import { createLogger } from './utils/logger';
import { CALENDAR_CACHE_MAX_AGE_MS } from './config/constants';

const log = createLogger('discord');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN';
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || 'YOUR_CHANNEL_ID';
const FALLBACK_CHANNEL_ID = process.env.FALLBACK_CHANNEL_ID;

// Unrecoverable WebSocket close codes — Discord.js will NOT auto-reconnect for these
const UNRECOVERABLE_CLOSE_CODES = new Set([
  4004, // Invalid token
  4010, // Invalid shard
  4013, // Invalid intent
  4014, // Disallowed intents
]);

export { discordClient };

/**
 * No-op: Discord.js v14 handles reconnection internally via @discordjs/ws session resumption.
 * Kept as an export because index.ts registers it as a shutdown cleanup handler.
 */
export function cancelPendingReconnect(): void {
  /* no-op: Discord.js v14 handles reconnection internally */
}

export async function sendEmbed(embed: EmbedBuilder): Promise<Message | null> {
  try {
    const channel = await discordClient.channels.fetch(CHANNEL_ID);
    if (!channel || !channel.isSendable()) {
      log.warn('Primary channel not accessible, trying fallback');
      return await sendToFallbackChannel(embed);
    }
    return await channel.send({ embeds: [embed] });
  } catch (error) {
    log.error('Error sending notification embed to primary channel', { error: String(error) });
    return await sendToFallbackChannel(embed);
  }
}

async function sendToFallbackChannel(embed: EmbedBuilder): Promise<Message | null> {
  if (!FALLBACK_CHANNEL_ID) {
    log.error('Primary channel failed and no fallback channel configured — notification dropped');
    await sendHealthAlert('Discord Notification', 'Primary channel is inaccessible and no fallback is configured — notifications are being dropped');
    return null;
  }

  try {
    const fallback = await discordClient.channels.fetch(FALLBACK_CHANNEL_ID);
    if (!fallback || !fallback.isSendable()) {
      log.error('Fallback channel not accessible — notification dropped');
      await sendHealthAlert('Discord Notification', 'Both primary and fallback channels are inaccessible — notifications are being dropped');
      return null;
    }

    log.info('Using fallback channel for notification');
    return await fallback.send({ embeds: [embed] });
  } catch (error) {
    log.error('Error sending to fallback channel — notification dropped', { error: String(error) });
    await sendHealthAlert('Discord Notification', `Both primary and fallback channels failed — notifications are being dropped: ${String(error)}`);
    return null;
  }
}

export async function initializeDiscordBot(): Promise<void> {
  discordClient.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'calendar') {
          await calendarCommand.execute(interaction);
        }
      }
      if (interaction.isButton()) {
        const { customId } = interaction;
        if (!['calendar_prev', 'calendar_next'].includes(customId)) return;
        try {
          const messageId = interaction.message.id;
          const cache = globalThis.calendarCache?.get(messageId);
          if (!cache) {
            await interaction.reply({ content: 'No pagination data found.', ephemeral: true });
            return;
          }
          if (Date.now() - cache.timestamp > CALENDAR_CACHE_MAX_AGE_MS) {
            await interaction.reply({ content: 'This calendar has expired. Use /calendar for a new one.', ephemeral: true });
            return;
          }
          let { pages, currentPage } = cache;
          if (customId === 'calendar_prev' && currentPage > 0) currentPage--;
          else if (customId === 'calendar_next' && currentPage < pages.length - 1) currentPage++;
          currentPage = Math.max(0, Math.min(currentPage, pages.length - 1));
          const embed = buildCalendarEmbed(pages[currentPage], currentPage, pages.length);
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('calendar_prev').setLabel('Previous page').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
            new ButtonBuilder().setCustomId('calendar_next').setLabel('Next page').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === pages.length - 1),
          );
          globalThis.calendarCache?.set(messageId, { pages, currentPage, timestamp: cache.timestamp });
          await interaction.update({ embeds: [embed], components: [row] });
        } catch (buttonError) {
          log.error('Error handling button interaction', { error: String(buttonError) });
          try {
            await interaction.reply({ content: 'This calendar has expired. Use /calendar for a new one.', ephemeral: true });
          } catch (replyError) {
            log.error('Failed to send expired-calendar reply to button interaction (token may have expired)', { error: String(replyError) });
          }
        }
        return;
      }
    } catch (error) {
      log.error('Error in interactionCreate', { error: String(error) });
      try {
        if (interaction.isRepliable()) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Something went wrong.', ephemeral: true });
          } else if (interaction.deferred) {
            await interaction.editReply({ content: 'Something went wrong.' });
          }
          // If already replied, nothing to do
        }
      } catch (replyError) {
        log.error('Failed to send error reply to interaction (token may have expired)', { error: String(replyError) });
      }
    }
  });

  discordClient.on('error', (error) => {
    log.error('Discord client error', { error: String(error) });
  });

  discordClient.on('shardError', (error) => {
    log.error('Discord shard error', { error: String(error) });
  });

  discordClient.on('shardDisconnect', async (event, shardId) => {
    log.warn('Shard disconnected', { shardId, code: event.code });
    if (UNRECOVERABLE_CLOSE_CODES.has(event.code)) {
      await sendHealthAlert(
        'Discord Connection',
        `Shard ${shardId} disconnected with unrecoverable close code ${event.code} — manual intervention required`
      );
      log.error('Unrecoverable gateway close code — exiting process to allow supervisor restart', { code: event.code, shardId });
      const t = setTimeout(() => process.exit(1), 5000);
      t.unref();
    }
  });

  discordClient.on('shardReconnecting', (shardId) => {
    log.info('Shard reconnecting', { shardId });
  });

  discordClient.on('shardResume', (shardId) => {
    log.info('Shard resumed', { shardId });
  });

  discordClient.on('warn', (message) => {
    log.warn('Discord warning', { message });
  });

  // Note: discord.js v14's 'invalidated' event is defined in the Events enum but
  // never emitted by the library. Session invalidation (opcode 9) is handled
  // internally by @discordjs/ws with automatic reconnection. Unrecoverable
  // gateway closes (4004, 4010, 4013, 4014) are caught by shardDisconnect above.

  return new Promise((resolve, reject) => {
    discordClient.once('ready', () => {
      log.info('Discord bot logged in', { tag: discordClient.user?.tag });
      resolve();
    });
    discordClient.login(DISCORD_TOKEN).catch(reject);
  });
}
