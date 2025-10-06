import { TextChannel, Interaction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message } from 'discord.js';
import 'dotenv/config';
import { discordClient } from './core/discordClient';
import { calendarCommand, buildCalendarEmbed } from './commands/calendar';
import { sendHealthAlert } from './utils/alerting';

import { MAX_RECONNECT_ATTEMPTS, RECONNECT_BASE_DELAY_MS } from './config/constants';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN';
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || 'YOUR_CHANNEL_ID';
const FALLBACK_CHANNEL_ID = process.env.FALLBACK_CHANNEL_ID;

let reconnectAttempts = 0;

export { discordClient };

export async function sendDiscordAlert(message: string): Promise<void> {
  const channel = await discordClient.channels.fetch(CHANNEL_ID) as TextChannel;
  if (channel) {
    await channel.send(message);
  }
}

export async function sendEmbed(embed: EmbedBuilder): Promise<Message | null> {
  try {
    const channel = await discordClient.channels.fetch(CHANNEL_ID) as TextChannel;
    if (!channel || !channel.isTextBased()) {
      console.warn('Primary channel not accessible, trying fallback...');
      return await sendToFallbackChannel(embed);
    }
    return await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending notification embed to primary channel:', error);
    return await sendToFallbackChannel(embed);
  }
}

async function sendToFallbackChannel(embed: EmbedBuilder): Promise<Message | null> {
  if (!FALLBACK_CHANNEL_ID) {
    console.warn('No fallback channel configured');
    return null;
  }

  try {
    const fallback = await discordClient.channels.fetch(FALLBACK_CHANNEL_ID) as TextChannel;
    if (!fallback || !fallback.isTextBased()) {
      console.error('Fallback channel not accessible');
      return null;
    }

    console.log('Using fallback channel for notification');
    return await fallback.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending to fallback channel:', error);
    return null;
  }
}

async function attemptReconnect(): Promise<void> {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnect attempts reached. Please restart bot manually.');
    await sendHealthAlert('Discord Connection', `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_BASE_DELAY_MS * reconnectAttempts;

  console.log(`Attempting to reconnect to Discord (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay / 1000}s...`);

  setTimeout(async () => {
    try {
      await discordClient.login(DISCORD_TOKEN);
      reconnectAttempts = 0;
      console.log('Successfully reconnected to Discord');
    } catch (error) {
      console.error('Reconnect attempt failed:', error);
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
        globalThis.calendarCache.set(messageId, { pages, currentPage });
        await interaction.update({ embeds: [embed], components: [row] });
      }
    } catch (error) {
      console.error('Error in interactionCreate:', error);
      if (interaction.isRepliable()) {
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true });
      }
    }
  });

  discordClient.on('disconnect', () => {
    console.warn('Disconnected from Discord');
    attemptReconnect();
  });

  discordClient.on('error', (error) => {
    console.error('Discord client error:', error);
  });

  discordClient.on('shardError', (error) => {
    console.error('Discord shard error:', error);
  });

  discordClient.on('shardDisconnect', (event, shardId) => {
    console.warn(`Shard ${shardId} disconnected (code: ${event.code})`);
  });

  discordClient.on('shardReconnecting', (shardId) => {
    console.log(`Shard ${shardId} reconnecting...`);
  });

  discordClient.on('shardResume', (shardId) => {
    console.log(`Shard ${shardId} resumed`);
    reconnectAttempts = 0;
  });

  return new Promise((resolve, reject) => {
    discordClient.once('ready', () => {
      console.log(`Discord bot logged in as ${discordClient.user?.tag}`);
      reconnectAttempts = 0;
      resolve();
    });
    discordClient.login(DISCORD_TOKEN).catch(reject);
  });
}
