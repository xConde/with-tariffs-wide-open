import { TextChannel, Interaction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message } from 'discord.js';
import 'dotenv/config';
import { discordClient } from './core/discordClient';
import { calendarCommand, buildCalendarEmbed } from './commands/calendar';
import { sendHealthAlert } from './utils/alerting';
import { createLogger } from './utils/logger';

import { MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY_MS } from './config/constants';

const log = createLogger('discord');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN';
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || 'YOUR_CHANNEL_ID';
const FALLBACK_CHANNEL_ID = process.env.FALLBACK_CHANNEL_ID;

let reconnectAttempts = 0;
let reconnectTimeout: NodeJS.Timeout | null = null;
let reconnectDisabled = false;

export { discordClient };

/**
 * Cancels any pending reconnection attempt and prevents future ones.
 * Called during shutdown to prevent reconnect firing after client is destroyed.
 */
export function cancelPendingReconnect(): void {
  reconnectDisabled = true;
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  reconnectAttempts = 0;
}

export async function sendEmbed(embed: EmbedBuilder): Promise<Message | null> {
  try {
    const channel = await discordClient.channels.fetch(CHANNEL_ID) as TextChannel;
    if (!channel || !channel.isTextBased()) {
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
    log.warn('No fallback channel configured');
    return null;
  }

  try {
    const fallback = await discordClient.channels.fetch(FALLBACK_CHANNEL_ID) as TextChannel;
    if (!fallback || !fallback.isTextBased()) {
      log.error('Fallback channel not accessible');
      return null;
    }

    log.info('Using fallback channel for notification');
    return await fallback.send({ embeds: [embed] });
  } catch (error) {
    log.error('Error sending to fallback channel', { error: String(error) });
    return null;
  }
}

async function attemptReconnect(): Promise<void> {
  if (reconnectDisabled) return;
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log.error('Max reconnect attempts reached, manual restart required');
    await sendHealthAlert('Discord Connection', `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_BASE_DELAY_MS * reconnectAttempts;

  log.info('Attempting to reconnect to Discord', { attempt: reconnectAttempts, maxAttempts: MAX_RECONNECT_ATTEMPTS, delaySeconds: delay / 1000 });

  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    try {
      await discordClient.login(DISCORD_TOKEN);
      reconnectAttempts = 0;
      log.info('Successfully reconnected to Discord');
    } catch (error) {
      log.error('Reconnect attempt failed', { error: String(error) });
      await attemptReconnect();
    }
  }, delay);
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
        const messageId = interaction.message.id;
        const cache = globalThis.calendarCache?.get(messageId);
        if (!cache) {
          await interaction.reply({ content: 'No pagination data found.', ephemeral: true });
          return;
        }
        let { pages, currentPage } = cache;
        if (customId === 'calendar_prev' && currentPage > 0) currentPage--;
        else if (customId === 'calendar_next' && currentPage < pages.length - 1) currentPage++;
        const embed = buildCalendarEmbed(pages[currentPage], currentPage, pages.length);
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('calendar_prev').setLabel('Previous page').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === 0),
          new ButtonBuilder().setCustomId('calendar_next').setLabel('Next page').setStyle(ButtonStyle.Secondary).setDisabled(currentPage === pages.length - 1),
        );
        globalThis.calendarCache?.set(messageId, { pages, currentPage, timestamp: cache.timestamp });
        await interaction.update({ embeds: [embed], components: [row] });
      }
    } catch (error) {
      log.error('Error in interactionCreate', { error: String(error) });
      if (interaction.isRepliable()) {
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true });
      }
    }
  });

  discordClient.on('disconnect', () => {
    log.warn('Disconnected from Discord');
    attemptReconnect();
  });

  discordClient.on('error', (error) => {
    log.error('Discord client error', { error: String(error) });
  });

  discordClient.on('shardError', (error) => {
    log.error('Discord shard error', { error: String(error) });
  });

  discordClient.on('shardDisconnect', (event, shardId) => {
    log.warn('Shard disconnected', { shardId, code: event.code });
  });

  discordClient.on('shardReconnecting', (shardId) => {
    log.info('Shard reconnecting', { shardId });
  });

  discordClient.on('shardResume', (shardId) => {
    log.info('Shard resumed', { shardId });
    reconnectAttempts = 0;
  });

  return new Promise((resolve, reject) => {
    discordClient.once('ready', () => {
      log.info('Discord bot logged in', { tag: discordClient.user?.tag });
      reconnectAttempts = 0;
      resolve();
    });
    discordClient.login(DISCORD_TOKEN).catch(reject);
  });
}
