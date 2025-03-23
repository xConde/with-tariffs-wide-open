import { updateCalendarEvents } from './scheduler';
import { getTimezoneOffset } from 'date-fns-tz';

if (process.env.FAKE_DATE) {
  const fakeLocal = new Date(process.env.FAKE_DATE);
  const offsetMs = getTimezoneOffset('America/New_York', fakeLocal);
  const fakeUtc = new Date(fakeLocal.getTime() - offsetMs);

  const OriginalDate = Date;
  global.Date = class extends OriginalDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args[0] === undefined) {
        super(fakeUtc.getTime());
      } else {
        super(...args);
      }
    }
    static now(): number {
      return fakeUtc.getTime();
    }
  } as typeof Date;

  console.log(
    `Set fake date: ${fakeUtc.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`
  );
}

if (process.env.RESCRAPE === '1') {
  (async () => {
    console.log('Manual rescrape enabled. Running updateCalendarEvents...');
    try {
      await updateCalendarEvents();
      console.log('Manual rescrape completed.');
    } catch (error) {
      console.error('Error during manual rescrape:', error);
    }
  })();
}

const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CHANNEL_ID', 'CLIENT_ID'];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
