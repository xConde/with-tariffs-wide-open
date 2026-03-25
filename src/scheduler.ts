import cron from 'node-cron';
import { scrapeEconomicCalendar } from './scraper';
import { saveEvents, updateScrapeTimestamp, getLastScrapeTime } from './storage';
import { refreshNotifications } from './notifier';
import { DAILY_SCRAPE_SCHEDULE, SCRAPER_MAX_RETRIES, SCRAPER_RETRY_DELAY_MS, STALE_DATA_CRITICAL_MS } from './config/constants';
import { sendScraperFailureAlert } from './utils/alerting';
import { shouldAcceptScrapedData } from './utils/dataValidation';
import { createLogger } from './utils/logger';
import { ScraperError } from './errors';

const log = createLogger('scheduler');

let isUpdating = false;
let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function updateCalendarEvents(): Promise<void> {
  if (isUpdating) {
    log.info('Calendar update already in progress, skipping');
    return;
  }

  isUpdating = true;
  let lastError: Error | null = null;

  try {
    for (let attempt = 1; attempt <= SCRAPER_MAX_RETRIES; attempt++) {
      try {
        log.info('Scraping calendar events', { attempt, maxRetries: SCRAPER_MAX_RETRIES });
        const events = await scrapeEconomicCalendar();

        if (events.length > 0 && shouldAcceptScrapedData(events)) {
          await saveEvents(events);
          await updateScrapeTimestamp();
          await refreshNotifications();
          log.info('Events updated and notifications refreshed', { count: events.length });
          return;
        } else if (events.length > 0 && !shouldAcceptScrapedData(events)) {
          log.warn('Scraped data rejected by validation, keeping existing data');
          throw new ScraperError('Invalid scraped data - keeping old data', false);
        } else {
          log.info('Scrape returned no events');
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log.error('Error during scheduled update', { attempt, maxRetries: SCRAPER_MAX_RETRIES, error: String(error) });

        if (lastError instanceof ScraperError && !lastError.retryable) {
          log.error('Non-retryable scraper error — aborting retry loop', { error: lastError.message });
          break;
        }

        if (attempt < SCRAPER_MAX_RETRIES) {
          log.info('Retrying scrape', { delaySeconds: SCRAPER_RETRY_DELAY_MS / 1000 });
          await delay(SCRAPER_RETRY_DELAY_MS);
        }
      }
    }

    log.error('Failed to update calendar after max attempts', { attempts: SCRAPER_MAX_RETRIES, error: String(lastError) });

    if (lastError) {
      const lastScrape = await getLastScrapeTime();
      if (lastScrape !== null && Date.now() - lastScrape > STALE_DATA_CRITICAL_MS) {
        await sendScraperFailureAlert(SCRAPER_MAX_RETRIES, lastError, 'CRITICAL: Data is over 48 hours stale');
      } else {
        await sendScraperFailureAlert(SCRAPER_MAX_RETRIES, lastError);
      }
    }
  } finally {
    isUpdating = false;
  }
}

/**
 * Starts the daily scraper scheduler
 */
export function startScheduler(): void {
  scheduledTask = cron.schedule(DAILY_SCRAPE_SCHEDULE, updateCalendarEvents);
  log.info('Daily scraper scheduled', { cron: DAILY_SCRAPE_SCHEDULE });
}

/**
 * Stops the daily scraper scheduler
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    log.info('Scheduler stopped');
  }
}
