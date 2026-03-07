import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const mockChannelFetch = jest.fn();
const mockPermissionsHas = jest.fn();
const mockPermissionsFor = jest.fn();

jest.mock('../../src/core/discordClient', () => ({
  discordClient: {
    channels: { fetch: mockChannelFetch },
    user: { id: 'bot-user-id' },
  },
}));

import {
  validateChannel,
  validateChannelsOnStartup,
} from '../../src/utils/channelValidation';

function createMockTextChannel(overrides?: {
  type?: number;
  permissionsForReturn?: unknown;
}) {
  return {
    type: overrides?.type ?? ChannelType.GuildText,
    permissionsFor: overrides?.permissionsForReturn !== undefined
      ? jest.fn().mockReturnValue(overrides.permissionsForReturn)
      : mockPermissionsFor,
  };
}

describe('Channel Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionsHas.mockReturnValue(true);
    mockPermissionsFor.mockReturnValue({ has: mockPermissionsHas });
    mockChannelFetch.mockResolvedValue(createMockTextChannel() as never);
  });

  describe('validateChannel', () => {
    it('returns accessible and hasPermissions when channel is text with all permissions', async () => {
      const result = await validateChannel('111');

      expect(result.accessible).toBe(true);
      expect(result.hasPermissions).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns not accessible when channel is null', async () => {
      mockChannelFetch.mockResolvedValue(null as never);

      const result = await validateChannel('111');

      expect(result.accessible).toBe(false);
      expect(result.hasPermissions).toBe(false);
      expect(result.errors).toContain('Channel not found');
    });

    it('returns not accessible when channel is not a text channel', async () => {
      mockChannelFetch.mockResolvedValue(
        createMockTextChannel({ type: ChannelType.DM }) as never
      );

      const result = await validateChannel('111');

      expect(result.accessible).toBe(false);
      expect(result.errors).toContain('Channel is not a text channel');
    });

    it('returns accessible but no permissions when required permissions are missing', async () => {
      mockPermissionsHas.mockImplementation((perm: unknown) => {
        return perm !== PermissionFlagsBits.SendMessages;
      });

      const result = await validateChannel('111');

      expect(result.accessible).toBe(true);
      expect(result.hasPermissions).toBe(false);
      expect(result.errors[0]).toContain('Missing permissions');
    });

    it('returns not accessible when fetch throws an error', async () => {
      mockChannelFetch.mockRejectedValue(new Error('Unknown Channel') as never);

      const result = await validateChannel('111');

      expect(result.accessible).toBe(false);
      expect(result.hasPermissions).toBe(false);
      expect(result.errors[0]).toContain('Unknown Channel');
    });

    it('returns accessible but no permissions when permissionsFor returns null', async () => {
      mockChannelFetch.mockResolvedValue(
        createMockTextChannel({ permissionsForReturn: null }) as never
      );

      const result = await validateChannel('111');

      expect(result.accessible).toBe(true);
      expect(result.hasPermissions).toBe(false);
      expect(result.errors).toContain('Cannot determine permissions');
    });
  });

  describe('validateChannelsOnStartup', () => {
    it('succeeds when primary channel validates', async () => {
      await expect(
        validateChannelsOnStartup('111')
      ).resolves.toBeUndefined();
    });

    it('throws when primary channel is not accessible', async () => {
      mockChannelFetch.mockResolvedValue(null as never);

      await expect(
        validateChannelsOnStartup('111')
      ).rejects.toThrow('Primary notification channel not accessible');
    });

    it('throws when primary channel lacks permissions', async () => {
      mockChannelFetch.mockResolvedValue(
        createMockTextChannel({ permissionsForReturn: null }) as never
      );

      await expect(
        validateChannelsOnStartup('111')
      ).rejects.toThrow('Bot lacks permissions in primary channel');
    });

    it('warns but does not throw when fallback channel fails', async () => {
      let callCount = 0;
      mockChannelFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(createMockTextChannel());
        }
        return Promise.resolve(null);
      });

      await expect(
        validateChannelsOnStartup('111', '222')
      ).resolves.toBeUndefined();
    });

    it('succeeds with both primary and fallback valid', async () => {
      mockChannelFetch.mockImplementation(() => {
        return Promise.resolve(createMockTextChannel());
      });

      await expect(
        validateChannelsOnStartup('111', '222')
      ).resolves.toBeUndefined();

      expect(mockChannelFetch).toHaveBeenCalledTimes(2);
    });
  });
});
