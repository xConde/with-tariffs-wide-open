import { CALENDAR_CACHE_MAX_AGE_MS, CALENDAR_CACHE_MAX_SIZE, NOTIFICATION_TIMEOUT_CLEANUP_MS, CACHE_CLEANUP_INTERVAL_MS } from '../config/constants';

interface CacheEntry {
  pages: string[][];
  currentPage: number;
  timestamp: number;
}

/**
 * Cleans up old entries from the calendar cache based on age and size limits
 */
export function cleanupCalendarCache(cache: Map<string, CacheEntry>): void {
  const now = Date.now();
  const entriesToDelete: string[] = [];

  // Remove entries older than max age using actual stored timestamps
  cache.forEach((entry, key) => {
    if (now - entry.timestamp > CALENDAR_CACHE_MAX_AGE_MS) {
      entriesToDelete.push(key);
    }
  });

  // If still over size limit, remove oldest entries
  if (cache.size - entriesToDelete.length > CALENDAR_CACHE_MAX_SIZE) {
    const sortedEntries = Array.from(cache.entries())
      .filter(([key]) => !entriesToDelete.includes(key))
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const excess = cache.size - entriesToDelete.length - CALENDAR_CACHE_MAX_SIZE;
    for (let i = 0; i < excess; i++) {
      entriesToDelete.push(sortedEntries[i][0]);
    }
  }

  // Delete marked entries
  entriesToDelete.forEach(key => cache.delete(key));
}

/**
 * Cleans up completed/old notification timeouts from the global map
 */
export function cleanupNotificationTimeouts(
  timeoutMap: Map<string, NodeJS.Timeout[]>
): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  timeoutMap.forEach((timeouts, key) => {
    const eventTime = new Date(key);

    if (now - eventTime.getTime() > NOTIFICATION_TIMEOUT_CLEANUP_MS) {
      timeouts.forEach(timeout => clearTimeout(timeout));
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => timeoutMap.delete(key));
}

/**
 * Schedules periodic cleanup of global caches
 */
export function schedulePeriodicCleanup(): NodeJS.Timeout {
  return setInterval(() => {
    if (globalThis.calendarCache) {
      cleanupCalendarCache(globalThis.calendarCache);
    }
    if (globalThis.notificationTimeouts) {
      cleanupNotificationTimeouts(globalThis.notificationTimeouts);
    }
  }, CACHE_CLEANUP_INTERVAL_MS);
}
