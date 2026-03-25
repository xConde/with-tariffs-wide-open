import { promises as fs } from 'fs';
import * as path from 'path';
import { CalendarEvent } from '../models/event';
import { createLogger } from './logger';

const log = createLogger('persistence');

const NOTIFICATION_STATE_FILE = path.join(__dirname, '../../data/notification-state.json');

async function rotateNotificationBackups(filePath: string): Promise<void> {
  try {
    await fs.unlink(`${filePath}.bak.3`).catch(() => {});
    await fs.rename(`${filePath}.bak.2`, `${filePath}.bak.3`).catch(() => {});
    await fs.rename(`${filePath}.bak.1`, `${filePath}.bak.2`).catch(() => {});
    await fs.copyFile(filePath, `${filePath}.bak.1`).catch(() => {});
  } catch {
    // Backup rotation is best-effort — don't fail the save
  }
}

interface NotificationState {
  scheduledEvents: Array<{
    groupKey: string;
    events: CalendarEvent[];
    eventTime: string;
  }>;
  lastUpdated: number;
}

/**
 * Saves current notification schedule to disk
 */
export async function saveNotificationState(
  scheduledGroups: Map<string, CalendarEvent[]>
): Promise<void> {
  try {
    const state: NotificationState = {
      scheduledEvents: [],
      lastUpdated: Date.now(),
    };

    scheduledGroups.forEach((events, groupKey) => {
      state.scheduledEvents.push({
        groupKey,
        events,
        eventTime: groupKey,
      });
    });

    await fs.mkdir(path.dirname(NOTIFICATION_STATE_FILE), { recursive: true });
    await rotateNotificationBackups(NOTIFICATION_STATE_FILE);
    const tempFile = `${NOTIFICATION_STATE_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tempFile, NOTIFICATION_STATE_FILE);
  } catch (error) {
    log.error('Error saving notification state', { error: String(error) });
  }
}

/**
 * Loads notification schedule from disk
 */
export async function loadNotificationState(): Promise<NotificationState | null> {
  try {
    const data = await fs.readFile(NOTIFICATION_STATE_FILE, 'utf8');
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as NotificationState).scheduledEvents)) {
      log.error('Notification state file has invalid structure');
      return null;
    }
    const state = parsed as NotificationState;

    const age = Date.now() - state.lastUpdated;
    const maxAge = 72 * 60 * 60 * 1000; // 72 hours

    if (age > maxAge) {
      return null;
    }
    return state;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    log.error('Error loading notification state', { error: String(error) });
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
 * Gets events that still need notifications scheduled.
 * Events whose event time is in the past are excluded.
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

