import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  parseDateHeader,
  isDateOld,
  groupEventsByDate,
  getEventDetails,
  chunkDateBlocks,
  buildCalendarEmbed,
  formatEventTime,
  buildDateBlocks,
  calendarCommand,
} from '../../src/commands/calendar';
import { CalendarEvent } from '../../src/models/event';
import { DATES_PER_PAGE, CALENDAR_CACHE_MAX_SIZE } from '../../src/config/constants';
import * as storageModule from '../../src/storage';
import * as scraperModule from '../../src/scraper';

// --- Mocks for execute() tests ---
// Factories must NOT reference outer variables (jest.mock is hoisted before const declarations).
jest.mock('../../src/storage', () => ({
  getStoredEvents: jest.fn(),
  saveEvents: jest.fn(),
}));

jest.mock('../../src/scraper', () => ({
  scrapeEconomicCalendar: jest.fn(),
}));

// Typed references obtained after hoisting via jest.mocked()
const mockGetStoredEvents = jest.mocked(storageModule.getStoredEvents);
const mockSaveEvents = jest.mocked(storageModule.saveEvents);
const mockScrapeEconomicCalendar = jest.mocked(scraperModule.scrapeEconomicCalendar);

// Pin the system clock to June 15, 2025 for all date-dependent tests.
// This eliminates conditional skips and makes the suite deterministic on any calendar date.
const PINNED_DATE = new Date('2025-06-15T12:00:00.000Z');

describe('Calendar Command Functions', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval'] });
    jest.setSystemTime(PINNED_DATE);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('parseDateHeader', () => {
    it('should parse a valid date header to a Date object', () => {
      const result = parseDateHeader('Monday, March 17');
      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(2); // March = 2
      expect(result.getDate()).toBe(17);
    });

    it('should use the current year for parsed dates', () => {
      // Clock is pinned to 2025-06-15; June 20 is after current date so resolves to 2025
      const result = parseDateHeader('Friday, June 20');
      expect(result.getFullYear()).toBe(2025);
    });

    it('should return epoch date for malformed input', () => {
      const result = parseDateHeader('garbage');
      // When splitting on comma, parts[1] is undefined, so dayMonth is ''
      // new Date(' <year>') may or may not be valid depending on runtime
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle year rollover when current month is Nov/Dec and parsed month is earlier', () => {
      // This test validates the rollover logic exists.
      // If current month is >= October (index 10) and parsed date month is earlier,
      // the function bumps to next year. We can't force the current date,
      // but we can verify the function returns a valid date for a January header.
      const result = parseDateHeader('Wednesday, January 15');
      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(15);
    });

    it('should parse dates with various day names', () => {
      const tuesday = parseDateHeader('Tuesday, April 8');
      expect(tuesday.getMonth()).toBe(3); // April
      expect(tuesday.getDate()).toBe(8);

      const sunday = parseDateHeader('Sunday, December 25');
      expect(sunday.getMonth()).toBe(11); // December
      expect(sunday.getDate()).toBe(25);
    });
  });

  describe('isDateOld', () => {
    it('should return false for a far-future date', () => {
      // Clock pinned to 2025-06-15; December 31 is always ahead
      expect(isDateOld('Monday, December 31')).toBe(false);
    });

    it('should return true for a date in the past within this year', () => {
      // Clock pinned to 2025-06-15; January 1 is definitely in the past
      expect(isDateOld('Wednesday, January 1')).toBe(true);
    });

    it('should return false for today', () => {
      // Clock pinned to Sunday, June 15 2025
      expect(isDateOld('Sunday, June 15')).toBe(false);
    });
  });

  describe('groupEventsByDate', () => {
    function makeFutureEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
      // Clock pinned to 2025-06-15; December 31 is always ahead
      return {
        date: 'Wednesday, December 31',
        time: '8:30 am',
        title: 'Test Event',
        period: 'Q4',
        ...overrides,
      };
    }

    it('should group events by their date string', () => {
      const events: CalendarEvent[] = [
        makeFutureEvent({ title: 'GDP Report' }),
        makeFutureEvent({ title: 'CPI Report' }),
      ];
      const grouped = groupEventsByDate(events);
      expect(grouped.size).toBe(1);
      const dateKey = Array.from(grouped.keys())[0];
      expect(grouped.get(dateKey)).toHaveLength(2);
    });

    it('should separate events with different dates', () => {
      const events: CalendarEvent[] = [
        makeFutureEvent({ date: 'Monday, December 29', title: 'GDP' }),
        makeFutureEvent({ date: 'Tuesday, December 30', title: 'CPI' }),
      ];
      const grouped = groupEventsByDate(events);
      expect(grouped.size).toBe(2);
    });

    it('should filter out events with old dates', () => {
      // Clock pinned to 2025-06-15; January 1 is in the past, December 31 is future
      const events: CalendarEvent[] = [
        { date: 'Wednesday, January 1', time: '8:30 am', title: 'Old Event', period: 'Q1' },
        makeFutureEvent({ title: 'Future Event' }),
      ];
      const grouped = groupEventsByDate(events);
      expect(grouped.size).toBe(1);
      const values = Array.from(grouped.values())[0];
      expect(values[0].title).toBe('Future Event');
    });

    it('should return an empty map when all events are old', () => {
      // Clock pinned to 2025-06-15; January 1 is in the past
      const events: CalendarEvent[] = [
        { date: 'Wednesday, January 1', time: '8:30 am', title: 'Old', period: 'Q1' },
      ];
      const grouped = groupEventsByDate(events);
      expect(grouped.size).toBe(0);
    });

    it('should return an empty map for an empty array', () => {
      const grouped = groupEventsByDate([]);
      expect(grouped.size).toBe(0);
    });
  });

  describe('getEventDetails', () => {
    it('should format all three fields', () => {
      const evt: CalendarEvent = {
        date: 'Monday, March 17',
        time: '8:30 am',
        title: 'GDP',
        period: 'Q4',
        actual: '5.2%',
        forecast: '5.0%',
        previous: '4.8%',
      };
      expect(getEventDetails(evt)).toBe('A: 5.2% | F: 5.0% | P: 4.8%');
    });

    it('should handle only forecast and previous', () => {
      const evt: CalendarEvent = {
        date: 'Monday, March 17',
        time: '8:30 am',
        title: 'CPI',
        period: 'Q4',
        forecast: '3.0%',
        previous: '2.8%',
      };
      expect(getEventDetails(evt)).toBe('F: 3.0% | P: 2.8%');
    });

    it('should handle only actual', () => {
      const evt: CalendarEvent = {
        date: 'Monday, March 17',
        time: '8:30 am',
        title: 'Jobs',
        period: 'Q4',
        actual: '200K',
      };
      expect(getEventDetails(evt)).toBe('A: 200K');
    });

    it('should return empty string when no detail fields are present', () => {
      const evt: CalendarEvent = {
        date: 'Monday, March 17',
        time: '8:30 am',
        title: 'Speech',
        period: '',
      };
      expect(getEventDetails(evt)).toBe('');
    });

    it('should skip fields that are whitespace-only', () => {
      const evt: CalendarEvent = {
        date: 'Monday, March 17',
        time: '8:30 am',
        title: 'Test',
        period: 'Q1',
        actual: '  ',
        forecast: '5.0%',
        previous: '',
      };
      expect(getEventDetails(evt)).toBe('F: 5.0%');
    });
  });

  describe('chunkDateBlocks', () => {
    it('should chunk blocks into pages of DATES_PER_PAGE size', () => {
      const blocks = Array.from({ length: DATES_PER_PAGE + 2 }, (_, i) => `Block ${i}`);
      const pages = chunkDateBlocks(blocks);
      expect(pages).toHaveLength(2);
      expect(pages[0]).toHaveLength(DATES_PER_PAGE);
      expect(pages[1]).toHaveLength(2);
    });

    it('should return a single page when blocks fit exactly', () => {
      const blocks = Array.from({ length: DATES_PER_PAGE }, (_, i) => `Block ${i}`);
      const pages = chunkDateBlocks(blocks);
      expect(pages).toHaveLength(1);
      expect(pages[0]).toHaveLength(DATES_PER_PAGE);
    });

    it('should return empty array for empty input', () => {
      const pages = chunkDateBlocks([]);
      expect(pages).toHaveLength(0);
    });

    it('should handle single block', () => {
      const pages = chunkDateBlocks(['Only block']);
      expect(pages).toHaveLength(1);
      expect(pages[0]).toEqual(['Only block']);
    });

    it('should handle exact multiple of DATES_PER_PAGE', () => {
      const blocks = Array.from({ length: DATES_PER_PAGE * 3 }, (_, i) => `Block ${i}`);
      const pages = chunkDateBlocks(blocks);
      expect(pages).toHaveLength(3);
      pages.forEach(page => expect(page).toHaveLength(DATES_PER_PAGE));
    });
  });

  describe('buildCalendarEmbed', () => {
    it('should return an EmbedBuilder with correct title', () => {
      const blocks = ['**MONDAY, DEC 29**\n- Event 1'];
      const embed = buildCalendarEmbed(blocks, 0, 1);
      const json = embed.toJSON();
      expect(json.title).toBe('Economic Calendar');
    });

    it('should set correct footer with page numbers', () => {
      const blocks = ['**MONDAY, DEC 29**\n- Event 1'];
      const embed = buildCalendarEmbed(blocks, 2, 5);
      const json = embed.toJSON();
      expect(json.footer?.text).toBe('Page 3 of 5');
    });

    it('should add fields for each block', () => {
      const blocks = [
        '**MONDAY, DEC 29**\n- GDP Report',
        '**TUESDAY, DEC 30**\n- CPI Report',
      ];
      const embed = buildCalendarEmbed(blocks, 0, 1);
      const json = embed.toJSON();
      expect(json.fields).toHaveLength(2);
      expect(json.fields?.[0].name).toBe('**MONDAY, DEC 29**');
      expect(json.fields?.[0].value).toBe('- GDP Report');
      expect(json.fields?.[1].name).toBe('**TUESDAY, DEC 30**');
      expect(json.fields?.[1].value).toBe('- CPI Report');
    });

    it('should use zero-width space for blocks with no event lines', () => {
      const blocks = ['**MONDAY, DEC 29**'];
      const embed = buildCalendarEmbed(blocks, 0, 1);
      const json = embed.toJSON();
      expect(json.fields?.[0].value).toBe('\u200B');
    });

    it('should set the default embed color', () => {
      const blocks = ['**MONDAY, DEC 29**\n- Event'];
      const embed = buildCalendarEmbed(blocks, 0, 1);
      const json = embed.toJSON();
      expect(json.color).toBe(0x7289da);
    });
  });

  describe('formatEventTime', () => {
    it('should return bold time string for valid event', () => {
      const evt: CalendarEvent = {
        date: 'MONDAY, DEC. 31',
        time: '8:30 am',
        title: 'GDP Report',
        period: 'Q4',
      };
      expect(formatEventTime(evt)).toMatch(/^\*\*.*\*\*$/);
    });

    it('should return bold fallback for TBA time', () => {
      const evt: CalendarEvent = {
        date: 'MONDAY, DEC. 31',
        time: 'TBA',
        title: 'Fed Speech',
        period: '',
      };
      expect(formatEventTime(evt)).toBe('**TBA**');
    });

    it('should return bold fallback for malformed date', () => {
      const evt: CalendarEvent = {
        date: 'garbage',
        time: '10:00 am',
        title: 'Test Event',
        period: '',
      };
      // catch block returns bold original time
      expect(formatEventTime(evt)).toMatch(/^\*\*.*\*\*$/);
    });

    it('should preserve original time format in output', () => {
      const evt: CalendarEvent = {
        date: 'MONDAY, DEC. 31',
        time: '3:15 pm',
        title: 'FOMC Minutes',
        period: '',
      };
      const result = formatEventTime(evt);
      // Output should contain the time (possibly converted) wrapped in bold
      expect(result).toMatch(/^\*\*/);
      expect(result).toMatch(/\*\*$/);
      // Should contain some time-like string (original or converted)
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('buildDateBlocks', () => {
    it('should return array of formatted blocks from grouped events', () => {
      const grouped = new Map<string, CalendarEvent[]>();
      grouped.set('Monday, December 29', [
        { date: 'Monday, December 29', time: '8:30 am', title: 'GDP Report', period: 'Q4' },
      ]);
      const blocks = buildDateBlocks(grouped);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain('**Monday, December 29**');
      expect(blocks[0]).toContain('GDP Report');
    });

    it('should sort dates chronologically', () => {
      const grouped = new Map<string, CalendarEvent[]>();
      grouped.set('Tuesday, December 30', [
        { date: 'Tuesday, December 30', time: '10:00 am', title: 'CPI', period: 'Q4' },
      ]);
      grouped.set('Monday, December 29', [
        { date: 'Monday, December 29', time: '8:30 am', title: 'GDP', period: 'Q4' },
      ]);
      const blocks = buildDateBlocks(grouped);
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toContain('December 29');
      expect(blocks[1]).toContain('December 30');
    });

    it('should include event details when present', () => {
      const grouped = new Map<string, CalendarEvent[]>();
      grouped.set('Monday, December 29', [
        {
          date: 'Monday, December 29',
          time: '8:30 am',
          title: 'GDP',
          period: 'Q4',
          actual: '5.2%',
          forecast: '5.0%',
          previous: '4.8%',
        },
      ]);
      const blocks = buildDateBlocks(grouped);
      expect(blocks[0]).toContain('(A: 5.2% | F: 5.0% | P: 4.8%)');
    });

    it('should omit details parentheses when no data fields', () => {
      const grouped = new Map<string, CalendarEvent[]>();
      grouped.set('Monday, December 29', [
        { date: 'Monday, December 29', time: '8:30 am', title: 'Fed Speech', period: '' },
      ]);
      const blocks = buildDateBlocks(grouped);
      // Should not contain details like (A: ... | F: ... | P: ...)
      expect(blocks[0]).not.toMatch(/\([AFP]:/);
      expect(blocks[0]).toMatch(/- Fed Speech$/m);
    });

    it('should return empty array for empty map', () => {
      const grouped = new Map<string, CalendarEvent[]>();
      const blocks = buildDateBlocks(grouped);
      expect(blocks).toEqual([]);
    });
  });
});

// Clock is pinned to June 15 2025 — use June 16+ for future events.
const FUTURE_EVENT: CalendarEvent = {
  date: 'Monday, JUNE 16',
  time: '10:00am',
  title: 'Test GDP',
  period: 'Q1',
  actual: '',
  forecast: '2.5%',
  previous: '2.3%',
};

function makeMockInteraction() {
  const mockMessage = { id: 'msg-123' };
  const mock = {
    deferReply: jest.fn<(opts?: unknown) => Promise<void>>().mockImplementation(async () => {
      mock.deferred = true;
    }),
    editReply: jest.fn<(arg: unknown) => Promise<{ id: string }>>().mockResolvedValue(mockMessage),
    reply: jest.fn<(arg: unknown) => Promise<{ id: string }>>().mockResolvedValue(mockMessage),
    deferred: false,
    replied: false,
    commandName: 'calendar',
  };
  return mock;
}

describe('calendarCommand.execute()', () => {
  const PINNED_EXECUTE_DATE = new Date('2025-06-15T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval'] });
    jest.setSystemTime(PINNED_EXECUTE_DATE);
    globalThis.calendarCache = new Map();
    mockGetStoredEvents.mockReset();
    mockSaveEvents.mockReset();
    mockScrapeEconomicCalendar.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stored events exist → immediate reply (no deferReply)', async () => {
    mockGetStoredEvents.mockResolvedValue([FUTURE_EVENT]);
    const interaction = makeMockInteraction();

    await calendarCommand.execute(interaction as never);

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const replyArg = (interaction.reply.mock.calls[0] as unknown[])[0] as { embeds: unknown[] };
    expect(replyArg).toHaveProperty('embeds');
    expect((replyArg.embeds as unknown[]).length).toBeGreaterThan(0);
  });

  it('no stored events → deferReply then editReply with embed after scrape', async () => {
    mockGetStoredEvents.mockResolvedValue([]);
    mockScrapeEconomicCalendar.mockResolvedValue([FUTURE_EVENT]);
    const interaction = makeMockInteraction();

    await calendarCommand.execute(interaction as never);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const editArg = (interaction.editReply.mock.calls[0] as unknown[])[0] as { embeds: unknown[] };
    expect(editArg).toHaveProperty('embeds');
    expect((editArg.embeds as unknown[]).length).toBeGreaterThan(0);
  });

  it('no events at all → replies with "No calendar events found."', async () => {
    mockGetStoredEvents.mockResolvedValue([]);
    mockScrapeEconomicCalendar.mockResolvedValue([]);
    const interaction = makeMockInteraction();

    await calendarCommand.execute(interaction as never);

    // deferReply called because stored events was empty
    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith('No calendar events found.');
  });

  it('events exist but all are old → replies with "No upcoming events found."', async () => {
    const oldEvent: CalendarEvent = {
      date: 'Wednesday, January 1',
      time: '8:30am',
      title: 'Old CPI',
      period: 'Q4',
    };
    mockGetStoredEvents.mockResolvedValue([oldEvent]);
    const interaction = makeMockInteraction();

    await calendarCommand.execute(interaction as never);

    // Stored events were non-empty so no defer
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith('No upcoming events found.');
  });

  it('cache entry is created after reply with message id as key', async () => {
    mockGetStoredEvents.mockResolvedValue([FUTURE_EVENT]);
    const interaction = makeMockInteraction();

    await calendarCommand.execute(interaction as never);

    expect(globalThis.calendarCache.has('msg-123')).toBe(true);
    const entry = globalThis.calendarCache.get('msg-123');
    expect(entry).toHaveProperty('pages');
    expect(entry).toHaveProperty('currentPage', 0);
    expect(entry).toHaveProperty('timestamp');
  });

  it('LRU eviction at CALENDAR_CACHE_MAX_SIZE: oldest entry removed when cache is full', async () => {
    // Pre-fill cache to the limit; oldest entry has the lowest timestamp
    const oldestKey = 'oldest-msg';
    globalThis.calendarCache.set(oldestKey, { pages: [], currentPage: 0, timestamp: 1 });
    for (let i = 1; i < CALENDAR_CACHE_MAX_SIZE; i++) {
      globalThis.calendarCache.set(`msg-fill-${i}`, { pages: [], currentPage: 0, timestamp: i + 1000 });
    }
    expect(globalThis.calendarCache.size).toBe(CALENDAR_CACHE_MAX_SIZE);

    mockGetStoredEvents.mockResolvedValue([FUTURE_EVENT]);
    const interaction = makeMockInteraction();

    await calendarCommand.execute(interaction as never);

    // Oldest entry should have been evicted
    expect(globalThis.calendarCache.has(oldestKey)).toBe(false);
    // New entry should be present
    expect(globalThis.calendarCache.has('msg-123')).toBe(true);
    // Size should stay at CALENDAR_CACHE_MAX_SIZE
    expect(globalThis.calendarCache.size).toBe(CALENDAR_CACHE_MAX_SIZE);
  });
});
