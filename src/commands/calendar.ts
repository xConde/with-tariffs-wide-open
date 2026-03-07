import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getStoredEvents, saveEvents } from '../storage';
import { scrapeEconomicCalendar } from '../scraper';
import { CalendarEvent } from '../models/event';
import { DATES_PER_PAGE, EMBED_COLOR_DEFAULT, SOURCE_TIMEZONE, DISPLAY_TIMEZONE, CALENDAR_CACHE_MAX_SIZE } from '../config/constants';
import { formatTimeWithTimezone } from '../utils/timezoneDisplay';
import { parse } from 'date-fns';
import { parseDateHeader, normalizeMarketWatchMonth, fixTimeString } from '../utils/dateParser';
import { createLogger } from '../utils/logger';
export { parseDateHeader };

const log = createLogger('calendar');

declare global {
  var calendarCache: Map<string, { pages: string[][]; currentPage: number; timestamp: number }>;
}
globalThis.calendarCache = globalThis.calendarCache || new Map();

export function isDateOld(dateStr: string): boolean {
  const parsed = parseDateHeader(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed < today;
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!isDateOld(e.date)) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)?.push(e);
    }
  }
  return map;
}

export function getEventDetails(evt: CalendarEvent): string {
  const details: string[] = [];
  if (evt.actual?.trim()) {
    details.push(`A: ${evt.actual.trim()}`);
  }
  if (evt.forecast?.trim()) {
    details.push(`F: ${evt.forecast.trim()}`);
  }
  if (evt.previous?.trim()) {
    details.push(`P: ${evt.previous.trim()}`);
  }
  return details.join(' | ');
}

export function formatEventTime(evt: CalendarEvent): string {
  try {
    const parts = evt.date.split(',');
    const rawDayMonth = parts[1]?.trim() || '';
    const dayMonth = normalizeMarketWatchMonth(rawDayMonth);
    const currentYear = new Date().getFullYear();
    const timeET = fixTimeString(evt.time);
    const dateStr = `${dayMonth} ${currentYear} ${timeET}`;
    const eventDate = parse(dateStr, 'MMMM d yyyy h:mm a', new Date());
    if (SOURCE_TIMEZONE === DISPLAY_TIMEZONE) {
      return `**${evt.time}**`;
    }
    return `**${formatTimeWithTimezone(evt.time, eventDate)}**`;
  } catch {
    return `**${evt.time}**`;
  }
}

export function buildDateBlocks(grouped: Map<string, CalendarEvent[]>): string[] {
  const sortedDates = Array.from(grouped.keys()).sort(
    (a, b) => parseDateHeader(a).getTime() - parseDateHeader(b).getTime()
  );
  const blocks: string[] = [];
  for (const dateHeading of sortedDates) {
    const evts = grouped.get(dateHeading) || [];
    let block = `**${dateHeading}**\n`;
    for (const evt of evts) {
      const details = getEventDetails(evt);
      const timeDisplay = formatEventTime(evt);
      block += details
        ? `• ${timeDisplay} - ${evt.title} (${details})\n`
        : `• ${timeDisplay} - ${evt.title}\n`;
    }
    blocks.push(block.trim());
  }
  return blocks;
}

export function chunkDateBlocks(blocks: string[]): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < blocks.length; i += DATES_PER_PAGE) {
    pages.push(blocks.slice(i, i + DATES_PER_PAGE));
  }
  return pages;
}

export function buildCalendarEmbed(pageBlocks: string[], pageIndex: number, totalPages: number): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Economic Calendar').setFooter({ text: `Page ${pageIndex + 1} of ${totalPages}` }).setColor(EMBED_COLOR_DEFAULT);
  for (const block of pageBlocks) {
    const lines = block.split('\n');
    const headingLine = lines[0] || 'No Date';
    const rest = lines.slice(1).join('\n');
    embed.addFields({ name: headingLine, value: rest || '\u200B' });
  }
  return embed;
}

export const calendarCommand = {
  data: new SlashCommandBuilder().setName('calendar').setDescription('Shows upcoming economic calendar events'),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      let events = await getStoredEvents();
      let shouldDefer = events.length === 0;

      if (shouldDefer && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }

      if (events.length === 0) {
        events = await scrapeEconomicCalendar();
        if (events.length > 0) {
          await saveEvents(events);
        }
      }

      if (events.length === 0) {
        const msg = 'No calendar events found.';
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(msg);
        } else {
          await interaction.reply(msg);
        }
        return;
      }

      const grouped = groupEventsByDate(events);
      if (grouped.size === 0) {
        const noDataMsg = 'No upcoming events found.';
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(noDataMsg);
        } else {
          await interaction.reply(noDataMsg);
        }
        return;
      }

      const dateBlocks = buildDateBlocks(grouped);
      const pages = chunkDateBlocks(dateBlocks);
      const totalPages = pages.length;
      let currentPage = 0;
      const embed = buildCalendarEmbed(pages[currentPage], currentPage, totalPages);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('calendar_prev').setLabel('Previous page').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('calendar_next').setLabel('Next page').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1)
      );

      const message = interaction.deferred || interaction.replied
        ? await interaction.editReply({ embeds: [embed], components: [row] })
        : await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

      if (globalThis.calendarCache.size >= CALENDAR_CACHE_MAX_SIZE) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, entry] of globalThis.calendarCache) {
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            oldestKey = key;
          }
        }
        if (oldestKey) globalThis.calendarCache.delete(oldestKey);
      }
      globalThis.calendarCache.set(message.id, { pages, currentPage, timestamp: Date.now() });
    } catch (error) {
      log.error('Error in /calendar command', { error: String(error) });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('An error occurred while fetching the calendar events.');
      } else {
        await interaction.reply({ content: 'An error occurred while fetching the calendar events.', ephemeral: true });
      }
    }
  },
};
