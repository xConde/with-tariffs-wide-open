import { discordClient } from '../core/discordClient';
import { createLogger } from './logger';

const log = createLogger('shutdown');

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
    log.info('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  log.info('Starting graceful shutdown', { signal });

  // Hard-kill safety net: if cleanup hangs, force exit after 10s
  setTimeout(() => process.exit(1), 10_000).unref();

  try {
    log.info('Running registered cleanup handlers');
    for (const handler of cleanupHandlers) {
      try {
        await handler();
      } catch (error) {
        log.error('Error in cleanup handler', { error: String(error) });
      }
    }

    log.info('Clearing notification timeouts');
    if (globalThis.notificationTimeouts) {
      globalThis.notificationTimeouts.forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      globalThis.notificationTimeouts.clear();
    }

    log.info('Clearing calendar cache');
    if (globalThis.calendarCache) {
      globalThis.calendarCache.clear();
    }

    log.info('Closing Discord client');
    if (discordClient) {
      discordClient.destroy();
    }

    log.info('Graceful shutdown complete');
    process.exitCode = 0;
  } catch (error) {
    log.error('Error during graceful shutdown', { error: String(error) });
    process.exitCode = 1;
  }
}

/**
 * Sets up signal handlers for graceful shutdown
 */
export function setupGracefulShutdown(): void {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Node.js docs: process state is unreliable after uncaughtException.
  // Log and exit immediately — do NOT attempt cleanup.
  process.on('uncaughtException', (error: Error) => {
    log.error('Uncaught Exception', { error: String(error) });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    log.error('Unhandled Rejection', { reason: String(reason) });
    gracefulShutdown('unhandledRejection');
  });
}
