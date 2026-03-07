import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockSend = jest.fn().mockResolvedValue(undefined as never);
const mockFetch = jest.fn();

jest.mock('../../src/core/discordClient', () => ({
  discordClient: {
    users: { fetch: mockFetch },
  },
}));

// ADMIN_USER_ID is captured at module load time, so we must set it before import
const originalAdminUserId = process.env.ADMIN_USER_ID;
process.env.ADMIN_USER_ID = '123456789';

import {
  sendAdminAlert,
  sendScraperFailureAlert,
  sendHealthAlert,
} from '../../src/utils/alerting';

describe('Admin Alerting System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ send: mockSend } as never);
  });

  afterAll(() => {
    if (originalAdminUserId === undefined) {
      delete process.env.ADMIN_USER_ID;
    } else {
      process.env.ADMIN_USER_ID = originalAdminUserId;
    }
  });

  describe('sendAdminAlert (ADMIN_USER_ID not set)', () => {
    it('returns false when ADMIN_USER_ID is not set', async () => {
      // Use isolateModules to get a fresh import with no ADMIN_USER_ID
      const saved = process.env.ADMIN_USER_ID;
      delete process.env.ADMIN_USER_ID;

      const result = await new Promise<boolean>((resolve) => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { sendAdminAlert: freshSendAdminAlert } = require('../../src/utils/alerting');
          freshSendAdminAlert('test message').then(resolve);
        });
      });

      process.env.ADMIN_USER_ID = saved;

      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('sendAdminAlert', () => {
    it('returns true and calls user.send with embed when configured', async () => {
      const result = await sendAdminAlert('Something broke');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('123456789');
      expect(mockSend).toHaveBeenCalledTimes(1);

      const sendArg = (mockSend.mock.calls[0] as unknown[])[0] as {
        embeds: Array<{ data: Record<string, unknown> }>;
      };
      expect(sendArg.embeds).toHaveLength(1);
      expect(sendArg.embeds[0].data.title).toBe('Bot Alert');
      expect(sendArg.embeds[0].data.description).toBe('Something broke');
    });

    it('includes details field when details param is provided', async () => {
      const result = await sendAdminAlert('Alert title', 'Extra details here');

      expect(result).toBe(true);
      const sendArg = (mockSend.mock.calls[0] as unknown[])[0] as {
        embeds: Array<{ data: Record<string, unknown> }>;
      };
      const fields = sendArg.embeds[0].data.fields as Array<{ name: string; value: string }>;
      expect(fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Details', value: 'Extra details here' }),
        ])
      );
    });

    it('returns false when user.send throws', async () => {
      mockSend.mockRejectedValueOnce(new Error('DM closed') as never);

      const result = await sendAdminAlert('test');

      expect(result).toBe(false);
    });

    it('returns false when users.fetch returns null', async () => {
      mockFetch.mockResolvedValueOnce(null as never);

      const result = await sendAdminAlert('test');

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('sendScraperFailureAlert', () => {
    it('sends alert with formatted scraper failure message', async () => {
      const error = new Error('Timeout after 15s');

      await sendScraperFailureAlert(3, error);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sendArg = (mockSend.mock.calls[0] as unknown[])[0] as {
        embeds: Array<{ data: Record<string, unknown> }>;
      };
      expect(sendArg.embeds[0].data.description).toBe('Scraper failed after 3 attempts');
      const fields = sendArg.embeds[0].data.fields as Array<{ name: string; value: string }>;
      expect(fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Details',
            value: expect.stringContaining('Timeout after 15s'),
          }),
        ])
      );
    });
  });

  describe('sendHealthAlert', () => {
    it('sends alert with formatted health message', async () => {
      await sendHealthAlert('Discord Connection', 'WebSocket disconnected');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sendArg = (mockSend.mock.calls[0] as unknown[])[0] as {
        embeds: Array<{ data: Record<string, unknown> }>;
      };
      expect(sendArg.embeds[0].data.description).toBe('Health check failed: Discord Connection');
      const fields = sendArg.embeds[0].data.fields as Array<{ name: string; value: string }>;
      expect(fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Details',
            value: 'WebSocket disconnected',
          }),
        ])
      );
    });
  });
});
