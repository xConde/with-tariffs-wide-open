import './globalSetup';
import { waitForInitialSetup } from './globalSetup';
import { initializeDiscordBot } from './discordBot';
import './scheduler';
import { schedulePeriodicCleanup } from './utils/cacheCleanup';
import { setupGracefulShutdown, registerCleanupHandler } from './utils/shutdown';
import { startHeartbeat, stopHeartbeat } from './utils/healthCheck';
import { validateChannelsOnStartup } from './utils/channelValidation';

let cleanupInterval: NodeJS.Timeout;
let heartbeatInterval: NodeJS.Timeout;

async function startApp() {
  try {
    setupGracefulShutdown();

    await waitForInitialSetup();
    console.log('Initial setup complete');

    await initializeDiscordBot();
    console.log(`Current date: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`);

    await validateChannelsOnStartup(
      process.env.DISCORD_CHANNEL_ID || '',
      process.env.FALLBACK_CHANNEL_ID
    );

    cleanupInterval = schedulePeriodicCleanup();
    registerCleanupHandler(() => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
    });
    console.log('Periodic cache cleanup scheduled');

    heartbeatInterval = startHeartbeat();
    registerCleanupHandler(() => {
      stopHeartbeat();
    });

    console.log('Application started.');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

startApp();
