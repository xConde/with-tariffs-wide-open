import { EmbedBuilder, ColorResolvable } from 'discord.js';
import { CalendarEvent } from '../models/event';

function predictBeat(actual: string, forecast: string): 'beat' | 'miss' | 'neutral' {
  const a = parseFloat(actual.replace(/[^0-9.]/g, ''));
  const f = parseFloat(forecast.replace(/[^0-9.]/g, ''));
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

  const lines: string[] = [];
  groupEvents.forEach(evt => {
    const bullet = `• **${evt.title}**`;
    const detailsParts: string[] = [];
    if (evt.forecast && evt.forecast.trim() !== '') {
      detailsParts.push(`Forecast: ${evt.forecast.trim()}`);
    }
    if (evt.previous && evt.previous.trim() !== '') {
      detailsParts.push(`Prev: ${evt.previous.trim()}`);
    }
    const detailsLine = detailsParts.length > 0 ? detailsParts.join(' | ') : '';
    lines.push(bullet + (detailsLine ? `\n${detailsLine}` : ''));
  });
  if (lines.length > 0) {
    embed.addFields({ name: '', value: lines.join('\n\n'), inline: false });
  } else {
    embed.addFields({ name: '', value: 'No data available', inline: false });
  }
  return embed;
}

export function buildUpdatedNotificationEmbed(groupEvents: CalendarEvent[]): EmbedBuilder {
  let embedColor: ColorResolvable = 0x7289da;
  if (groupEvents.length === 1) {
    const evt = groupEvents[0];
    const prediction = predictBeat(evt.actual || '', evt.forecast || '');
    embedColor = prediction === 'beat' ? 0x2ecc71 : prediction === 'miss' ? 0xe74c3c : 0x7289da;
  }
  const embed = new EmbedBuilder().setColor(embedColor).setTitle('Event Results');

  const lines: string[] = [];
  groupEvents.forEach(evt => {
    const bullet = `• **${evt.title}**`;
    const evtLines: string[] = [];
    if (evt.actual && evt.actual.trim() !== '') {
      const prediction = predictBeat(evt.actual, evt.forecast || '');
      evtLines.push(`Actual: ${evt.actual.trim()} ${getBeatMissIndicator(prediction)}`);
    }
    if (evt.forecast && evt.forecast.trim() !== '') {
      evtLines.push(`Forecast: ${evt.forecast.trim()}`);
    }
    if (evt.previous && evt.previous.trim() !== '') {
      evtLines.push(`Prev: ${evt.previous.trim()}`);
    }
    const details = evtLines.join('\n');
    lines.push(bullet + (details ? `\n${details}` : ''));
  });
  if (lines.length > 0) {
    embed.addFields({ name: '', value: lines.join('\n\n'), inline: false });
  } else {
    embed.addFields({ name: '', value: 'No updated data available', inline: false });
  }
  return embed;
}
