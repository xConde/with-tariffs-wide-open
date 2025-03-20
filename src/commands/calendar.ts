import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getStoredEvents, saveEvents } from '../storage';
import { scrapeEconomicCalendar } from '../scraper';
import { CalendarEvent } from '../models/event';

declare global {
  var calendarCache: Map<string, { pages: string[][]; currentPage: number }>;
}
globalThis.calendarCache = globalThis.calendarCache || new Map();

const DATES_PER_PAGE = 5;

function parseDateHeader(header: string): Date {
  try {
    const parts = header.split(',');
    const dayMonth = parts[1]?.trim() || '';
    const year = new Date().getFullYear();
    return new Date(`${dayMonth} ${year}`);
  } catch {
    return new Date(0);
  }
}

function isDateOld(dateStr: string): boolean {
  const parsed = parseDateHeader(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);
  return parsed < today;
}

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (!isDateOld(e.date)) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)?.push(e);
    }
  }
  return map;
}

function getEventDetails(evt: CalendarEvent): string {
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

function buildDateBlocks(grouped: Map<string, CalendarEvent[]>): string[] {
  const sortedDates = Array.from(grouped.keys()).sort(
    (a, b) => parseDateHeader(a).getTime() - parseDateHeader(b).getTime()
  );
  const blocks: string[] = [];
  for (const dateHeading of sortedDates) {
    const evts = grouped.get(dateHeading) || [];
    let block = `**${dateHeading}**\n`;
    for (const evt of evts) {
      const details = getEventDetails(evt);
      block += details 
        ? `• **${evt.time}** - ${evt.title} (${details})\n`
        : `• **${evt.time}** - ${evt.title}\n`;
    }
    blocks.push(block.trim());
  }
  return blocks;
}

function chunkDateBlocks(blocks: string[]): string[][] {
  const pages: string[][] = [];
  for (let i = 0; i < blocks.length; i += DATES_PER_PAGE) {
    pages.push(blocks.slice(i, i + DATES_PER_PAGE));
  }
  return pages;
}

export function buildCalendarEmbed(pageBlocks: string[], pageIndex: number, totalPages: number): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Economic Calendar').setFooter({ text: `Page ${pageIndex + 1} of ${totalPages}` }).setColor(0x7289da);
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
      if (events.length === 0) {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
        }
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
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
      }
      const message = await interaction.editReply({ embeds: [embed], components: [row] });
      globalThis.calendarCache.set(message.id, { pages, currentPage });
    } catch (error) {
      console.error('Error in /calendar command:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('An error occurred while fetching the calendar events.');
      } else {
        await interaction.reply({ content: 'An error occurred while fetching the calendar events.', ephemeral: true });
      }
    }
  },
};
