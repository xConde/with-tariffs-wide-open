import './globalSetup';
import { waitForInitialSetup } from './globalSetup';
import { initializeDiscordBot } from './discordBot';
import './scheduler';
import { schedulePeriodicCleanup } from './utils/cacheCleanup';
import { setupGracefulShutdown, registerCleanupHandler } from './utils/shutdown';

let cleanupInterval: NodeJS.Timeout;

async function startApp() {
  try {
    setupGracefulShutdown();

    await waitForInitialSetup();
    console.log('Initial setup complete');

    await initializeDiscordBot();
    console.log(`Current date: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`);

    cleanupInterval = schedulePeriodicCleanup();
    registerCleanupHandler(() => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
    });
    console.log('Periodic cache cleanup scheduled');

    console.log('Application started.');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

startApp();
