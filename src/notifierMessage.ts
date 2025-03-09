import { EmbedBuilder, ColorResolvable, TextChannel } from 'discord.js';
import { CalendarEvent } from './models/event';
import { discordClient } from './discordBot';

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || 'YOUR_CHANNEL_ID';

export function buildNotificationEmbed(windowMinutes: number, groupEvents: CalendarEvent[]) {
  const windowText = windowMinutes === 30 ? '30-Minutes' : windowMinutes === 1 ? '1-Minute' : `${windowMinutes}-Minute`;
  const color: ColorResolvable = windowMinutes === 1 ? 0xff5555 : 0xf1c40f;
  const count = groupEvents.length;
  const label = count === 1 ? 'Event' : 'Events';
  const embed = new EmbedBuilder().setColor(color).setTitle(`${label} — ${windowText} Alert`);

  groupEvents.forEach((evt) => {
    embed.addFields({
      name: evt.title || 'No Title',
      value: [
        `**Actual**: ${evt.actual || 'N/A'}`,
        `**Forecast**: ${evt.forecast || 'N/A'}`,
        `**Prev**: ${evt.previous || 'N/A'}`,
      ].join('\n'),
    });
  });

  return embed;
}

export async function sendNotificationEmbed(embed: EmbedBuilder): Promise<void> {
  try {
    const channel = await discordClient.channels.fetch(CHANNEL_ID) as TextChannel;
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending embed:', error);
  }
}
