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
}
