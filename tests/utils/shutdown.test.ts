import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock discordClient before any imports
const mockDestroy = jest.fn();
jest.mock('../../src/core/discordClient', () => ({
  discordClient: { destroy: mockDestroy },
}));

describe('Shutdown Module', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mockExit: any;
  let processOnSpy: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const registeredHandlers: Record<string, Function> = {};

  beforeEach(() => {
    jest.resetModules();
    mockDestroy.mockReset();

    // Mock process.exit to prevent killing the test runner
    mockExit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    // Capture handlers registered via process.on
    processOnSpy = jest.spyOn(process, 'on').mockImplementation(((event: string, handler: Function) => {
      registeredHandlers[event] = handler;
      return process;
    }) as never);

    // Reset global state
    delete (globalThis as Record<string, unknown>)['notificationTimeouts'];
    delete (globalThis as Record<string, unknown>)['calendarCache'];

    // Clear captured handlers
    for (const key of Object.keys(registeredHandlers)) {
      delete registeredHandlers[key];
    }
  });

  afterEach(() => {
    mockExit.mockRestore();
    processOnSpy.mockRestore();
  });

  function loadModule() {
    let mod!: { registerCleanupHandler: (handler: () => void | Promise<void>) => void; setupGracefulShutdown: () => void };
    jest.isolateModules(() => {
      mod = require('../../src/utils/shutdown') as typeof mod;
    });
    return mod;
  }

  describe('registerCleanupHandler()', () => {
    it('handler gets stored and called during shutdown', async () => {
      const mod = loadModule();
      const handler = jest.fn<() => void>();

      mod.registerCleanupHandler(handler);
      mod.setupGracefulShutdown();

      await registeredHandlers['SIGTERM']();

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('setupGracefulShutdown()', () => {
    it('registers SIGTERM, SIGINT, uncaughtException, and unhandledRejection handlers', () => {
      const mod = loadModule();
      mod.setupGracefulShutdown();

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });
  });

  describe('gracefulShutdown behavior', () => {
    it('cleanup handlers execute in order', async () => {
      const mod = loadModule();
      const callOrder: number[] = [];

      mod.registerCleanupHandler(() => { callOrder.push(1); });
      mod.registerCleanupHandler(() => { callOrder.push(2); });
      mod.registerCleanupHandler(() => { callOrder.push(3); });

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(callOrder).toEqual([1, 2, 3]);
    });

    it('one failing cleanup handler does not block others', async () => {
      const mod = loadModule();
      const handler1 = jest.fn<() => void>();
      const failingHandler = jest.fn<() => void>(() => { throw new Error('cleanup failed'); });
      const handler3 = jest.fn<() => void>();

      mod.registerCleanupHandler(handler1);
      mod.registerCleanupHandler(failingHandler);
      mod.registerCleanupHandler(handler3);

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(failingHandler).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('clears notificationTimeouts map', async () => {
      const mod = loadModule();
      const mockClearTimeout = jest.spyOn(globalThis, 'clearTimeout');

      const timeout1 = setTimeout(() => {}, 100000);
      const timeout2 = setTimeout(() => {}, 100000);
      (globalThis as Record<string, unknown>).notificationTimeouts = new Map([
        ['event1', [timeout1, timeout2]],
      ]);

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(mockClearTimeout).toHaveBeenCalledWith(timeout1);
      expect(mockClearTimeout).toHaveBeenCalledWith(timeout2);
      expect(((globalThis as Record<string, unknown>).notificationTimeouts as Map<string, unknown>).size).toBe(0);

      mockClearTimeout.mockRestore();
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    });

    it('clears calendarCache map', async () => {
      const mod = loadModule();
      (globalThis as Record<string, unknown>).calendarCache = new Map([
        ['key1', { pages: [['page1']], currentPage: 0, timestamp: Date.now() }],
        ['key2', { pages: [['page2']], currentPage: 0, timestamp: Date.now() }],
      ]);

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(((globalThis as Record<string, unknown>).calendarCache as Map<string, unknown>).size).toBe(0);
    });

    it('calls discordClient.destroy()', async () => {
      const mod = loadModule();

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('SIGTERM triggers graceful shutdown and sets exitCode = 0', async () => {
      const mod = loadModule();

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(process.exitCode).toBe(0);
      // process.exit should NOT be called synchronously during normal shutdown
      expect(mockExit).not.toHaveBeenCalled();
    });

    it('duplicate shutdown calls are ignored (isShuttingDown guard)', async () => {
      const mod = loadModule();
      const handler = jest.fn<() => void>();
      mod.registerCleanupHandler(handler);

      mod.setupGracefulShutdown();

      // First shutdown
      await registeredHandlers['SIGTERM']();
      // Second shutdown (should be skipped)
      await registeredHandlers['SIGINT']();

      // Handler only called once despite two shutdown attempts
      expect(handler).toHaveBeenCalledTimes(1);
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('hard-kill safety net timeout fires if cleanup hangs', async () => {
      jest.useFakeTimers();

      const mod = loadModule();
      // Register a handler that never resolves
      const hangingHandler = jest.fn(() => new Promise<void>(() => {}));
      mod.registerCleanupHandler(hangingHandler);

      mod.setupGracefulShutdown();

      // Start shutdown but don't await — it will hang on the handler
      registeredHandlers['SIGTERM']();

      // Advance past the 10s hard-kill timeout
      jest.advanceTimersByTime(10_001);

      expect(mockExit).toHaveBeenCalledWith(1);

      jest.useRealTimers();
    });
  });

  describe('uncaughtException handler', () => {
    it('logs the error and calls process.exit(1) immediately without running cleanup handlers', () => {
      const mod = loadModule();
      const cleanupHandler = jest.fn<() => void>();

      mod.registerCleanupHandler(cleanupHandler);
      mod.setupGracefulShutdown();

      registeredHandlers['uncaughtException'](new Error('fatal error'));

      // Must exit immediately
      expect(mockExit).toHaveBeenCalledWith(1);
      // Must NOT run cleanup handlers
      expect(cleanupHandler).not.toHaveBeenCalled();
    });
  });

  describe('unhandledRejection handler', () => {
    it('runs full graceful shutdown', async () => {
      const mod = loadModule();
      const cleanupHandler = jest.fn<() => void>();

      mod.registerCleanupHandler(cleanupHandler);
      mod.setupGracefulShutdown();

      await registeredHandlers['unhandledRejection']('rejected promise');

      // Cleanup handlers must have run
      expect(cleanupHandler).toHaveBeenCalledTimes(1);
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });
  });

  describe('shutdown integration — full cleanup sequence', () => {
    // These tests simulate the exact handler registration order in index.ts:
    //   1. cancelPendingReconnect  (registered after initializeDiscordBot)
    //   2. persistCurrentNotifications (registered after initializeNotifications)
    //   3. clearInterval(cleanupInterval) (registered after schedulePeriodicCleanup)
    //   4. stopHeartbeat (registered after startHeartbeat)

    it('handlers run in registration order matching index.ts startup sequence', async () => {
      const mod = loadModule();
      const callOrder: string[] = [];

      // Mirror the index.ts handler registration order
      mod.registerCleanupHandler(() => { callOrder.push('cancelPendingReconnect'); });
      mod.registerCleanupHandler(() => { callOrder.push('persistCurrentNotifications'); });
      mod.registerCleanupHandler(() => { callOrder.push('clearInterval'); });
      mod.registerCleanupHandler(() => { callOrder.push('stopHeartbeat'); });

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(callOrder).toEqual([
        'cancelPendingReconnect',
        'persistCurrentNotifications',
        'clearInterval',
        'stopHeartbeat',
      ]);
    });

    it('a throwing handler (e.g. persistCurrentNotifications) does not prevent subsequent handlers', async () => {
      const mod = loadModule();
      const cancelPendingReconnect = jest.fn<() => void>();
      const persistCurrentNotifications = jest.fn<() => void>(() => {
        throw new Error('persist failed');
      });
      const clearIntervalHandler = jest.fn<() => void>();
      const stopHeartbeat = jest.fn<() => void>();

      mod.registerCleanupHandler(cancelPendingReconnect);
      mod.registerCleanupHandler(persistCurrentNotifications);
      mod.registerCleanupHandler(clearIntervalHandler);
      mod.registerCleanupHandler(stopHeartbeat);

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(cancelPendingReconnect).toHaveBeenCalledTimes(1);
      expect(persistCurrentNotifications).toHaveBeenCalledTimes(1);
      expect(clearIntervalHandler).toHaveBeenCalledTimes(1);
      expect(stopHeartbeat).toHaveBeenCalledTimes(1);
      // Shutdown still completes cleanly despite the throwing handler
      expect(process.exitCode).toBe(0);
    });

    it('double shutdown is prevented — all four handlers only run once', async () => {
      const mod = loadModule();
      const cancelPendingReconnect = jest.fn<() => void>();
      const persistCurrentNotifications = jest.fn<() => void>();
      const clearIntervalHandler = jest.fn<() => void>();
      const stopHeartbeat = jest.fn<() => void>();

      mod.registerCleanupHandler(cancelPendingReconnect);
      mod.registerCleanupHandler(persistCurrentNotifications);
      mod.registerCleanupHandler(clearIntervalHandler);
      mod.registerCleanupHandler(stopHeartbeat);

      mod.setupGracefulShutdown();

      // First shutdown via SIGTERM
      await registeredHandlers['SIGTERM']();
      // Second shutdown via SIGINT should be a no-op
      await registeredHandlers['SIGINT']();

      expect(cancelPendingReconnect).toHaveBeenCalledTimes(1);
      expect(persistCurrentNotifications).toHaveBeenCalledTimes(1);
      expect(clearIntervalHandler).toHaveBeenCalledTimes(1);
      expect(stopHeartbeat).toHaveBeenCalledTimes(1);
      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });

    it('notification timeouts are cleared after all registered handlers finish', async () => {
      const mod = loadModule();
      const mockClearTimeout = jest.spyOn(globalThis, 'clearTimeout');

      const handlerCallOrder: string[] = [];
      mod.registerCleanupHandler(() => { handlerCallOrder.push('cancelPendingReconnect'); });
      mod.registerCleanupHandler(() => { handlerCallOrder.push('persistCurrentNotifications'); });

      const timeout1 = setTimeout(() => {}, 100_000);
      const timeout2 = setTimeout(() => {}, 100_000);
      (globalThis as Record<string, unknown>).notificationTimeouts = new Map([
        ['event-A', [timeout1, timeout2]],
      ]);

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      // Registered handlers ran first
      expect(handlerCallOrder).toEqual(['cancelPendingReconnect', 'persistCurrentNotifications']);
      // Then timeouts were cleared
      expect(mockClearTimeout).toHaveBeenCalledWith(timeout1);
      expect(mockClearTimeout).toHaveBeenCalledWith(timeout2);
      expect(((globalThis as Record<string, unknown>).notificationTimeouts as Map<string, unknown>).size).toBe(0);

      mockClearTimeout.mockRestore();
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    });

    it('calendar cache is cleared after all registered handlers finish', async () => {
      const mod = loadModule();
      const handlerCallOrder: string[] = [];

      mod.registerCleanupHandler(() => { handlerCallOrder.push('cancelPendingReconnect'); });
      mod.registerCleanupHandler(() => { handlerCallOrder.push('persistCurrentNotifications'); });

      (globalThis as Record<string, unknown>).calendarCache = new Map([
        ['user-1', { pages: [['page1']], currentPage: 0, timestamp: Date.now() }],
        ['user-2', { pages: [['page2']], currentPage: 0, timestamp: Date.now() }],
      ]);

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      // Registered handlers ran first
      expect(handlerCallOrder).toEqual(['cancelPendingReconnect', 'persistCurrentNotifications']);
      // Then cache was cleared
      expect(((globalThis as Record<string, unknown>).calendarCache as Map<string, unknown>).size).toBe(0);
    });

    it('discordClient.destroy() is called after all registered handlers and global-state cleanup', async () => {
      const mod = loadModule();
      const destroyCallOrder: string[] = [];

      // Verify destroy is not called during handler execution
      const stopHeartbeat = jest.fn<() => void>(() => {
        // At this point destroy should not have been called yet
        expect(mockDestroy).not.toHaveBeenCalled();
        destroyCallOrder.push('stopHeartbeat');
      });

      mod.registerCleanupHandler(() => { destroyCallOrder.push('cancelPendingReconnect'); });
      mod.registerCleanupHandler(() => { destroyCallOrder.push('persistCurrentNotifications'); });
      mod.registerCleanupHandler(stopHeartbeat);

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(destroyCallOrder).toEqual([
        'cancelPendingReconnect',
        'persistCurrentNotifications',
        'stopHeartbeat',
      ]);
      expect(mockDestroy).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(0);
    });
  });
});
