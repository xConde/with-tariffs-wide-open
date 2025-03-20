import { EmbedBuilder, ColorResolvable, TextChannel, Message } from 'discord.js';
import { CalendarEvent } from './models/event';
import { discordClient } from './discordBot';

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || 'YOUR_CHANNEL_ID';

function predictBeat(actual: string, forecast: string): 'beat' | 'miss' | 'neutral' {
  const a = parseFloat(actual.replace(/[^0-9.]/g, ""));
  const f = parseFloat(forecast.replace(/[^0-9.]/g, ""));
  if (isNaN(a) || isNaN(f)) return 'neutral';
  if (a > f) return 'beat';
  if (a < f) return 'miss';
  return 'neutral';
}

function getBeatMissIndicator(prediction: 'beat' | 'miss' | 'neutral'): string {
  if (prediction === 'beat') return '↑ Higher';
  if (prediction === 'miss') return '↓ Lower';
  return '– Expected';
}

export function buildNotificationEmbed(windowMinutes: number, groupEvents: CalendarEvent[]): EmbedBuilder {
  const windowText = windowMinutes === 30 ? '30-Minutes' : windowMinutes === 1 ? '1-Minute' : `${windowMinutes}-Minute`;
  const color: ColorResolvable = windowMinutes === 1 ? 0xff8c00 : 0xf1c40f;
  const label = groupEvents.length === 1 ? 'Event' : 'Events';
  const embed = new EmbedBuilder().setColor(color).setTitle(`${label} — ${windowText} Alert`);
  
  groupEvents.forEach((evt) => {
    const lines: string[] = [];
    if (evt.forecast && evt.forecast.trim() !== '') {
      lines.push(`**Forecast**: ${evt.forecast}`);
    }
    if (evt.previous && evt.previous.trim() !== '') {
      lines.push(`**Prev**: ${evt.previous}`);
    }
    if (lines.length > 0) {
      embed.addFields({ name: evt.title || 'No Title', value: lines.join('\n'), inline: false });
    } else {
      embed.addFields({ name: evt.title || 'No Title', value: "No data available", inline: false });
    }
  });
  return embed;
}

export function buildUpdatedNotificationEmbed(groupEvents: CalendarEvent[]): EmbedBuilder {
  let embedColor: ColorResolvable = 0x7289da;
  if (groupEvents.length === 1) {
    const evt = groupEvents[0];
    const prediction = predictBeat(evt.actual || '', evt.forecast || '');
    embedColor = prediction === 'beat' ? 0x2ecc71 : prediction === 'miss' ? 0xe74c3c : 0x7289da;
  }
  const embed = new EmbedBuilder().setColor(embedColor).setTitle(`Event Results`);
  
  groupEvents.forEach((evt) => {
    const lines: string[] = [];
    if (evt.actual && evt.actual.trim() !== '') {
      const prediction = predictBeat(evt.actual, evt.forecast || '');
      const indicator = getBeatMissIndicator(prediction);
      lines.push(`**Actual**: ${evt.actual} ${indicator}`);
    }
    if (evt.forecast && evt.forecast.trim() !== '') {
      lines.push(`**Forecast**: ${evt.forecast}`);
    }
    if (evt.previous && evt.previous.trim() !== '') {
      lines.push(`**Prev**: ${evt.previous}`);
    }
    if (lines.length > 0) {
      embed.addFields({ name: evt.title || 'No Title', value: lines.join('\n'), inline: false });
    } else {
      embed.addFields({ name: evt.title || 'No Title', value: "No updated data available", inline: false });
    }
  });
  return embed;
}

export async function sendNotificationEmbed(embed: EmbedBuilder): Promise<Message | null> {
  try {
    const channel = await discordClient.channels.fetch(CHANNEL_ID) as TextChannel;
    if (!channel || !channel.isTextBased()) return null;
    return await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending notification embed:', error);
    return null;
  }
}
