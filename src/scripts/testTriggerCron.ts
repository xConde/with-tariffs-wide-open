#!/usr/bin/env ts-node
import 'dotenv/config';
import { generateCronTriggerEvents, saveTestData } from '../utils/testDataGenerator';

async function main() {
  console.log('Cron Job Trigger Test Setup\n');

  const { events, fakeDateISO } = generateCronTriggerEvents();

  console.log('Step-by-step instructions:\n');
  console.log('1. This script will generate test events');
  console.log('2. Set FAKE_DATE environment variable');
  console.log('3. Start the bot - cron will trigger in ~60 seconds');
  console.log('4. Watch for scraper execution at 3:00 AM (fake time)\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('FAKE_DATE to set (cron triggers in ~60 seconds):');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   ${fakeDateISO}\n`);

  console.log('Copy and run this command:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   FAKE_DATE=${fakeDateISO} npm run start\n`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Save initial events
  await saveTestData(events);

  console.log('Setup complete!\n');
  console.log('What will happen:');
  console.log('   [T+0s]  Bot starts at fake time (2:59 AM EST)');
  console.log('   [T+60s] Cron job triggers (3:00 AM EST)');
  console.log('   [T+61s] Scraper executes and fetches MarketWatch data');
  console.log('   [T+65s] New events saved, notifications rescheduled\n');

  console.log('Watch for these log messages:');
  console.log('   - "Scraping calendar events (attempt 1/3)..."');
  console.log('   - "Events updated and notifications refreshed (X events)."');
  console.log('   - "Scheduled notification for..." (multiple times)\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
