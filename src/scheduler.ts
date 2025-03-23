import cron from 'node-cron';
import { scrapeEconomicCalendar } from './scraper';
import { saveEvents } from './storage';
import { refreshNotifications } from './notifier';

export async function updateCalendarEvents(): Promise<void> {
  try {
    const events = await scrapeEconomicCalendar();
    if (events.length > 0) {
      await saveEvents(events);
      await refreshNotifications();
      console.log('Events updated and notifications refreshed.');
    } else {
      console.log('Scrape returned no events.');
    }
  } catch (error) {
    console.error('Error during scheduled update:', error);
  }
}

cron.schedule('0 3 * * *', updateCalendarEvents);
