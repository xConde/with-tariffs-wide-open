import cron from 'node-cron';
import { scrapeEconomicCalendar } from './scraper';
import { saveEvents } from './storage';
import { refreshNotifications } from './notifier';
import { DAILY_SCRAPE_SCHEDULE } from './config/constants';
import { sendScraperFailureAlert } from './utils/alerting';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 60000; // 1 minute

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function updateCalendarEvents(): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Scraping calendar events (attempt ${attempt}/${MAX_RETRIES})...`);
      const events = await scrapeEconomicCalendar();

      if (events.length > 0) {
        await saveEvents(events);
        await refreshNotifications();
        console.log(`Events updated and notifications refreshed (${events.length} events).`);
        return;
      } else {
        console.log('Scrape returned no events.');
        return;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Error during scheduled update (attempt ${attempt}/${MAX_RETRIES}):`, error);

      if (attempt < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  console.error(`Failed to update calendar after ${MAX_RETRIES} attempts. Last error:`, lastError);

  if (lastError) {
    await sendScraperFailureAlert(MAX_RETRIES, lastError);
  }
}

cron.schedule(DAILY_SCRAPE_SCHEDULE, updateCalendarEvents);
