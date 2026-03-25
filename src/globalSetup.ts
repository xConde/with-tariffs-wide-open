import { updateCalendarEvents } from './scheduler';
import { getTimezoneOffset } from 'date-fns-tz';
import { createLogger } from './utils/logger';

const log = createLogger('setup');

if (process.env.FAKE_DATE) {
  const fakeLocal = new Date(process.env.FAKE_DATE);
  const offsetMs = getTimezoneOffset('America/New_York', fakeLocal);
  const fakeUtc = new Date(fakeLocal.getTime() - offsetMs);

  const OriginalDate = Date;
  global.Date = class extends OriginalDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args[0] === undefined) {
        super(fakeUtc.getTime());
      } else {
        super(...args);
      }
    }
    static now(): number {
      return fakeUtc.getTime();
    }
  } as typeof Date;

  log.info(
    `Set fake date: ${fakeUtc.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
  );
}

let rescrapePromise: Promise<void> | null = null;

if (process.env.RESCRAPE === '1') {
  rescrapePromise = (async () => {
    log.info('Manual rescrape enabled. Running updateCalendarEvents...');
    try {
      await updateCalendarEvents();
      log.info('Manual rescrape completed.');
    } catch (error) {
      log.error('Error during manual rescrape', { error: String(error) });
      throw error;
    }
  })();
}

export async function waitForInitialSetup(): Promise<void> {
  if (rescrapePromise) {
    await rescrapePromise;
  }
}

const REQUIRED_ENV_VARS = ['DISCORD_TOKEN', 'DISCORD_CHANNEL_ID', 'CLIENT_ID'];

/**
 * Validates that all required environment variables are set.
 * Call this explicitly during startup rather than at module load time,
 * so shutdown handlers are registered before any process.exit().
 */
export function validateEnvironment(): void {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const DISPLAY_TIMEZONE = process.env.DISPLAY_TIMEZONE;
  if (DISPLAY_TIMEZONE) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: DISPLAY_TIMEZONE });
    } catch {
      log.warn(`Invalid DISPLAY_TIMEZONE: "${DISPLAY_TIMEZONE}" — using default`);
    }
  }

  const LOG_LEVEL = process.env.LOG_LEVEL;
  if (LOG_LEVEL && !['debug', 'info', 'warn', 'error'].includes(LOG_LEVEL)) {
    log.warn(`Invalid LOG_LEVEL: "${LOG_LEVEL}" — using default "info"`);
  }

  const FAKE_DATE = process.env.FAKE_DATE;
  if (FAKE_DATE && isNaN(new Date(FAKE_DATE).getTime())) {
    log.warn(`Invalid FAKE_DATE: "${FAKE_DATE}" — not a valid ISO 8601 date`);
  }

  const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
  if (ADMIN_USER_ID && !/^\d{17,20}$/.test(ADMIN_USER_ID)) {
    log.warn(`Invalid ADMIN_USER_ID: "${ADMIN_USER_ID}" — should be a 17-20 digit Discord snowflake`);
  }
}
