#!/usr/bin/env ts-node
import 'dotenv/config';
import { getStoredEvents } from '../storage';
import { formatInTimeZone } from 'date-fns-tz';
import { DISPLAY_TIMEZONE } from '../config/constants';

async function main() {
  console.log('📊 Viewing Stored Test Data\n');
  console.log(`Display Timezone: ${DISPLAY_TIMEZONE}\n`);

  const events = await getStoredEvents();

  if (events.length === 0) {
    console.log('⚠️  No events found in storage.');
    console.log('💡 Run "npm run test:generate-data" to create test data');
    return;
  }

  console.log(`Found ${events.length} events:\n`);

  let currentDate = '';
  let eventCount = 0;

  for (const event of events) {
    if (event.date !== currentDate) {
      if (currentDate) console.log(''); // Blank line between days
      currentDate = event.date;
      console.log(`\x1b[1m${event.date}\x1b[0m`);
    }

    eventCount++;
    const details: string[] = [];

    if (event.actual?.trim()) details.push(`A: ${event.actual}`);
    if (event.forecast?.trim()) details.push(`F: ${event.forecast}`);
    if (event.previous?.trim()) details.push(`P: ${event.previous}`);

    const detailsStr = details.length > 0 ? ` (${details.join(' | ')})` : '';
    console.log(`  ${event.time.padEnd(10)} - ${event.title}${detailsStr}`);
  }

  console.log(`\n✅ Total: ${eventCount} events across ${getUniqueDates(events).length} days`);
}

function getUniqueDates(events: any[]): string[] {
  return [...new Set(events.map(e => e.date))];
}

main().catch(err => {
  console.error('❌ Error viewing data:', err);
  process.exit(1);
});
