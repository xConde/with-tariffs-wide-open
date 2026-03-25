import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  saveNotificationState,
  loadNotificationState,
  shouldRestoreNotifications,
  getEventsNeedingNotifications,
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

      await saveNotificationState(groups);

      const exists = await fs.access(STATE_FILE).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should include all required fields in state', async () => {
      const groups = new Map<string, CalendarEvent[]>();

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

      await saveNotificationState(groups);

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

      await saveNotificationState(groups);

      const loaded = await loadNotificationState();

      expect(loaded).not.toBeNull();
      expect(loaded?.scheduledEvents.length).toBe(1);
    });

    it('should return null when file missing', async () => {
      const state = await loadNotificationState();
      expect(state).toBeNull();
    });

    it('should reject stale state older than 72 hours', async () => {
      const staleState = {
        scheduledEvents: [],
        lastUpdated: Date.now() - (73 * 60 * 60 * 1000), // 73 hours ago
      };

      await fs.writeFile(STATE_FILE, JSON.stringify(staleState), 'utf8');

      const loaded = await loadNotificationState();
      expect(loaded).toBeNull();
    });

    it('should accept state younger than 72 hours', async () => {
      const recentState = {
        scheduledEvents: [],
        lastUpdated: Date.now() - (71 * 60 * 60 * 1000), // 71 hours ago
      };

      await fs.writeFile(STATE_FILE, JSON.stringify(recentState), 'utf8');

      const loaded = await loadNotificationState();
      expect(loaded).not.toBeNull();
    });
  });

  describe('Event Restoration', () => {
    it('should detect if restoration needed', async () => {
      const groups = new Map<string, CalendarEvent[]>();
      groups.set('future-key', []);

      await saveNotificationState(groups);

      const should = await shouldRestoreNotifications();
      expect(should).toBe(true);
    });

    it('should return false when no state exists', async () => {
      const should = await shouldRestoreNotifications();
      expect(should).toBe(false);
    });
  });

  describe('getEventsNeedingNotifications', () => {
    it('should exclude past events', async () => {
      const pastKey = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 minutes ago
      const futureKey = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const pastEvent: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: '8:30 am',
        title: 'Past Event',
        period: 'Sept.',
        forecast: '',
        previous: '',
        actual: '200K',
      };
      const futureEvent: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: '10:30 am',
        title: 'Future Event',
        period: 'Sept.',
        forecast: '0.4%',
        previous: '0.3%',
        actual: '',
      };

      const groups = new Map<string, CalendarEvent[]>();
      groups.set(pastKey, [pastEvent]);
      groups.set(futureKey, [futureEvent]);

      await saveNotificationState(groups);

      const events = await getEventsNeedingNotifications();
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Future Event');
    });

    it('crash 5 minutes before event — restart should include event in restore', async () => {
      // Simulate: bot saves state at T-5min, then crashes. On restart (now = T-3min),
      // the event is still 3 min in the future and must be returned for re-scheduling.
      const eventIn3Minutes = new Date(Date.now() + 3 * 60 * 1000).toISOString();

      const event: CalendarEvent = {
        date: 'WEDNESDAY, OCT. 8',
        time: '9:00 am',
        title: 'CPI Report',
        period: 'Sept.',
        forecast: '0.2%',
        previous: '0.1%',
        actual: '',
      };

      const groups = new Map<string, CalendarEvent[]>();
      groups.set(eventIn3Minutes, [event]);

      await saveNotificationState(groups);

      // On restart: event is still in the future → should be returned
      const events = await getEventsNeedingNotifications();
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('CPI Report');
    });
  });
});
