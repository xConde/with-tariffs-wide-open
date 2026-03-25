import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TextChannel, EmbedBuilder, Message } from 'discord.js';

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE any module loads
// ---------------------------------------------------------------------------

const mockFetch = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock('../src/core/discordClient', () => ({
  discordClient: {
    channels: { fetch: mockFetch },
  },
}));

jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../src/commands/calendar', () => ({
  calendarCommand: { execute: jest.fn() },
  buildCalendarEmbed: jest.fn(),
}));

const mockSendHealthAlert = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.mock('../src/utils/alerting', () => ({
  sendHealthAlert: (...args: unknown[]) => mockSendHealthAlert(...args),
}));

// ---------------------------------------------------------------------------
// Helper: create mock channel objects
// ---------------------------------------------------------------------------

function createMockChannel(overrides: { isSendable?: boolean; sendResult?: unknown; sendError?: Error } = {}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mockSend = overrides.sendError
    ? (jest.fn() as jest.Mock<(...args: any[]) => any>).mockRejectedValue(overrides.sendError)
    : (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(
        overrides.sendResult ?? ({ id: 'msg-1' } as unknown as Message)
      );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    channel: {
      isSendable: () => overrides.isSendable ?? true,
      send: mockSend,
    } as unknown as TextChannel,
    mockSend,
  };
}

// ---------------------------------------------------------------------------
// Helper: load discordBot.ts with custom env vars via isolateModules
// ---------------------------------------------------------------------------

function loadModule(envOverrides?: Record<string, string | undefined>) {
  const saved = { ...process.env };
  if (envOverrides) Object.assign(process.env, envOverrides);

  let mod!: typeof import('../src/discordBot');
  jest.isolateModules(() => {
    mod = require('../src/discordBot');
  });

  // Restore env immediately after module captures its constants
  process.env = saved;
  return mod;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discordBot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // sendEmbed
  // -----------------------------------------------------------------------
  describe('sendEmbed', () => {
    const fakeEmbed = new EmbedBuilder().setTitle('Test');

    it('sends embed to primary channel successfully and returns the Message', async () => {
      const { channel, mockSend } = createMockChannel({ sendResult: { id: 'msg-primary' } });
      mockFetch.mockResolvedValue(channel);

      const { sendEmbed } = loadModule({
        DISCORD_CHANNEL_ID: 'primary-123',
        FALLBACK_CHANNEL_ID: undefined,
      });

      const result = await sendEmbed(fakeEmbed);

      expect(mockFetch).toHaveBeenCalledWith('primary-123');
      expect(mockSend).toHaveBeenCalledWith({ embeds: [fakeEmbed] });
      expect(result).toEqual({ id: 'msg-primary' });
    });

    it('falls back when primary channel is null', async () => {
      const { channel: fallbackChannel, mockSend: fallbackSend } = createMockChannel({
        sendResult: { id: 'msg-fallback' },
      });

      mockFetch
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(fallbackChannel);

      const { sendEmbed } = loadModule({
        DISCORD_CHANNEL_ID: 'primary-123',
        FALLBACK_CHANNEL_ID: 'fallback-456',
      });

      const result = await sendEmbed(fakeEmbed);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(2, 'fallback-456');
      expect(fallbackSend).toHaveBeenCalledWith({ embeds: [fakeEmbed] });
      expect(result).toEqual({ id: 'msg-fallback' });
    });

    it('falls back when primary channel is not sendable', async () => {
      const nonSendableChannel = {
        isSendable: () => false,
        send: jest.fn(),
      } as unknown as TextChannel;

      const { channel: fallbackChannel, mockSend: fallbackSend } = createMockChannel({
        sendResult: { id: 'msg-fallback' },
      });

      mockFetch
        .mockResolvedValueOnce(nonSendableChannel)
        .mockResolvedValueOnce(fallbackChannel);

      const { sendEmbed } = loadModule({
        DISCORD_CHANNEL_ID: 'primary-123',
        FALLBACK_CHANNEL_ID: 'fallback-456',
      });

      const result = await sendEmbed(fakeEmbed);

      expect(result).toEqual({ id: 'msg-fallback' });
      expect(fallbackSend).toHaveBeenCalled();
    });

    it('falls back when primary channel.send throws', async () => {
      const { channel: primaryChannel } = createMockChannel({
        sendError: new Error('send failed'),
      });

      const { channel: fallbackChannel, mockSend: fallbackSend } = createMockChannel({
        sendResult: { id: 'msg-fallback' },
      });

      mockFetch
        .mockResolvedValueOnce(primaryChannel)
        .mockResolvedValueOnce(fallbackChannel);

      const { sendEmbed } = loadModule({
        DISCORD_CHANNEL_ID: 'primary-123',
        FALLBACK_CHANNEL_ID: 'fallback-456',
      });

      const result = await sendEmbed(fakeEmbed);

      expect(result).toEqual({ id: 'msg-fallback' });
      expect(fallbackSend).toHaveBeenCalledWith({ embeds: [fakeEmbed] });
    });

    it('returns null when primary fails and no fallback is configured', async () => {
      mockFetch.mockResolvedValueOnce(null);

      const { sendEmbed } = loadModule({
        DISCORD_CHANNEL_ID: 'primary-123',
        FALLBACK_CHANNEL_ID: undefined,
      });

      const result = await sendEmbed(fakeEmbed);

      expect(result).toBeNull();
    });

    it('returns null when both primary and fallback fail', async () => {
      const { channel: primaryChannel } = createMockChannel({
        sendError: new Error('primary fail'),
      });
      const { channel: fallbackChannel } = createMockChannel({
        sendError: new Error('fallback fail'),
      });

      mockFetch
        .mockResolvedValueOnce(primaryChannel)
        .mockResolvedValueOnce(fallbackChannel);

      const { sendEmbed } = loadModule({
        DISCORD_CHANNEL_ID: 'primary-123',
        FALLBACK_CHANNEL_ID: 'fallback-456',
      });

      const result = await sendEmbed(fakeEmbed);

      expect(result).toBeNull();
    });

    it('sends to fallback channel successfully when primary channel fetch throws', async () => {
      const { channel: fallbackChannel, mockSend: fallbackSend } = createMockChannel({
        sendResult: { id: 'msg-fallback' },
      });

      mockFetch
        .mockRejectedValueOnce(new Error('fetch primary failed'))
        .mockResolvedValueOnce(fallbackChannel);

      const { sendEmbed } = loadModule({
        DISCORD_CHANNEL_ID: 'primary-123',
        FALLBACK_CHANNEL_ID: 'fallback-456',
      });

      const result = await sendEmbed(fakeEmbed);

      expect(result).toEqual({ id: 'msg-fallback' });
      expect(fallbackSend).toHaveBeenCalledWith({ embeds: [fakeEmbed] });
    });
  });

  // -----------------------------------------------------------------------
  // cancelPendingReconnect
  // -----------------------------------------------------------------------
  // cancelPendingReconnect is a no-op: Discord.js v14 handles reconnection
  // internally via its own gateway manager. This function exists only as a
  // shutdown hook contract so callers don't need to branch on implementation.
  // -----------------------------------------------------------------------
  describe('cancelPendingReconnect', () => {
    it('cancelPendingReconnect is a no-op (Discord.js v14 handles reconnection internally)', () => {
      const { cancelPendingReconnect } = loadModule({
        DISCORD_CHANNEL_ID: 'ch-1',
      });

      expect(() => cancelPendingReconnect()).not.toThrow();
    });

    it('cancelPendingReconnect no-op contract holds when called multiple times', () => {
      const { cancelPendingReconnect } = loadModule({
        DISCORD_CHANNEL_ID: 'ch-1',
      });

      cancelPendingReconnect();
      cancelPendingReconnect();
      // No assertion needed beyond no-throw — the contract is idempotent no-op
    });
  });

  // -----------------------------------------------------------------------
  // shardDisconnect — unrecoverable close code admin alert + process.exit
  // -----------------------------------------------------------------------
  describe('shardDisconnect admin alerts', () => {
    let mockProcessExit: jest.SpiedFunction<typeof process.exit>;

    beforeEach(() => {
      mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never);
    });

    afterEach(() => {
      mockProcessExit.mockRestore();
    });

    function createShardTestClient() {
      const capturedListeners: Record<string, (...args: unknown[]) => unknown> = {};
      const mockClient = {
        channels: { fetch: mockFetch },
        on: (event: string, handler: (...args: unknown[]) => unknown) => {
          capturedListeners[event] = handler;
        },
        once: jest.fn(),
        login: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        user: { tag: 'TestBot#0001' },
      };
      return { mockClient, capturedListeners };
    }

    it('sends admin health alert for close code 4014 (disallowed intents)', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 4014 }, 0);

        expect(mockSendHealthAlert).toHaveBeenCalledWith(
          'Discord Connection',
          expect.stringContaining('4014')
        );
      });
    });

    it('sends admin alert for close code 4004 (invalid token)', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 4004 }, 0);

        expect(mockSendHealthAlert).toHaveBeenCalledWith(
          'Discord Connection',
          expect.stringContaining('4004')
        );
      });
    });

    it('calls process.exit(1) after 5 seconds for unrecoverable close code 4014', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 4014 }, 0);

        expect(mockProcessExit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(5000);
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });
    });

    it('calls process.exit(1) after 5 seconds for unrecoverable close code 4004', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 4004 }, 0);

        expect(mockProcessExit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(5000);
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });
    });

    it('does not call process.exit for recoverable close code 1001', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 1001 }, 0);

        jest.advanceTimersByTime(5000);
        expect(mockProcessExit).not.toHaveBeenCalled();
      });
    });

    it('does not send admin alert for recoverable close code 1001', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 1001 }, 0);

        expect(mockSendHealthAlert).not.toHaveBeenCalled();
      });
    });
  });

  // -----------------------------------------------------------------------
  // warn event — logs the warning message
  // -----------------------------------------------------------------------
  describe('warn event', () => {
    it('logs the warning message at warn level', async () => {
      const capturedListeners: Record<string, (...args: unknown[]) => unknown> = {};
      const mockLogWarn = jest.fn();
      const mockClient = {
        channels: { fetch: mockFetch },
        on: (event: string, handler: (...args: unknown[]) => unknown) => {
          capturedListeners[event] = handler;
        },
        once: jest.fn(),
        login: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        user: { tag: 'TestBot#0001' },
      };

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/utils/logger', () => ({
          createLogger: () => ({
            info: jest.fn(),
            warn: mockLogWarn,
            error: jest.fn(),
            debug: jest.fn(),
          }),
        }));
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['warn'] as ((message: string) => void) | undefined;
        expect(handler).toBeDefined();
        handler!('rate limit hit on route /channels/123');

        expect(mockLogWarn).toHaveBeenCalledWith(
          'Discord warning',
          { message: 'rate limit hit on route /channels/123' }
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // shardDisconnect — close codes 4010 and 4013 (newly unrecoverable)
  // -----------------------------------------------------------------------
  describe('shardDisconnect new unrecoverable close codes', () => {
    let mockProcessExit: jest.SpiedFunction<typeof process.exit>;

    beforeEach(() => {
      mockProcessExit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as () => never);
    });

    afterEach(() => {
      mockProcessExit.mockRestore();
    });

    function createShardTestClient2() {
      const capturedListeners: Record<string, (...args: unknown[]) => unknown> = {};
      const mockClient = {
        channels: { fetch: mockFetch },
        on: (event: string, handler: (...args: unknown[]) => unknown) => {
          capturedListeners[event] = handler;
        },
        once: jest.fn(),
        login: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        user: { tag: 'TestBot#0001' },
      };
      return { mockClient, capturedListeners };
    }

    it('sends admin alert and calls process.exit(1) for close code 4010 (invalid shard)', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient2();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 4010 }, 0);

        expect(mockSendHealthAlert).toHaveBeenCalledWith(
          'Discord Connection',
          expect.stringContaining('4010')
        );

        expect(mockProcessExit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(5000);
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });
    });

    it('sends admin alert and calls process.exit(1) for close code 4013 (invalid intent)', async () => {
      mockSendHealthAlert.mockResolvedValue(undefined);
      const { mockClient, capturedListeners } = createShardTestClient2();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        const mod = require('../src/discordBot') as typeof import('../src/discordBot');

        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const handler = capturedListeners['shardDisconnect'] as
          | ((event: { code: number }, shardId: number) => Promise<void>)
          | undefined;
        expect(handler).toBeDefined();
        await handler!({ code: 4013 }, 0);

        expect(mockSendHealthAlert).toHaveBeenCalledWith(
          'Discord Connection',
          expect.stringContaining('4013')
        );

        expect(mockProcessExit).not.toHaveBeenCalled();
        jest.advanceTimersByTime(5000);
        expect(mockProcessExit).toHaveBeenCalledWith(1);
      });
    });
  });

  // -----------------------------------------------------------------------
  // interactionCreate error handler — interaction state-aware reply
  // -----------------------------------------------------------------------

  /**
   * Helper: create a mock client that captures event listeners.
   */
  function createInteractionTestClient() {
    const capturedListeners: Record<string, (...args: unknown[]) => unknown> = {};
    const mockClient = {
      channels: { fetch: mockFetch },
      on: (event: string, handler: (...args: unknown[]) => unknown) => {
        capturedListeners[event] = handler;
      },
      once: jest.fn(),
      login: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      user: { tag: 'TestBot#0001' },
    };
    return { mockClient, capturedListeners };
  }

  /**
   * Helper: create a mock ChatInputCommand interaction with controlled state.
   */
  function createMockInteraction(opts: {
    replied: boolean;
    deferred: boolean;
    replyError?: Error;
    editReplyError?: Error;
  }) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mockReply = opts.replyError
      ? (jest.fn() as jest.Mock<(...args: any[]) => any>).mockRejectedValue(opts.replyError)
      : (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(undefined);
    const mockEditReply = opts.editReplyError
      ? (jest.fn() as jest.Mock<(...args: any[]) => any>).mockRejectedValue(opts.editReplyError)
      : (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(undefined);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return {
      isChatInputCommand: () => true,
      isButton: () => false,
      isRepliable: () => true,
      commandName: 'calendar',
      replied: opts.replied,
      deferred: opts.deferred,
      reply: mockReply,
      editReply: mockEditReply,
    };
  }

  describe('interactionCreate error handler', () => {
    it('calls reply() when interaction is not deferred and not replied', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        // Make calendarCommand.execute throw so the catch block is exercised
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: {
            execute: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('command error')),
          },
          buildCalendarEmbed: jest.fn(),
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const interaction = createMockInteraction({ replied: false, deferred: false });
        const handler = capturedListeners['interactionCreate'];
        await handler(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({ content: 'Something went wrong.', ephemeral: true });
        expect(interaction.editReply).not.toHaveBeenCalled();
      });
    });

    it('calls editReply() when interaction is deferred', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: {
            execute: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('command error')),
          },
          buildCalendarEmbed: jest.fn(),
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const interaction = createMockInteraction({ replied: false, deferred: true });
        const handler = capturedListeners['interactionCreate'];
        await handler(interaction);

        expect(interaction.editReply).toHaveBeenCalledWith({ content: 'Something went wrong.' });
        expect(interaction.reply).not.toHaveBeenCalled();
      });
    });

    it('calls neither reply() nor editReply() when interaction is already replied', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: {
            execute: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('command error')),
          },
          buildCalendarEmbed: jest.fn(),
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const interaction = createMockInteraction({ replied: true, deferred: false });
        const handler = capturedListeners['interactionCreate'];
        await handler(interaction);

        expect(interaction.reply).not.toHaveBeenCalled();
        expect(interaction.editReply).not.toHaveBeenCalled();
      });
    });

    it('logs error and does not crash when editReply throws (token expired)', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        const mockLogError = jest.fn();
        jest.doMock('../src/utils/logger', () => ({
          createLogger: () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: mockLogError,
            debug: jest.fn(),
          }),
        }));
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: {
            execute: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('command error')),
          },
          buildCalendarEmbed: jest.fn(),
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        const interaction = createMockInteraction({
          replied: false,
          deferred: true,
          editReplyError: new Error('Unknown interaction'),
        });
        const handler = capturedListeners['interactionCreate'];

        // Must not throw
        await expect(handler(interaction)).resolves.not.toThrow();
        expect(mockLogError).toHaveBeenCalledWith(
          expect.stringContaining('token may have expired'),
          expect.any(Object)
        );
      });
    });
  });

  // -----------------------------------------------------------------------
  // Button interaction — isolated error handler
  // -----------------------------------------------------------------------

  /**
   * Helper: create a mock button interaction with controlled update/reply behaviour.
   */
  function createMockButtonInteraction(opts: {
    customId?: string;
    messageId?: string;
    updateError?: Error;
    replyError?: Error;
  } = {}) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mockUpdate = opts.updateError
      ? (jest.fn() as jest.Mock<(...args: any[]) => any>).mockRejectedValue(opts.updateError)
      : (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(undefined);
    const mockReply = opts.replyError
      ? (jest.fn() as jest.Mock<(...args: any[]) => any>).mockRejectedValue(opts.replyError)
      : (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(undefined);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return {
      isChatInputCommand: () => false,
      isButton: () => true,
      isRepliable: () => true,
      customId: opts.customId ?? 'calendar_next',
      message: { id: opts.messageId ?? 'msg-btn-1' },
      replied: false,
      deferred: false,
      update: mockUpdate,
      reply: mockReply,
    };
  }

  describe('button interaction error handler', () => {
    it('sends ephemeral expired-calendar reply when update() throws', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: { execute: jest.fn() },
          buildCalendarEmbed: jest.fn(),
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        // Seed calendarCache so the handler reaches interaction.update()
        globalThis.calendarCache = new Map();
        globalThis.calendarCache.set('msg-btn-1', {
          pages: [[]],
          currentPage: 0,
          timestamp: Date.now(),
        });

        const interaction = createMockButtonInteraction({
          updateError: new Error('Unknown interaction'),
        });
        const handler = capturedListeners['interactionCreate'];

        await expect(handler(interaction)).resolves.not.toThrow();

        expect(interaction.reply).toHaveBeenCalledWith({
          content: 'This calendar has expired. Use /calendar for a new one.',
          ephemeral: true,
        });
      });

      // Clean up global state
      delete (globalThis as Record<string, unknown>)['calendarCache'];
    });

    it('logs error and does not crash when update() throws AND reply() throws', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        const mockLogError = jest.fn();
        jest.doMock('../src/utils/logger', () => ({
          createLogger: () => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: mockLogError,
            debug: jest.fn(),
          }),
        }));
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: { execute: jest.fn() },
          buildCalendarEmbed: jest.fn(),
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        globalThis.calendarCache = new Map();
        globalThis.calendarCache.set('msg-btn-2', {
          pages: [[]],
          currentPage: 0,
          timestamp: Date.now(),
        });

        const interaction = createMockButtonInteraction({
          messageId: 'msg-btn-2',
          updateError: new Error('Unknown interaction'),
          replyError: new Error('Interaction already acknowledged'),
        });
        const handler = capturedListeners['interactionCreate'];

        // Must not crash
        await expect(handler(interaction)).resolves.not.toThrow();

        expect(mockLogError).toHaveBeenCalledWith(
          expect.stringContaining('token may have expired'),
          expect.any(Object)
        );
      });

      delete (globalThis as Record<string, unknown>)['calendarCache'];
    });
  });

  // -----------------------------------------------------------------------
  // Button interaction — expired cache entry
  // -----------------------------------------------------------------------

  describe('button interaction expired cache', () => {
    it('replies with ephemeral expired message when cache entry is older than CALENDAR_CACHE_MAX_AGE_MS', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: { execute: jest.fn() },
          buildCalendarEmbed: jest.fn(),
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        // Seed cache with a timestamp 16 minutes in the past (beyond 15 min TTL)
        const SIXTEEN_MINUTES_MS = 16 * 60 * 1000;
        globalThis.calendarCache = new Map();
        globalThis.calendarCache.set('msg-expired', {
          pages: [[], []],
          currentPage: 0,
          timestamp: Date.now() - SIXTEEN_MINUTES_MS,
        });

        const interaction = createMockButtonInteraction({
          customId: 'calendar_next',
          messageId: 'msg-expired',
        });
        const handler = capturedListeners['interactionCreate'];

        await handler(interaction);

        expect(interaction.reply).toHaveBeenCalledWith({
          content: 'This calendar has expired. Use /calendar for a new one.',
          ephemeral: true,
        });
        expect(interaction.update).not.toHaveBeenCalled();

        delete (globalThis as Record<string, unknown>)['calendarCache'];
      });
    });
  });

  // -----------------------------------------------------------------------
  // Button interaction — page index bounds clamping
  // -----------------------------------------------------------------------

  describe('button interaction page bounds clamping', () => {
    it('clamps currentPage so pages[currentPage] is always a valid index', async () => {
      const { mockClient, capturedListeners } = createInteractionTestClient();

      await jest.isolateModulesAsync(async () => {
        const mockBuildEmbed = jest.fn().mockReturnValue({ data: {} });
        jest.doMock('../src/core/discordClient', () => ({ discordClient: mockClient }));
        jest.doMock('../src/commands/calendar', () => ({
          calendarCommand: { execute: jest.fn() },
          buildCalendarEmbed: mockBuildEmbed,
        }));

        const mod = require('../src/discordBot') as typeof import('../src/discordBot');
        const initPromise = mod.initializeDiscordBot();
        if (mockClient.once.mock.calls.length > 0) {
          const [, readyHandler] = mockClient.once.mock.calls[0] as [string, () => void];
          readyHandler();
        }
        await initPromise;

        // currentPage already at last index (1), pressing next should stay at 1
        globalThis.calendarCache = new Map();
        globalThis.calendarCache.set('msg-bounds', {
          pages: [['event-a'], ['event-b']],
          currentPage: 1,
          timestamp: Date.now(),
        });

        const interaction = createMockButtonInteraction({
          customId: 'calendar_next',
          messageId: 'msg-bounds',
        });
        const handler = capturedListeners['interactionCreate'];

        await handler(interaction);

        // buildCalendarEmbed should have been called with page index 1 (clamped, not 2)
        expect(mockBuildEmbed).toHaveBeenCalled();
        const [, pageIndexArg, totalArg] = mockBuildEmbed.mock.calls[0] as [unknown, number, number];
        expect(pageIndexArg).toBe(1);
        expect(totalArg).toBe(2);

        delete (globalThis as Record<string, unknown>)['calendarCache'];
      });
    });
  });
});
