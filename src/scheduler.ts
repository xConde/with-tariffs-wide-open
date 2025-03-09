import cron from 'node-cron';
import { scrapeEconomicCalendar } from './scraper';
import { saveEvents } from './storage';
import { refreshNotifications } from './notifier';

cron.schedule('0 3 * * *', async () => {
  try {
    const events = await scrapeEconomicCalendar();
    if (events.length > 0) {
      await saveEvents(events);
      await refreshNotifications();
      console.log('Daily scrape successful.');
    } else {
      console.log('Daily scrape returned no events.');
    }
  } catch (error) {
    console.error('Error during daily scrape:', error);
  }
});
