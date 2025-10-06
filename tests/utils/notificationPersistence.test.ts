import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  saveNotificationState,
  loadNotificationState,
  shouldRestoreNotifications,
  getEventsNeedingNotifications,
  clearNotificationState,
} from '../../src/utils/notificationPersistence';
import { CalendarEvent } from '../../src/models/event';
import { promises as fs } from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, '../../data/notification-state.json');

describe('Notification Persistence', () => {
  beforeEach(async () => {
    await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(STATE_FILE);
    } catch {
      // Ignore
    }
  });

  describe('State Saving', () => {
    it('should save notification state to disk', async () => {
      const groups = new Map<string, CalendarEvent[]>();
      const timeouts = new Map<string, NodeJS.Timeout[]>();

      const event: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: '8:30 am',
        title: 'Consumer Price Index',
        period: 'Sept.',
        forecast: '0.4%',
        previous: '0.3%',
        actual: '',
      };

      groups.set('2025-10-06T12:30:00.000Z', [event]);

      await saveNotificationState(groups, timeouts);

      const exists = await fs.access(STATE_FILE).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should include all required fields in state', async () => {
      const groups = new Map<string, CalendarEvent[]>();
      const timeouts = new Map<string, NodeJS.Timeout[]>();

      const event: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: '8:30 am',
        title: 'Test Event',
        period: 'Oct.',
        forecast: '1.0%',
        previous: '0.9%',
        actual: '',
      };

      groups.set('2025-10-06T12:30:00.000Z', [event]);

      await saveNotificationState(groups, timeouts);

      const data = await fs.readFile(STATE_FILE, 'utf8');
      const parsed = JSON.parse(data);

      expect(parsed.scheduledEvents).toBeDefined();
      expect(parsed.lastUpdated).toBeDefined();
      expect(Array.isArray(parsed.scheduledEvents)).toBe(true);
    });
  });

  describe('State Loading', () => {
    it('should load saved state', async () => {
      const groups = new Map<string, CalendarEvent[]>();
      const timeouts = new Map<string, NodeJS.Timeout[]>();

      const event: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: '8:30 am',
        title: 'Test',
        period: 'Oct.',
        forecast: '',
        previous: '',
        actual: '',
      };

      groups.set('2025-10-06T12:30:00.000Z', [event]);

      await saveNotificationState(groups, timeouts);

      const loaded = await loadNotificationState();

      expect(loaded).not.toBeNull();
      expect(loaded?.scheduledEvents.length).toBe(1);
    });

    it('should return null when file missing', async () => {
      const state = await loadNotificationState();
      expect(state).toBeNull();
    });

    it('should reject stale state older than 24 hours', async () => {
      const staleState = {
        scheduledEvents: [],
        lastUpdated: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
      };

      await fs.writeFile(STATE_FILE, JSON.stringify(staleState), 'utf8');

      const loaded = await loadNotificationState();
      expect(loaded).toBeNull();
    });
  });

  describe('Event Restoration', () => {
    it('should detect if restoration needed', async () => {
      const groups = new Map<string, CalendarEvent[]>();
      groups.set('future-key', []);

      await saveNotificationState(groups, new Map());

      const should = await shouldRestoreNotifications();
      expect(should).toBe(true);
    });

    it('should return false when no state exists', async () => {
      const should = await shouldRestoreNotifications();
      expect(should).toBe(false);
    });
  });

  describe('State Cleanup', () => {
    it('should clear state file', async () => {
      const groups = new Map<string, CalendarEvent[]>();
      await saveNotificationState(groups, new Map());

      await clearNotificationState();

      const exists = await fs.access(STATE_FILE).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should handle missing file gracefully', async () => {
      await expect(clearNotificationState()).resolves.not.toThrow();
    });
  });
});
