import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Stable mock log instance — every call to createLogger() returns the same object
// so tests can assert on warn/error spies regardless of how many times it's called.
const mockLog = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock logger to suppress console noise across all module loads
jest.mock('../src/utils/logger', () => ({
  createLogger: () => mockLog,
}));

// Mock scheduler to prevent real scraping in every test
const mockUpdateCalendarEvents = jest.fn<() => Promise<void>>();
jest.mock('../src/scheduler', () => ({
  updateCalendarEvents: mockUpdateCalendarEvents,
}));

describe('globalSetup', () => {
  let savedEnv: NodeJS.ProcessEnv;
  let savedDate: typeof Date;

  beforeEach(() => {
    jest.resetModules();
    mockUpdateCalendarEvents.mockReset();
    mockUpdateCalendarEvents.mockResolvedValue(undefined);

    // Snapshot env and Date before each test
    savedEnv = { ...process.env };
    savedDate = global.Date;

    // Strip the vars we control so each test starts clean
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_CHANNEL_ID;
    delete process.env.CLIENT_ID;
    delete process.env.FAKE_DATE;
    delete process.env.RESCRAPE;
  });

  afterEach(() => {
    // Restore Date (FAKE_DATE tests replace it on global)
    global.Date = savedDate;

    // Restore env
    // Remove any keys added during the test
    for (const key of Object.keys(process.env)) {
      if (!(key in savedEnv)) {
        delete process.env[key];
      }
    }
    // Restore keys that were present before
    for (const [key, value] of Object.entries(savedEnv)) {
      process.env[key] = value;
    }
  });

  // ---------------------------------------------------------------------------
  // validateEnvironment()
  // ---------------------------------------------------------------------------

  describe('validateEnvironment()', () => {
    it('succeeds when all required vars are set', async () => {
      process.env.DISCORD_TOKEN = 'tok';
      process.env.DISCORD_CHANNEL_ID = 'chan';
      process.env.CLIENT_ID = 'cid';

      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      expect(() => validateEnvironment()).not.toThrow();
    });

    it('throws listing all missing vars when none are set', async () => {
      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      expect(() => validateEnvironment()).toThrow(
        /Missing required environment variables:.*DISCORD_TOKEN.*DISCORD_CHANNEL_ID.*CLIENT_ID/
      );
    });

    it('throws listing only the missing vars when some are set', async () => {
      process.env.DISCORD_TOKEN = 'tok';
      // DISCORD_CHANNEL_ID and CLIENT_ID deliberately absent

      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      let caught: Error | undefined;
      try {
        validateEnvironment();
      } catch (e) {
        caught = e as Error;
      }

      expect(caught).toBeDefined();
      expect(caught!.message).toContain('DISCORD_CHANNEL_ID');
      expect(caught!.message).toContain('CLIENT_ID');
      expect(caught!.message).not.toContain('DISCORD_TOKEN');
    });
  });

  // ---------------------------------------------------------------------------
  // FAKE_DATE patching
  // ---------------------------------------------------------------------------

  describe('FAKE_DATE', () => {
    it('patches Date constructor when FAKE_DATE is set', async () => {
      // Use a fixed date string; globalSetup interprets it as local ET time
      // and converts to UTC internally, so we just verify the no-arg constructor
      // returns something close to the fake date rather than the real time.
      const fakeIso = '2025-06-15T10:00:00.000Z';
      process.env.FAKE_DATE = fakeIso;

      await jest.isolateModulesAsync(async () => {
        await import('../src/globalSetup');
      });

      const fakeMs = new Date(fakeIso).getTime();
      const nowMs = new Date().getTime();

      // The no-arg constructor should be within a few seconds of the fake date
      // (getTimezoneOffset shifts it slightly, but it will NOT be near real time).
      const realNow = savedDate.now();
      // The patched Date() must be far from real now (>1 day apart)
      expect(Math.abs(nowMs - realNow)).toBeGreaterThan(24 * 60 * 60 * 1000);

      // Date.now() must also return the fake timestamp (within ET offset tolerance ~5h)
      const fiveHoursMs = 5 * 60 * 60 * 1000;
      expect(Math.abs(Date.now() - fakeMs)).toBeLessThan(fiveHoursMs);
    });

    it('Date.now() returns the fake timestamp', async () => {
      const fakeIso = '2025-06-15T10:00:00.000Z';
      process.env.FAKE_DATE = fakeIso;

      await jest.isolateModulesAsync(async () => {
        await import('../src/globalSetup');
      });

      const fakeMs = new Date(fakeIso).getTime();
      const fiveHoursMs = 5 * 60 * 60 * 1000;
      expect(Math.abs(Date.now() - fakeMs)).toBeLessThan(fiveHoursMs);
    });

    it('literal date string argument is not affected by FAKE_DATE', async () => {
      process.env.FAKE_DATE = '2025-06-15T10:00:00.000Z';

      await jest.isolateModulesAsync(async () => {
        await import('../src/globalSetup');
      });

      // Use UTC getters — the string '2025-01-01T12:00:00.000Z' is unambiguously
      // 2025-01-01 in UTC regardless of the local timezone offset.
      const literal = new Date('2025-01-01T12:00:00.000Z');
      expect(literal.getUTCFullYear()).toBe(2025);
      expect(literal.getUTCMonth()).toBe(0); // January
      expect(literal.getUTCDate()).toBe(1);
    });

    it('does NOT patch Date when FAKE_DATE is not set', async () => {
      // FAKE_DATE is not set (stripped in beforeEach)
      await jest.isolateModulesAsync(async () => {
        await import('../src/globalSetup');
      });

      const before = savedDate.now();
      const nowMs = new Date().getTime();
      const after = savedDate.now();

      // The no-arg constructor should return a value within the real time window
      expect(nowMs).toBeGreaterThanOrEqual(before);
      expect(nowMs).toBeLessThanOrEqual(after + 1000);
    });
  });

  // ---------------------------------------------------------------------------
  // validateEnvironment() — optional var warnings
  // ---------------------------------------------------------------------------

  describe('validateEnvironment() optional var warnings', () => {
    beforeEach(() => {
      // Ensure required vars are present so validateEnvironment() doesn't throw
      process.env.DISCORD_TOKEN = 'tok';
      process.env.DISCORD_CHANNEL_ID = 'chan';
      process.env.CLIENT_ID = 'cid';
      // Reset the shared mock log's warn spy before each test
      mockLog.warn.mockClear();
    });

    it('warns for invalid DISPLAY_TIMEZONE', async () => {
      process.env.DISPLAY_TIMEZONE = 'Not/A/Timezone';

      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      validateEnvironment();
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid DISPLAY_TIMEZONE')
      );
    });

    it('warns for invalid LOG_LEVEL', async () => {
      process.env.LOG_LEVEL = 'verbose';

      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      validateEnvironment();
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid LOG_LEVEL')
      );
    });

    it('warns for invalid FAKE_DATE', async () => {
      process.env.FAKE_DATE = 'not-a-date';

      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      validateEnvironment();
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid FAKE_DATE')
      );
    });

    it('warns for invalid ADMIN_USER_ID', async () => {
      process.env.ADMIN_USER_ID = 'not-a-snowflake';

      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      validateEnvironment();
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid ADMIN_USER_ID')
      );
    });

    it('produces no warnings when all optional vars are valid', async () => {
      process.env.DISPLAY_TIMEZONE = 'America/New_York';
      process.env.LOG_LEVEL = 'debug';
      process.env.FAKE_DATE = '2025-06-15T10:00:00.000Z';
      process.env.ADMIN_USER_ID = '123456789012345678';

      let validateEnvironment!: () => void;
      await jest.isolateModulesAsync(async () => {
        ({ validateEnvironment } = await import('../src/globalSetup'));
      });

      validateEnvironment();
      expect(mockLog.warn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // RESCRAPE
  // ---------------------------------------------------------------------------

  describe('RESCRAPE', () => {
    it('calls updateCalendarEvents when RESCRAPE=1', async () => {
      process.env.RESCRAPE = '1';

      let waitForInitialSetup!: () => Promise<void>;
      await jest.isolateModulesAsync(async () => {
        ({ waitForInitialSetup } = await import('../src/globalSetup'));
      });

      await waitForInitialSetup();

      expect(mockUpdateCalendarEvents).toHaveBeenCalledTimes(1);
    });

    it('does NOT call updateCalendarEvents when RESCRAPE is not set', async () => {
      // RESCRAPE absent (stripped in beforeEach)

      let waitForInitialSetup!: () => Promise<void>;
      await jest.isolateModulesAsync(async () => {
        ({ waitForInitialSetup } = await import('../src/globalSetup'));
      });

      await waitForInitialSetup();

      expect(mockUpdateCalendarEvents).not.toHaveBeenCalled();
    });

    it('propagates error thrown by updateCalendarEvents', async () => {
      process.env.RESCRAPE = '1';
      mockUpdateCalendarEvents.mockRejectedValue(new Error('scrape failed'));

      let waitForInitialSetup!: () => Promise<void>;
      await jest.isolateModulesAsync(async () => {
        ({ waitForInitialSetup } = await import('../src/globalSetup'));
      });

      await expect(waitForInitialSetup()).rejects.toThrow('scrape failed');
    });
  });
});
