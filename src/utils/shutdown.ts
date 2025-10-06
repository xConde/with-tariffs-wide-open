import { discordClient } from '../discordBot';

let isShuttingDown = false;
const cleanupHandlers: Array<() => void | Promise<void>> = [];

/**
 * Registers a cleanup handler to be called on graceful shutdown
 */
export function registerCleanupHandler(handler: () => void | Promise<void>): void {
  cleanupHandlers.push(handler);
}

/**
 * Performs graceful shutdown of the application
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;
  console.log(`\nReceived ${signal}, starting graceful shutdown...`);

  try {
    console.log('Clearing notification timeouts...');
    if (globalThis.notificationTimeouts) {
      globalThis.notificationTimeouts.forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      globalThis.notificationTimeouts.clear();
    }

    console.log('Clearing calendar cache...');
    if (globalThis.calendarCache) {
      globalThis.calendarCache.clear();
    }

    console.log('Running registered cleanup handlers...');
    for (const handler of cleanupHandlers) {
      try {
        await handler();
      } catch (error) {
        console.error('Error in cleanup handler:', error);
      }
    }

    console.log('Closing Discord client...');
    if (discordClient) {
      discordClient.destroy();
    }

    console.log('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * Sets up signal handlers for graceful shutdown
 */
export function setupGracefulShutdown(): void {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}
