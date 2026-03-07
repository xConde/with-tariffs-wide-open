import cron from 'node-cron';
import { scrapeEconomicCalendar } from './scraper';
import { saveEvents } from './storage';
import { refreshNotifications } from './notifier';
import { DAILY_SCRAPE_SCHEDULE, SCRAPER_MAX_RETRIES, SCRAPER_RETRY_DELAY_MS } from './config/constants';
import { sendScraperFailureAlert } from './utils/alerting';
import { shouldAcceptScrapedData } from './utils/dataValidation';
import { createLogger } from './utils/logger';

const log = createLogger('scheduler');

let isUpdating = false;

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
          await refreshNotifications();
          log.info('Events updated and notifications refreshed', { count: events.length });
          return;
        } else if (events.length > 0 && !shouldAcceptScrapedData(events)) {
          log.warn('Scraped data rejected by validation, keeping existing data');
          throw new Error('Invalid scraped data - keeping old data');
        } else {
          log.info('Scrape returned no events');
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log.error('Error during scheduled update', { attempt, maxRetries: SCRAPER_MAX_RETRIES, error: String(error) });

        if (attempt < SCRAPER_MAX_RETRIES) {
          log.info('Retrying scrape', { delaySeconds: SCRAPER_RETRY_DELAY_MS / 1000 });
          await delay(SCRAPER_RETRY_DELAY_MS);
        }
      }
    }

    log.error('Failed to update calendar after max attempts', { attempts: SCRAPER_MAX_RETRIES, error: String(lastError) });

    if (lastError) {
      await sendScraperFailureAlert(SCRAPER_MAX_RETRIES, lastError);
    }
  } finally {
    isUpdating = false;
  }
}

/**
 * Starts the daily scraper scheduler
 */
export function startScheduler(): void {
  cron.schedule(DAILY_SCRAPE_SCHEDULE, updateCalendarEvents);
  log.info('Daily scraper scheduled', { cron: DAILY_SCRAPE_SCHEDULE });
}
