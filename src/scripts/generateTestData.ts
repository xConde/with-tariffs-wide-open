#!/usr/bin/env ts-node
import 'dotenv/config';
import { generateTestEvents, generatePastEventsWithActuals, generateYearRolloverTestData, saveTestData } from '../utils/testDataGenerator';

const command = process.argv[2] || 'standard';

async function main() {
  console.log('Test Data Generator for Economic Calendar Bot\n');

  switch (command) {
    case 'standard':
    case 'future':
      console.log('Generating standard future events (14 days ahead)...');
      const futureEvents = generateTestEvents(14);
      await saveTestData(futureEvents);
      console.log(`\nGenerated ${futureEvents.length} events across 14 days`);
      console.log('Use "npm run test:view-data" to see the results');
      break;

    case 'past':
      console.log('Generating past events with actuals (for notification testing)...');
      const pastEvents = generatePastEventsWithActuals(2);
      await saveTestData(pastEvents);
      console.log(`\nGenerated ${pastEvents.length} past events with actual values`);
      console.log('These events have beat/miss scenarios for testing notifications');
      break;

    case 'rollover':
      console.log('Generating year rollover test data (Dec/Jan)...');
      const rolloverEvents = generateYearRolloverTestData();
      await saveTestData(rolloverEvents);
      console.log(`\nGenerated ${rolloverEvents.length} events for year rollover testing`);
      console.log('Tests December events and January next-year events');
      break;

    case 'mixed':
      console.log('Generating mixed dataset (future + past)...');
      const future = generateTestEvents(7);
      const past = generatePastEventsWithActuals(1);
      await saveTestData([...past, ...future]);
      console.log(`\nGenerated ${past.length} past + ${future.length} future events`);
      break;

    case 'help':
      console.log('Available commands:');
      console.log('  npm run test:generate-data [type]');
      console.log('\nTypes:');
      console.log('  standard  - Generate 14 days of future events (default)');
      console.log('  past      - Generate past events with actuals for notification testing');
      console.log('  rollover  - Generate Dec/Jan events for year rollover testing');
      console.log('  mixed     - Generate both past and future events');
      console.log('  help      - Show this help message');
      console.log('\nExamples:');
      console.log('  npm run test:generate-data');
      console.log('  npm run test:generate-data past');
      console.log('  npm run test:generate-data rollover');
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "npm run test:generate-data help" for available commands');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error generating test data:', err);
  process.exit(1);
});
