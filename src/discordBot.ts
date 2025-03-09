import { Client, GatewayIntentBits, TextChannel, Interaction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import 'dotenv/config';
import { calendarCommand, buildCalendarEmbed } from './commands/calendar';

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || 'YOUR_DISCORD_TOKEN';
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || 'YOUR_CHANNEL_ID';

export const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

export async function sendDiscordAlert(message: string): Promise<void> {
  const channel = await discordClient.channels.fetch(CHANNEL_ID) as TextChannel;
  if (channel) {
    await channel.send(message);
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

  return new Promise((resolve, reject) => {
    discordClient.once('ready', () => {
      console.log(`Discord bot logged in as ${discordClient.user?.tag}`);
      resolve();
    });
    discordClient.login(DISCORD_TOKEN).catch(reject);
  });
}
