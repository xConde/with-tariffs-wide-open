#!/usr/bin/env ts-node
import 'dotenv/config';
import { generateNotificationTriggerEvents, saveTestData } from '../utils/testDataGenerator';
import { addMinutes } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

async function main() {
  console.log('Notification Trigger Test Setup\n');

  const events = generateNotificationTriggerEvents();

  // Calculate FAKE_DATE to use: treat current local time as EST, convert to UTC
  const now = new Date();
  const fakeDateUTC = fromZonedTime(now, 'America/New_York');

  console.log('Step-by-step instructions:\n');
  console.log('1. This script generates events 31 minutes from now');
  console.log('2. 30-minute notification will trigger in ~1 minute');
  console.log('3. 1-minute notification will trigger in ~30 minutes');
  console.log('4. Post-event update will trigger ~31 minutes after that\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('FAKE_DATE to use (current time in EST):');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   ${fakeDateUTC.toISOString()}\n`);

  console.log('Copy and run this command:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`   FAKE_DATE=${fakeDateUTC.toISOString()} npm run start\n`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Save events
  await saveTestData(events);

  const firstEvent = events[0];
  console.log('Setup complete!\n');
  console.log('Generated Events:');
  events.forEach((evt, i) => {
    console.log(`   ${i + 1}. ${evt.time} - ${evt.title}`);
  });
  console.log('');

  console.log('Timeline:');
  console.log('   [T+0s]   Bot starts');
  console.log('   [T+60s]  30-minute notification sent ');
  console.log('   [T+30m]  1-minute notification sent ');
  console.log('   [T+31.5m] Event occurs');
  console.log('   [T+33m]  Post-event update with actuals \n');

  console.log('Watch Discord channel for:');
  console.log('   1. Yellow embed: "Events — 30-Minutes Alert"');
  console.log('   2. Orange embed: "Events — 1-Minute Alert"');
  console.log('   3. Blue/Green/Red embed: "Event Results" (with actuals)\n');

  console.log('Tip: The bot will scrape MarketWatch after ~31 minutes');
  console.log('   to get actual values and update the notification.\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
