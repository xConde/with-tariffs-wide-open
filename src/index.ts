import './globalSetup';
import { waitForInitialSetup, validateEnvironment } from './globalSetup';
import { initializeDiscordBot, cancelPendingReconnect } from './discordBot';
import { startScheduler } from './scheduler';
import { initializeNotifications, persistCurrentNotifications } from './notifier';
import { schedulePeriodicCleanup } from './utils/cacheCleanup';
import { setupGracefulShutdown, registerCleanupHandler } from './utils/shutdown';
import { startHeartbeat, stopHeartbeat } from './utils/healthCheck';
import { validateChannelsOnStartup } from './utils/channelValidation';
import { createLogger } from './utils/logger';

const log = createLogger('app');

let cleanupInterval: NodeJS.Timeout;
let heartbeatInterval: NodeJS.Timeout;

async function startApp() {
  try {
    setupGracefulShutdown();
    validateEnvironment();

    await waitForInitialSetup();
    log.info('Initial setup complete');

    await initializeDiscordBot();
    registerCleanupHandler(() => cancelPendingReconnect());
    log.info('Current date', { date: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) });

    await validateChannelsOnStartup(
      process.env.DISCORD_CHANNEL_ID || '',
      process.env.FALLBACK_CHANNEL_ID
    );

    startScheduler();

    await initializeNotifications();
    registerCleanupHandler(() => persistCurrentNotifications());
    log.info('Notifications scheduled');

    cleanupInterval = schedulePeriodicCleanup();
    registerCleanupHandler(() => {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
      }
    });
    log.info('Periodic cache cleanup scheduled');

    heartbeatInterval = await startHeartbeat();
    registerCleanupHandler(() => {
      stopHeartbeat();
    });

    log.info('Application started');
  } catch (error) {
    log.error('Failed to initialize application', { error: String(error) });
    process.exit(1);
  }
}

startApp();
