import { promises as fs } from 'fs';
import * as path from 'path';
import { CalendarEvent } from '../models/event';

const NOTIFICATION_STATE_FILE = path.join(__dirname, '../../data/notification-state.json');

interface NotificationState {
  scheduledEvents: Array<{
    groupKey: string;
    events: CalendarEvent[];
    eventTime: string;
    notification30scheduled: boolean;
    notification1scheduled: boolean;
  }>;
  lastUpdated: number;
}

/**
 * Saves current notification schedule to disk
 */
export async function saveNotificationState(
  scheduledGroups: Map<string, CalendarEvent[]>,
  notificationTimeouts: Map<string, NodeJS.Timeout[]>
): Promise<void> {
  try {
    const state: NotificationState = {
      scheduledEvents: [],
      lastUpdated: Date.now(),
    };

    scheduledGroups.forEach((events, groupKey) => {
      const hasTimeouts = notificationTimeouts.has(groupKey);
      const timeouts = notificationTimeouts.get(groupKey) || [];

      state.scheduledEvents.push({
        groupKey,
        events,
        eventTime: groupKey,
        notification30scheduled: hasTimeouts && timeouts.length > 0,
        notification1scheduled: hasTimeouts && timeouts.length > 1,
      });
    });

    await fs.mkdir(path.dirname(NOTIFICATION_STATE_FILE), { recursive: true });
    await fs.writeFile(NOTIFICATION_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving notification state:', error);
  }
}

/**
 * Loads notification schedule from disk
 */
export async function loadNotificationState(): Promise<NotificationState | null> {
  try {
    const data = await fs.readFile(NOTIFICATION_STATE_FILE, 'utf8');
    const state = JSON.parse(data) as NotificationState;

    const age = Date.now() - state.lastUpdated;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (age > maxAge) {
      return null;
    }
    return state;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    console.error('Error loading notification state:', error);
    return null;
  }
}

/**
 * Checks if notifications need to be restored after restart
 */
export async function shouldRestoreNotifications(): Promise<boolean> {
  const state = await loadNotificationState();
  return state !== null && state.scheduledEvents.length > 0;
}

/**
 * Gets events that still need notifications scheduled
 */
export async function getEventsNeedingNotifications(): Promise<CalendarEvent[]> {
  const state = await loadNotificationState();
  if (!state) return [];

  const allEvents: CalendarEvent[] = [];
  const now = Date.now();

  state.scheduledEvents.forEach(group => {
    const eventTime = new Date(group.eventTime).getTime();

    if (eventTime > now) {
      allEvents.push(...group.events);
    }
  });

  return allEvents;
}

/**
 * Clears persisted notification state (called after successful scheduling)
 */
export async function clearNotificationState(): Promise<void> {
  try {
    await fs.unlink(NOTIFICATION_STATE_FILE);
  } catch {
    // File might not exist
  }
}
