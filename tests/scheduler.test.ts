import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { CalendarEvent } from '../src/models/event';

// Mock constants to eliminate retry delay
jest.mock('../src/config/constants', () => ({
  ...(jest.requireActual('../src/config/constants') as Record<string, unknown>),
  SCRAPER_RETRY_DELAY_MS: 0,
}));

// Mock dependencies
const mockScrape = jest.fn<() => Promise<CalendarEvent[]>>();
jest.mock('../src/scraper', () => ({
  scrapeEconomicCalendar: mockScrape,
}));

const mockSaveEvents = jest.fn<(events: CalendarEvent[]) => Promise<void>>();
const mockUpdateScrapeTimestamp = jest.fn<() => Promise<void>>();
const mockGetLastScrapeTime = jest.fn<() => Promise<number | null>>();
jest.mock('../src/storage', () => ({
  saveEvents: mockSaveEvents,
  updateScrapeTimestamp: mockUpdateScrapeTimestamp,
  getLastScrapeTime: mockGetLastScrapeTime,
}));

const mockRefreshNotifications = jest.fn<() => Promise<void>>();
jest.mock('../src/notifier', () => ({
  refreshNotifications: mockRefreshNotifications,
}));

const mockSendScraperFailureAlert = jest.fn<(attempts: number, lastError: Error) => Promise<void>>();
jest.mock('../src/utils/alerting', () => ({
  sendScraperFailureAlert: mockSendScraperFailureAlert,
}));

const mockShouldAccept = jest.fn<(events: CalendarEvent[]) => boolean>();
jest.mock('../src/utils/dataValidation', () => ({
  shouldAcceptScrapedData: mockShouldAccept,
}));

const mockCronSchedule = jest.fn();
jest.mock('node-cron', () => ({
  schedule: mockCronSchedule,
}));

// Helper: valid event fixtures
function makeEvents(count: number): CalendarEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `MONDAY, OCT. ${i + 1}`,
    time: '8:30 am',
    title: `Event ${i + 1}`,
    period: 'Oct.',
    forecast: '1.0%',
    previous: '0.5%',
  }));
}

describe('Scheduler', () => {
  beforeEach(() => {
    jest.resetModules();
    mockScrape.mockReset();
    mockSaveEvents.mockReset();
    mockUpdateScrapeTimestamp.mockReset();
    mockGetLastScrapeTime.mockReset();
    mockRefreshNotifications.mockReset();
    mockSendScraperFailureAlert.mockReset();
    mockShouldAccept.mockReset();
    mockCronSchedule.mockReset();

    // Default: resolve to empty
    mockSaveEvents.mockResolvedValue(undefined);
    mockUpdateScrapeTimestamp.mockResolvedValue(undefined);
    mockGetLastScrapeTime.mockResolvedValue(null);
    mockRefreshNotifications.mockResolvedValue(undefined);
    mockSendScraperFailureAlert.mockResolvedValue(undefined);
  });

  // Use isolateModules to get fresh internal state (isUpdating) per test.
  // Also returns ScraperError from the same isolated module registry so that
  // instanceof checks inside the scheduler work correctly.
  function loadModule(): Promise<{
    updateCalendarEvents: () => Promise<void>;
    startScheduler: () => void;
    stopScheduler: () => void;
    ScraperError: new (message: string, retryable: boolean) => Error & { retryable: boolean };
  }> {
    return new Promise((resolve) => {
      jest.isolateModules(() => {
        const mod = require('../src/scheduler') as {
          updateCalendarEvents: () => Promise<void>;
          startScheduler: () => void;
          stopScheduler: () => void;
        };
        const errors = require('../src/errors') as {
          ScraperError: new (message: string, retryable: boolean) => Error & { retryable: boolean };
        };
        resolve({ ...mod, ScraperError: errors.ScraperError });
      });
    });
  }

  describe('updateCalendarEvents()', () => {
    it('saves events and refreshes notifications on successful scrape', async () => {
      const events = makeEvents(10);
      mockScrape.mockResolvedValue(events);
      mockShouldAccept.mockReturnValue(true);

      const mod = await loadModule();
      await mod.updateCalendarEvents();

      expect(mockScrape).toHaveBeenCalledTimes(1);
      expect(mockShouldAccept).toHaveBeenCalledWith(events);
      expect(mockSaveEvents).toHaveBeenCalledWith(events);
      expect(mockRefreshNotifications).toHaveBeenCalledTimes(1);
    });

    it('does NOT save when scrape returns empty array', async () => {
      mockScrape.mockResolvedValue([]);

      const mod = await loadModule();
      await mod.updateCalendarEvents();

      expect(mockScrape).toHaveBeenCalledTimes(1);
      expect(mockShouldAccept).not.toHaveBeenCalled();
      expect(mockSaveEvents).not.toHaveBeenCalled();
      expect(mockRefreshNotifications).not.toHaveBeenCalled();
    });

    it('rejects invalid data when shouldAcceptScrapedData returns false', async () => {
      const events = makeEvents(10);
      mockScrape.mockResolvedValue(events);
      mockShouldAccept.mockReturnValue(false);

      const mod = await loadModule();
      await mod.updateCalendarEvents();

      // Non-retryable ScraperError — should abort after first attempt
      expect(mockScrape).toHaveBeenCalledTimes(1);
      expect(mockSaveEvents).not.toHaveBeenCalled();
      expect(mockRefreshNotifications).not.toHaveBeenCalled();
      expect(mockSendScraperFailureAlert).toHaveBeenCalledTimes(1);
    });

    it('retries on scraper failure and succeeds on second attempt', async () => {
      const events = makeEvents(10);
      mockScrape
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce(events);
      mockShouldAccept.mockReturnValue(true);

      const mod = await loadModule();
      await mod.updateCalendarEvents();

      expect(mockScrape).toHaveBeenCalledTimes(2);
      expect(mockSaveEvents).toHaveBeenCalledWith(events);
      expect(mockRefreshNotifications).toHaveBeenCalledTimes(1);
      expect(mockSendScraperFailureAlert).not.toHaveBeenCalled();
    });

    it('sends failure alert after all retries exhausted', async () => {
      const error = new Error('Persistent failure');
      mockScrape.mockRejectedValue(error);

      const mod = await loadModule();
      await mod.updateCalendarEvents();

      expect(mockScrape).toHaveBeenCalledTimes(3);
      expect(mockSaveEvents).not.toHaveBeenCalled();
      expect(mockSendScraperFailureAlert).toHaveBeenCalledWith(3, error);
    });

    it('race condition guard: second concurrent call is skipped', async () => {
      const events = makeEvents(10);
      // Make first call hang until we resolve it
      let resolveFirst!: (value: CalendarEvent[]) => void;
      const firstCallPromise = new Promise<CalendarEvent[]>((resolve) => {
        resolveFirst = resolve;
      });

      mockScrape.mockReturnValueOnce(firstCallPromise).mockResolvedValueOnce(events);
      mockShouldAccept.mockReturnValue(true);

      const mod = await loadModule();

      // Start first call (will block on scrape)
      const call1 = mod.updateCalendarEvents();
      // Start second call while first is in progress
      const call2 = mod.updateCalendarEvents();

      // Second should complete immediately (skipped)
      await call2;

      // Now let first complete
      resolveFirst(events);
      await call1;

      // Only one scrape call because second was skipped
      expect(mockScrape).toHaveBeenCalledTimes(1);
      expect(mockSaveEvents).toHaveBeenCalledTimes(1);
    });

    it('aborts retry loop immediately on non-retryable ScraperError', async () => {
      const mod = await loadModule();
      mockScrape.mockRejectedValue(new mod.ScraperError('HTML structure changed', false));

      await mod.updateCalendarEvents();

      expect(mockScrape).toHaveBeenCalledTimes(1);
      expect(mockSaveEvents).not.toHaveBeenCalled();
      expect(mockSendScraperFailureAlert).toHaveBeenCalledTimes(1);
    });

    it('retries up to max on retryable ScraperError', async () => {
      const mod = await loadModule();
      mockScrape.mockRejectedValue(new mod.ScraperError('network timeout', true));

      await mod.updateCalendarEvents();

      expect(mockScrape).toHaveBeenCalledTimes(3);
      expect(mockSendScraperFailureAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('startScheduler()', () => {
    it('calls cron.schedule with the correct schedule string', async () => {
      const mod = await loadModule();
      mod.startScheduler();

      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule).toHaveBeenCalledWith(
        '0 3 * * *',
        expect.any(Function)
      );
    });
  });

  describe('stopScheduler()', () => {
    it('calls .stop() on the cron task and clears the reference', async () => {
      const mockStop = jest.fn();
      mockCronSchedule.mockReturnValue({ stop: mockStop });

      const mod = await loadModule();
      mod.startScheduler();
      mod.stopScheduler();

      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when called before startScheduler', async () => {
      const mod = await loadModule();
      // Should not throw
      expect(() => mod.stopScheduler()).not.toThrow();
    });
  });
});
