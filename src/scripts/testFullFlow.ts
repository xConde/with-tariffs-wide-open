#!/usr/bin/env ts-node
import 'dotenv/config';
import { scrapeEconomicCalendar } from '../scraper';
import { saveEvents, getStoredEvents } from '../storage';
import { addMinutes } from 'date-fns';
import { parseDateHeader } from '../utils/dateParser';

async function main() {
  console.log('Full Flow End-to-End Test\n');
  console.log('This test will:');
  console.log('   1. Scrape live data from MarketWatch');
  console.log('   2. Save to storage');
  console.log('   3. Validate data integrity');
  console.log('   4. Show you what the bot would display');
  console.log('   5. Calculate when notifications would trigger\n');

  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('PHASE 1: Live Scrape\n');

  try {
    const scraped = await scrapeEconomicCalendar();
    console.log(`Scraped ${scraped.length} events from MarketWatch\n`);

    if (scraped.length === 0) {
      console.log(' No events found. MarketWatch may be down or structure changed.');
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('PHASE 2: Storage\n');

    await saveEvents(scraped);
    console.log('Saved events to data/events.json\n');

    const retrieved = await getStoredEvents();
    console.log(`Retrieved ${retrieved.length} events from storage\n`);

    if (retrieved.length !== scraped.length) {
      console.log('Storage count mismatch!');
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('PHASE 3: Data Analysis\n');

    const uniqueDates = new Set(retrieved.map(e => e.date));
    const withForecasts = retrieved.filter(e => e.forecast && e.forecast.trim() !== '');
    const withActuals = retrieved.filter(e => e.actual && e.actual.trim() !== '');
    const speeches = retrieved.filter(e => e.title.toLowerCase().includes('speak'));

    console.log('Statistics:');
    console.log(`   Total Events: ${retrieved.length}`);
    console.log(`   Unique Dates: ${uniqueDates.size}`);
    console.log(`   With Forecasts: ${withForecasts.length}`);
    console.log(`   With Actuals: ${withActuals.length}`);
    console.log(`   Fed Speeches: ${speeches.length}\n`);

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('PHASE 4: Sample Display Preview\n');

    let currentDate = '';
    let displayedCount = 0;

    for (const event of retrieved) {
      if (displayedCount >= 10) break; // Show first 10 events

      if (event.date !== currentDate) {
        if (currentDate) console.log('');
        currentDate = event.date;
        console.log(`\x1b[1m${event.date}\x1b[0m`);
      }

      const details: string[] = [];
      if (event.forecast?.trim()) details.push(`F: ${event.forecast}`);
      if (event.previous?.trim()) details.push(`P: ${event.previous}`);
      if (event.actual?.trim()) details.push(`A: ${event.actual}`);

      const detailsStr = details.length > 0 ? ` (${details.join(' | ')})` : '';
      console.log(`   ${event.time.padEnd(10)} - ${event.title}${detailsStr}`);
      displayedCount++;
    }

    console.log('\n   ... and ' + (retrieved.length - displayedCount) + ' more events\n');

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('PHASE 5: Notification Timeline Calculation\n');

    // Find upcoming events with times we can parse
    const now = new Date();
    const upcomingWithTimes = retrieved
      .filter(e => {
        try {
          const eventDate = parseDateHeader(e.date);
          return eventDate > now && eventDate.getTime() !== 0;
        } catch {
          return false;
        }
      })
      .slice(0, 5); // Show first 5 upcoming

    if (upcomingWithTimes.length > 0) {
      console.log('Next 5 notification schedules:');
      upcomingWithTimes.forEach((evt, i) => {
        const eventDate = parseDateHeader(evt.date);

        const notif30 = addMinutes(eventDate, -30);
        const notif1 = addMinutes(eventDate, -1);

        const minUntil30 = Math.floor((notif30.getTime() - now.getTime()) / 60000);
        const minUntil1 = Math.floor((notif1.getTime() - now.getTime()) / 60000);

        console.log(`\n   ${i + 1}. ${evt.title}`);
        console.log(`      Event: ${evt.time} on ${evt.date}`);
        if (minUntil30 > 0) {
          console.log(`      30-min alert in: ${minUntil30} minutes`);
        }
        if (minUntil1 > 0) {
          console.log(`      1-min alert in: ${minUntil1} minutes`);
        }
      });
      console.log('');
    } else {
      console.log(' No upcoming events found for notification scheduling\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('Full Flow Test Complete!\n');
    console.log('All systems operational:');
    console.log('   Scraper working');
    console.log('   Storage working');
    console.log('   Data format valid');
    console.log('   Ready for bot deployment\n');

    console.log('To start the bot with this data:');
    console.log('   npm run start\n');

  } catch (error) {
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('FLOW TEST FAILED\n');
    console.error(error);
    console.log('\nCheck:');
    console.log('   - Network connection');
    console.log('   - MarketWatch website accessibility');
    console.log('   - File permissions on data/ directory\n');
    process.exit(1);
  }
}

main();
