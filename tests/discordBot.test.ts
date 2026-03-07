import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { TextChannel, EmbedBuilder, Message } from 'discord.js';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
} from '../src/config/constants';

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

jest.mock('../src/utils/alerting', () => ({
  sendHealthAlert: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helper: create mock channel objects
// ---------------------------------------------------------------------------

function createMockChannel(overrides: { isTextBased?: boolean; sendResult?: unknown; sendError?: Error } = {}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mockSend = overrides.sendError
    ? (jest.fn() as jest.Mock<(...args: any[]) => any>).mockRejectedValue(overrides.sendError)
    : (jest.fn() as jest.Mock<(...args: any[]) => any>).mockResolvedValue(
        overrides.sendResult ?? ({ id: 'msg-1' } as unknown as Message)
      );
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    channel: {
      isTextBased: () => overrides.isTextBased ?? true,
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

    it('falls back when primary channel is not text-based', async () => {
      const nonTextChannel = {
        isTextBased: () => false,
        send: jest.fn(),
      } as unknown as TextChannel;

      const { channel: fallbackChannel, mockSend: fallbackSend } = createMockChannel({
        sendResult: { id: 'msg-fallback' },
      });

      mockFetch
        .mockResolvedValueOnce(nonTextChannel)
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
  describe('cancelPendingReconnect', () => {
    it('does not throw when no pending reconnect exists', () => {
      const { cancelPendingReconnect } = loadModule({
        DISCORD_CHANNEL_ID: 'ch-1',
      });

      expect(() => cancelPendingReconnect()).not.toThrow();
    });

    it('is callable multiple times without error', () => {
      const { cancelPendingReconnect } = loadModule({
        DISCORD_CHANNEL_ID: 'ch-1',
      });

      cancelPendingReconnect();
      cancelPendingReconnect();
      // No assertion needed beyond no-throw
    });
  });

  // -----------------------------------------------------------------------
  // Reconnect configuration constants
  // -----------------------------------------------------------------------
  describe('Reconnect Configuration', () => {
    it('MAX_RECONNECT_ATTEMPTS is in a reasonable range (1-10)', () => {
      expect(MAX_RECONNECT_ATTEMPTS).toBeGreaterThanOrEqual(1);
      expect(MAX_RECONNECT_ATTEMPTS).toBeLessThanOrEqual(10);
    });

    it('RECONNECT_BASE_DELAY_MS is positive and reasonable', () => {
      expect(RECONNECT_BASE_DELAY_MS).toBeGreaterThan(0);
      expect(RECONNECT_BASE_DELAY_MS).toBeLessThanOrEqual(30000);
    });

    it('matches expected constant values', () => {
      expect(MAX_RECONNECT_ATTEMPTS).toBe(5);
      expect(RECONNECT_BASE_DELAY_MS).toBe(5000);
    });
  });
});
