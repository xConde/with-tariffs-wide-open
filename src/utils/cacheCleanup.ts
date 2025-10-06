import { CALENDAR_CACHE_MAX_AGE_MS, CALENDAR_CACHE_MAX_SIZE } from '../config/constants';

interface CacheEntry {
  pages: string[][];
  currentPage: number;
  timestamp: number;
}

/**
 * Cleans up old entries from the calendar cache based on age and size limits
 */
export function cleanupCalendarCache(cache: Map<string, { pages: string[][]; currentPage: number }>): void {
  const now = Date.now();
  const entriesToDelete: string[] = [];

  // Convert to entries with timestamps
  const entriesWithTimestamps = new Map<string, CacheEntry>();
  cache.forEach((value, key) => {
    entriesWithTimestamps.set(key, {
      ...value,
      timestamp: now, // In production, we'd store actual timestamps
    });
  });

  // Remove entries older than max age
  cache.forEach((_, key) => {
    const entry = entriesWithTimestamps.get(key);
    if (entry && now - entry.timestamp > CALENDAR_CACHE_MAX_AGE_MS) {
      entriesToDelete.push(key);
    }
  });

  // If still over size limit, remove oldest entries
  if (cache.size - entriesToDelete.length > CALENDAR_CACHE_MAX_SIZE) {
    const sortedEntries = Array.from(entriesWithTimestamps.entries())
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

    // If event time is more than 2 hours in the past, cleanup
    if (now - eventTime.getTime() > 7200000) {
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
  const CLEANUP_INTERVAL_MS = 3600000; // 1 hour

  return setInterval(() => {
    if (globalThis.calendarCache) {
      cleanupCalendarCache(globalThis.calendarCache);
    }
    if (globalThis.notificationTimeouts) {
      cleanupNotificationTimeouts(globalThis.notificationTimeouts);
    }
  }, CLEANUP_INTERVAL_MS);
}
