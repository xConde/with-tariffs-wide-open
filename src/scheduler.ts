import cron from 'node-cron';
import { scrapeEconomicCalendar } from './scraper';
import { saveEvents } from './storage';
import { refreshNotifications } from './notifier';
import { DAILY_SCRAPE_SCHEDULE, SCRAPER_MAX_RETRIES, SCRAPER_RETRY_DELAY_MS } from './config/constants';
import { sendScraperFailureAlert } from './utils/alerting';
import { shouldAcceptScrapedData } from './utils/dataValidation';

let isUpdating = false;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function updateCalendarEvents(): Promise<void> {
  if (isUpdating) {
    console.log('Calendar update already in progress, skipping.');
    return;
  }

  isUpdating = true;
  let lastError: Error | null = null;

  try {
    for (let attempt = 1; attempt <= SCRAPER_MAX_RETRIES; attempt++) {
      try {
        console.log(`Scraping calendar events (attempt ${attempt}/${SCRAPER_MAX_RETRIES})...`);
        const events = await scrapeEconomicCalendar();

        if (events.length > 0 && shouldAcceptScrapedData(events)) {
          await saveEvents(events);
          await refreshNotifications();
          console.log(`Events updated and notifications refreshed (${events.length} events).`);
          return;
        } else if (events.length > 0 && !shouldAcceptScrapedData(events)) {
          console.warn('Scraped data rejected by validation. Keeping existing data.');
          throw new Error('Invalid scraped data - keeping old data');
        } else {
          console.log('Scrape returned no events.');
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Error during scheduled update (attempt ${attempt}/${SCRAPER_MAX_RETRIES}):`, error);

        if (attempt < SCRAPER_MAX_RETRIES) {
          console.log(`Retrying in ${SCRAPER_RETRY_DELAY_MS / 1000} seconds...`);
          await delay(SCRAPER_RETRY_DELAY_MS);
        }
      }
    }

    console.error(`Failed to update calendar after ${SCRAPER_MAX_RETRIES} attempts. Last error:`, lastError);

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
  console.log(`Daily scraper scheduled (cron: ${DAILY_SCRAPE_SCHEDULE})`);
}
