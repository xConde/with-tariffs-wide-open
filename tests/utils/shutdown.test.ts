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

    it('calls process.exit(0) on successful shutdown', async () => {
      const mod = loadModule();

      mod.setupGracefulShutdown();
      await registeredHandlers['SIGTERM']();

      expect(mockExit).toHaveBeenCalledWith(0);
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
  });
});
