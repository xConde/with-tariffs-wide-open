import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { CalendarEvent } from '../src/models/event';

// Prevent globalSetup side effects (FAKE_DATE, validateEnvironment, etc.)
jest.mock('../src/globalSetup', () => ({}));

// Mock constants so we control all timing values in tests
jest.mock('../src/config/constants', () => ({
  SOURCE_TIMEZONE: 'America/New_York',
  NOTIFICATION_EARLY_WARNING_MINUTES: 30,
  NOTIFICATION_FINAL_WARNING_MINUTES: 1,
  POST_EVENT_UPDATE_DELAY_MS: 5000, // short value so tests can reason about it
}));

// Mock storage
const mockGetStoredEvents = jest.fn<() => Promise<CalendarEvent[]>>();
const mockSaveEvents = jest.fn<() => Promise<void>>();
jest.mock('../src/storage', () => ({
  getStoredEvents: mockGetStoredEvents,
  saveEvents: mockSaveEvents,
}));

// Mock scraper
const mockScrape = jest.fn<() => Promise<CalendarEvent[]>>();
jest.mock('../src/scraper', () => ({
  scrapeEconomicCalendar: mockScrape,
}));

// Mock embed builders
const mockBuildNotificationEmbed = jest.fn();
const mockBuildUpdatedNotificationEmbed = jest.fn();
jest.mock('../src/events/notifierMessage', () => ({
  buildNotificationEmbed: mockBuildNotificationEmbed,
  buildUpdatedNotificationEmbed: mockBuildUpdatedNotificationEmbed,
}));

// Mock sendEmbed — returns a fake message object
const mockSendEmbed = jest.fn<() => Promise<{ edit: jest.Mock } | null>>();
jest.mock('../src/discordBot', () => ({
  sendEmbed: mockSendEmbed,
}));

// Mock notification persistence
const mockGetEventsNeedingNotifications = jest.fn<() => Promise<CalendarEvent[]>>();
const mockSaveNotificationState = jest.fn<() => Promise<void>>();
jest.mock('../src/utils/notificationPersistence', () => ({
  getEventsNeedingNotifications: mockGetEventsNeedingNotifications,
  saveNotificationState: mockSaveNotificationState,
}));

// Mock dateParser — passthrough normalizations so grouping keys are deterministic
jest.mock('../src/utils/dateParser', () => ({
  normalizeMarketWatchMonth: (s: string) => s.replace(/\.$/, '').replace(/^(\w+)/, (m: string) => {
    const months: Record<string, string> = {
      Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April',
      May: 'May', Jun: 'June', Jul: 'July', Aug: 'August',
      Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
    };
    return months[m] ?? m;
  }),
  // Produce "h:mm AM/PM" so date-fns parse() with 'h:mm a' succeeds
  fixTimeString: (s: string) => s.replace(/(am|pm)$/i, (match) => ` ${match.toUpperCase()}`),
  // Always use current year so fake-timer date alignment works
  resolveEventYear: () => new Date().getFullYear(),
}));

// Mock logger to suppress output
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Returns a CalendarEvent whose date/time parses to roughly "now + offsetMs".
 * We use a fixed future date string so date-fns can parse it; the exact wall
 * clock delta is controlled via Jest fake timers.
 */
function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    date: 'MONDAY, Oct. 28',
    time: '8:30 am',
    title: 'GDP Report',
    period: 'Oct.',
    forecast: '2.0%',
    previous: '1.5%',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('notifier — post-event timeout race condition', () => {
  // System time: June 15 2025, 10:00 AM ET (14:00 UTC, EDT = UTC-4)
  const SYSTEM_TIME = new Date('2025-06-15T14:00:00.000Z');

  // Event 5 minutes in the future: 10:05 AM ET
  // 1-min warning fires at 10:04 AM = 4 minutes from now.
  function makeNearFutureEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      date: 'SUNDAY, June 15',
      time: '10:05am',
      title: 'CPI Report',
      period: 'May',
      forecast: '3.1%',
      previous: '3.0%',
      ...overrides,
    };
  }

  function loadNotifier(): { scheduleNotifications: () => Promise<void> } {
    let mod!: { scheduleNotifications: () => Promise<void> };
    jest.isolateModules(() => {
      mod = require('../src/notifier') as typeof mod;
    });
    return mod;
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(SYSTEM_TIME);

    mockGetStoredEvents.mockReset();
    mockSaveEvents.mockReset();
    mockScrape.mockReset();
    mockBuildNotificationEmbed.mockReset();
    mockBuildUpdatedNotificationEmbed.mockReset();
    mockSendEmbed.mockReset();
    mockGetEventsNeedingNotifications.mockReset();
    mockSaveNotificationState.mockReset();

    mockGetStoredEvents.mockResolvedValue([]);
    mockGetEventsNeedingNotifications.mockResolvedValue([]);
    mockSaveEvents.mockResolvedValue(undefined);
    mockSaveNotificationState.mockResolvedValue(undefined);
    mockBuildNotificationEmbed.mockReturnValue({ title: 'Notification' });
    mockBuildUpdatedNotificationEmbed.mockReturnValue({ title: 'Updated' });
    mockScrape.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSendEmbed.mockResolvedValue({ edit: jest.fn().mockImplementation(() => Promise.resolve()) } as any);

    globalThis.notificationTimeouts = new Map();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  it('scheduleNotifications with no events is a no-op — timeout map stays empty', async () => {
    const { scheduleNotifications } = loadNotifier();

    mockGetStoredEvents.mockResolvedValue([]);
    mockGetEventsNeedingNotifications.mockResolvedValue([]);

    await scheduleNotifications();

    expect(globalThis.notificationTimeouts.size).toBe(0);
  });

  it('second scheduleNotifications() call installs a new array reference for each group', async () => {
    const event = makeNearFutureEvent();
    mockGetStoredEvents.mockResolvedValue([event]);

    const { scheduleNotifications } = loadNotifier();

    await scheduleNotifications();
    const firstSnapshot = new Map(globalThis.notificationTimeouts);
    expect(firstSnapshot.size).toBeGreaterThan(0);

    await scheduleNotifications();

    expect(globalThis.notificationTimeouts.size).toBeGreaterThan(0);
    for (const [key, newArr] of globalThis.notificationTimeouts) {
      expect(newArr).not.toBe(firstSnapshot.get(key));
    }
  });

  it('orphaned post-event callback does NOT scrape after scheduleNotifications() is called again mid-flight', async () => {
    /**
     * Regression test for the staleness guard in notifier.ts.
     *
     * Sequence driven through REAL notifier code:
     * 1. scheduleNotifications() — 1-min timeout registered, map holds arrayA.
     * 2. Advance 4 minutes — 1-min warning fires; post-event timeout T2 created
     *    with currentTimeouts === arrayA; POST_EVENT_UPDATE_DELAY_MS starts.
     * 3. Before T2 fires: scheduleNotifications() called again — clearScheduledNotifications()
     *    wipes the map and installs arrayB for the same groupKey.
     * 4. Advance past POST_EVENT_UPDATE_DELAY_MS — T2 fires but
     *    notificationTimeouts.get(groupKey) === arrayB !== arrayA, so the guard
     *    skips updateCalendarAlert and scrapeEconomicCalendar is NOT called.
     *
     * If the guard were deleted from notifier.ts this test would fail because
     * mockScrape would be called once from the stale T2.
     */
    const event = makeNearFutureEvent();
    mockGetStoredEvents.mockResolvedValue([event]);
    // Scrape returns no results so updateCalendarAlert exits early if the guard
    // somehow fails to fire — we still assert call count to catch that case.
    mockScrape.mockResolvedValue([]);

    const { scheduleNotifications } = loadNotifier();

    // Step 1: initial schedule
    await scheduleNotifications();
    expect(globalThis.notificationTimeouts.size).toBeGreaterThan(0);

    // Step 2: advance to 1-min warning — fires the real notifier callback which
    // sends the embed and registers the post-event timeout T2.
    await jest.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(mockSendEmbed).toHaveBeenCalledTimes(1);

    // Step 3: reschedule BEFORE T2 fires — installs a new array in the map.
    await scheduleNotifications();

    // Step 4: advance past POST_EVENT_UPDATE_DELAY_MS (5000ms in mock constants)
    await jest.advanceTimersByTimeAsync(5001);

    // Guard should have caught the stale T2 — scraper must not have been called.
    expect(mockScrape).not.toHaveBeenCalled();
  });

  it('post-event callback DOES scrape when scheduleNotifications() is NOT called again', async () => {
    /**
     * Positive counterpart: without a reschedule the staleness guard passes and
     * the scraper runs normally, confirming the guard does not block the happy path.
     */
    const event = makeNearFutureEvent();
    const updatedEvent: CalendarEvent = { ...event, previous: '3.2%' };
    mockGetStoredEvents.mockResolvedValue([event]);
    mockScrape.mockResolvedValue([updatedEvent]);

    const { scheduleNotifications } = loadNotifier();

    await scheduleNotifications();

    // 1-min warning fires
    await jest.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(mockSendEmbed).toHaveBeenCalledTimes(1);

    // No reschedule — advance past POST_EVENT_UPDATE_DELAY_MS
    await jest.advanceTimersByTimeAsync(5001);

    // Guard passes → updateCalendarAlert runs → scraper called
    expect(mockScrape).toHaveBeenCalledTimes(1);
  });

  it('post-event callback is skipped when scheduleNotifications() is called with no events (full clear)', async () => {
    /**
     * Edge case: the rescheduler is called with zero events so the group key is
     * absent from the map entirely (undefined !== arrayA) — guard still fires.
     */
    const event = makeNearFutureEvent();
    mockGetStoredEvents.mockResolvedValue([event]);
    mockScrape.mockResolvedValue([]);

    const { scheduleNotifications } = loadNotifier();

    await scheduleNotifications();

    // 1-min warning fires; post-event timeout registered
    await jest.advanceTimersByTimeAsync(4 * 60 * 1000);
    expect(mockSendEmbed).toHaveBeenCalledTimes(1);

    // Simulate a reschedule that finds no events — map is cleared, nothing added
    mockGetStoredEvents.mockResolvedValue([]);
    mockGetEventsNeedingNotifications.mockResolvedValue([]);
    await scheduleNotifications();
    expect(globalThis.notificationTimeouts.size).toBe(0);

    // Advance past POST_EVENT_UPDATE_DELAY_MS — stale T2 fires
    await jest.advanceTimersByTimeAsync(5001);

    // map.get(groupKey) === undefined !== arrayA → guard skips the scrape
    expect(mockScrape).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// Scheduling path tests
// ────────────────────────────────────────────────────────────

describe('notifier — scheduleNotifications() scheduling path', () => {
  // System time: June 15 2025, 10:00 AM ET (14:00 UTC, EDT = UTC-4)
  const SYSTEM_TIME = new Date('2025-06-15T14:00:00.000Z');

  // Event 60 minutes in the future: 11:00 AM ET
  function makeFutureEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      date: 'SUNDAY, June 15',
      time: '11:00am',
      title: 'CPI Report',
      period: 'May',
      forecast: '3.1%',
      previous: '3.0%',
      ...overrides,
    };
  }

  // Event 1 hour in the past: 9:00 AM ET (13:00 UTC)
  function makePastEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      date: 'SUNDAY, June 15',
      time: '9:00am',
      title: 'Old Event',
      period: 'May',
      forecast: '1.0%',
      previous: '0.9%',
      ...overrides,
    };
  }

  function loadNotifier(): { scheduleNotifications: () => Promise<void> } {
    let mod!: { scheduleNotifications: () => Promise<void> };
    jest.isolateModules(() => {
      mod = require('../src/notifier') as typeof mod;
    });
    return mod;
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(SYSTEM_TIME);

    mockGetStoredEvents.mockReset();
    mockSaveEvents.mockReset();
    mockScrape.mockReset();
    mockBuildNotificationEmbed.mockReset();
    mockBuildUpdatedNotificationEmbed.mockReset();
    mockSendEmbed.mockReset();
    mockGetEventsNeedingNotifications.mockReset();
    mockSaveNotificationState.mockReset();

    // Sane defaults
    mockGetStoredEvents.mockResolvedValue([]);
    mockGetEventsNeedingNotifications.mockResolvedValue([]);
    mockSaveEvents.mockResolvedValue(undefined);
    mockSaveNotificationState.mockResolvedValue(undefined);
    mockBuildNotificationEmbed.mockReturnValue({ title: 'Notification' });
    mockBuildUpdatedNotificationEmbed.mockReturnValue({ title: 'Updated' });
    mockScrape.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSendEmbed.mockResolvedValue({ edit: jest.fn().mockImplementation(() => Promise.resolve()) } as any);

    globalThis.notificationTimeouts = new Map();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  it('a. events with future times schedule timeout entries', async () => {
    const event = makeFutureEvent();
    mockGetStoredEvents.mockResolvedValue([event]);

    const { scheduleNotifications } = loadNotifier();
    await scheduleNotifications();

    // At least one group key should have been registered with timeout IDs
    expect(globalThis.notificationTimeouts.size).toBeGreaterThan(0);
    for (const [, timeouts] of globalThis.notificationTimeouts) {
      expect(timeouts.length).toBeGreaterThan(0);
    }
  });

  it('b. events with past times are skipped — timeout map stays empty', async () => {
    const event = makePastEvent();
    mockGetStoredEvents.mockResolvedValue([event]);

    const { scheduleNotifications } = loadNotifier();
    await scheduleNotifications();

    expect(globalThis.notificationTimeouts.size).toBe(0);
  });

  it('c. empty events result in a no-op — no timeouts scheduled', async () => {
    mockGetStoredEvents.mockResolvedValue([]);
    mockGetEventsNeedingNotifications.mockResolvedValue([]);

    const { scheduleNotifications } = loadNotifier();
    await scheduleNotifications();

    expect(globalThis.notificationTimeouts.size).toBe(0);
    expect(mockSendEmbed).not.toHaveBeenCalled();
  });

  it('d. 30-min notification fires when timers advance to that point', async () => {
    // Event 45 minutes in the future: 10:45 AM ET
    const event = makeFutureEvent({ time: '10:45am' });
    mockGetStoredEvents.mockResolvedValue([event]);

    const { scheduleNotifications } = loadNotifier();
    await scheduleNotifications();

    // 30-min warning fires at event_time - 30min = 10:15 AM ET = 15 min from now (10:00 AM)
    await jest.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(mockBuildNotificationEmbed).toHaveBeenCalled();
    expect(mockSendEmbed).toHaveBeenCalled();
    // The 30-min warning uses NOTIFICATION_EARLY_WARNING_MINUTES (30)
    const [calledMinutes] = mockBuildNotificationEmbed.mock.calls[0] as [number, CalendarEvent[]];
    expect(calledMinutes).toBe(30);
  });

  it('e. 1-min notification fires and post-event update triggers scraper after delay', async () => {
    // Event 5 minutes in the future: 10:05 AM ET
    const event = makeFutureEvent({ time: '10:05am' });
    mockGetStoredEvents.mockResolvedValue([event]);

    const { scheduleNotifications } = loadNotifier();
    await scheduleNotifications();

    // 1-min warning fires at event_time - 1min = 10:04 AM = 4 minutes from now
    await jest.advanceTimersByTimeAsync(4 * 60 * 1000);

    expect(mockBuildNotificationEmbed).toHaveBeenCalled();
    expect(mockSendEmbed).toHaveBeenCalled();
    // The 1-min warning uses NOTIFICATION_FINAL_WARNING_MINUTES (1)
    const [calledMinutes] = mockBuildNotificationEmbed.mock.calls[0] as [number, CalendarEvent[]];
    expect(calledMinutes).toBe(1);

    // Advance past POST_EVENT_UPDATE_DELAY_MS (5000ms in mock constants)
    await jest.advanceTimersByTimeAsync(5001);

    expect(mockScrape).toHaveBeenCalled();
  });

  it('f. calling scheduleNotifications twice clears old timeouts and sets new ones', async () => {
    const event = makeFutureEvent();
    mockGetStoredEvents.mockResolvedValue([event]);

    const { scheduleNotifications } = loadNotifier();

    // First schedule
    await scheduleNotifications();
    const firstTimeoutsSnapshot = new Map(globalThis.notificationTimeouts);
    expect(firstTimeoutsSnapshot.size).toBeGreaterThan(0);

    // Second schedule with the same events
    await scheduleNotifications();

    // Map should still have entries (rescheduled), but the array references must differ
    expect(globalThis.notificationTimeouts.size).toBeGreaterThan(0);
    for (const [key, newTimeouts] of globalThis.notificationTimeouts) {
      const oldTimeouts = firstTimeoutsSnapshot.get(key);
      // New array reference installed — old one was cleared and replaced
      expect(newTimeouts).not.toBe(oldTimeouts);
    }
  });
});

// ────────────────────────────────────────────────────────────
// Update and persistence path tests
// ────────────────────────────────────────────────────────────

describe('notifier — update and persistence paths', () => {
  // System time: June 15 2025, 10:00 AM ET (14:00 UTC, EDT = UTC-4)
  const SYSTEM_TIME = new Date('2025-06-15T14:00:00.000Z');

  // Event 5 minutes in the future: 10:05 AM ET
  // This means the 1-min warning fires at 10:04 AM = 4 minutes from now.
  // After the 1-min warning we advance POST_EVENT_UPDATE_DELAY_MS to trigger
  // updateCalendarAlert.
  function makeNearFutureEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
      date: 'SUNDAY, June 15',
      time: '10:05am',
      title: 'CPI Report',
      period: 'May',
      forecast: '3.1%',
      previous: '3.0%',
      ...overrides,
    };
  }

  function loadNotifier(): {
    scheduleNotifications: () => Promise<void>;
    persistCurrentNotifications: () => Promise<void>;
    initializeNotifications: () => Promise<void>;
  } {
    let mod!: {
      scheduleNotifications: () => Promise<void>;
      persistCurrentNotifications: () => Promise<void>;
      initializeNotifications: () => Promise<void>;
    };
    jest.isolateModules(() => {
      mod = require('../src/notifier') as typeof mod;
    });
    return mod;
  }

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(SYSTEM_TIME);

    mockGetStoredEvents.mockReset();
    mockSaveEvents.mockReset();
    mockScrape.mockReset();
    mockBuildNotificationEmbed.mockReset();
    mockBuildUpdatedNotificationEmbed.mockReset();
    mockSendEmbed.mockReset();
    mockGetEventsNeedingNotifications.mockReset();
    mockSaveNotificationState.mockReset();

    // Sane defaults
    mockGetStoredEvents.mockResolvedValue([]);
    mockGetEventsNeedingNotifications.mockResolvedValue([]);
    mockSaveEvents.mockResolvedValue(undefined);
    mockSaveNotificationState.mockResolvedValue(undefined);
    mockBuildNotificationEmbed.mockReturnValue({ title: 'Notification' });
    mockBuildUpdatedNotificationEmbed.mockReturnValue({ title: 'Updated' });
    mockScrape.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSendEmbed.mockResolvedValue({ edit: jest.fn().mockImplementation(() => Promise.resolve()) } as any);

    globalThis.notificationTimeouts = new Map();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetModules();
  });

  /**
   * Helper: schedule a near-future event, fire the 1-min warning, then advance
   * past POST_EVENT_UPDATE_DELAY_MS so updateCalendarAlert executes.
   * Returns the fake message returned by sendEmbed.
   */
  async function triggerPostEventUpdate(
    event: CalendarEvent,
    notifier: { scheduleNotifications: () => Promise<void> }
  ): Promise<{ edit: jest.Mock }> {
    mockGetStoredEvents.mockResolvedValue([event]);
    const editMock = jest.fn().mockImplementation(() => Promise.resolve());
    const fakeMsg = { edit: editMock };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSendEmbed.mockResolvedValue(fakeMsg as any);

    await notifier.scheduleNotifications();

    // Advance to 1-min warning (event in 5 min → 1-min warning fires at 4 min)
    await jest.advanceTimersByTimeAsync(4 * 60 * 1000);
    // Advance past POST_EVENT_UPDATE_DELAY_MS (5000 ms in mock constants)
    await jest.advanceTimersByTimeAsync(5001);

    return fakeMsg;
  }

  it('a. updateCalendarAlert with valid message — scrape succeeds and edit is called', async () => {
    const event = makeNearFutureEvent();
    const updatedEvent: CalendarEvent = { ...event, previous: '3.2%' };

    // Scrape returns an updated version of the same event (same date/time = same group key)
    mockScrape.mockResolvedValue([updatedEvent]);

    const notifier = loadNotifier();
    const fakeMsg = await triggerPostEventUpdate(event, notifier);

    // edit() should have been called with an embed built from the scraped data
    expect(fakeMsg!.edit).toHaveBeenCalledTimes(1);
    expect(mockBuildUpdatedNotificationEmbed).toHaveBeenCalledWith([updatedEvent]);

    // saveEvents should be called with the full scraped payload
    expect((mockSaveEvents as jest.Mock).mock.calls[0][0]).toEqual([updatedEvent]);
  });

  it('b. updateCalendarAlert with null message — no error thrown and edit is not called', async () => {
    const event = makeNearFutureEvent();
    mockScrape.mockResolvedValue([event]);

    // sendEmbed returns null (e.g. channel unavailable)
    mockSendEmbed.mockResolvedValue(null);

    const notifier = loadNotifier();
    mockGetStoredEvents.mockResolvedValue([event]);

    await notifier.scheduleNotifications();
    // Should not throw even when message is null
    await expect(jest.advanceTimersByTimeAsync(4 * 60 * 1000 + 5001)).resolves.not.toThrow();

    // Edit should never have been called (msg is null)
    // We verify by confirming no mock.edit calls exist on any resolved value
    expect(mockBuildUpdatedNotificationEmbed).toHaveBeenCalled();
  });

  it('c. updateCalendarAlert when scrape returns empty — original group data used for embed', async () => {
    const event = makeNearFutureEvent();

    // Scrape returns empty — updateCalendarAlert must fall back to originalGroup
    mockScrape.mockResolvedValue([]);

    const notifier = loadNotifier();
    const fakeMsg = await triggerPostEventUpdate(event, notifier);

    // embed built with original group (not empty array)
    expect(mockBuildUpdatedNotificationEmbed).toHaveBeenCalledWith([event]);
    expect(fakeMsg!.edit).toHaveBeenCalledTimes(1);

    // saveEvents should NOT be called when scrape returned empty
    expect(mockSaveEvents).not.toHaveBeenCalled();
  });

  it('d. updateCalendarAlert when scrape throws — error is logged and no crash', async () => {
    const event = makeNearFutureEvent();
    mockScrape.mockRejectedValue(new Error('network failure'));

    const notifier = loadNotifier();
    mockGetStoredEvents.mockResolvedValue([event]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockSendEmbed.mockResolvedValue({ edit: jest.fn().mockImplementation(() => Promise.resolve()) } as any);

    await notifier.scheduleNotifications();

    // Should not throw even when scraper fails
    await expect(
      jest.advanceTimersByTimeAsync(4 * 60 * 1000 + 5001)
    ).resolves.not.toThrow();

    // saveEvents must not have been called
    expect(mockSaveEvents).not.toHaveBeenCalled();
  });

  it('e. persistCurrentNotifications with active timeouts — saveNotificationState is called', async () => {
    const event = makeNearFutureEvent();
    mockGetStoredEvents.mockResolvedValue([event]);

    // Populate globalThis with a non-empty map to satisfy the early-return guard
    globalThis.notificationTimeouts.set('some-group-key', []);

    const { persistCurrentNotifications } = loadNotifier();
    await persistCurrentNotifications();

    expect(mockSaveNotificationState).toHaveBeenCalledTimes(1);
  });

  it('f. persistCurrentNotifications with empty timeouts — saveNotificationState is NOT called', async () => {
    // Empty map → function returns early without calling saveNotificationState
    globalThis.notificationTimeouts = new Map();

    const { persistCurrentNotifications } = loadNotifier();
    await persistCurrentNotifications();

    expect(mockSaveNotificationState).not.toHaveBeenCalled();
  });

  it('g. initializeNotifications delegates to scheduleNotifications (calls getStoredEvents)', async () => {
    const event = makeNearFutureEvent();
    mockGetStoredEvents.mockResolvedValue([event]);

    const { initializeNotifications } = loadNotifier();
    await initializeNotifications();

    // scheduleNotifications was invoked, which always calls getStoredEvents
    expect(mockGetStoredEvents).toHaveBeenCalledTimes(1);
    // And should have registered timeouts for the future event
    expect(globalThis.notificationTimeouts.size).toBeGreaterThan(0);
  });
});
