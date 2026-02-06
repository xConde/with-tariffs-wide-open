import { describe, it, expect, beforeEach } from '@jest/globals';
import { cleanupCalendarCache, cleanupNotificationTimeouts } from '../../src/utils/cacheCleanup';

describe('Cache Cleanup Utilities', () => {
  describe('cleanupCalendarCache', () => {
    let cache: Map<string, { pages: string[][]; currentPage: number; timestamp: number }>;

    beforeEach(() => {
      cache = new Map();
    });

    it('should not remove entries when cache is under size limit', () => {
      cache.set('msg1', { pages: [['page1']], currentPage: 0, timestamp: Date.now() });
      cache.set('msg2', { pages: [['page2']], currentPage: 0, timestamp: Date.now() });

      cleanupCalendarCache(cache);

      expect(cache.size).toBe(2);
    });

    it('should remove entries older than max age', () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      cache.set('old', { pages: [['page1']], currentPage: 0, timestamp: twoHoursAgo });
      cache.set('new', { pages: [['page2']], currentPage: 0, timestamp: Date.now() });

      cleanupCalendarCache(cache);

      expect(cache.has('old')).toBe(false);
      expect(cache.has('new')).toBe(true);
    });

    it('should handle empty cache', () => {
      expect(() => cleanupCalendarCache(cache)).not.toThrow();
      expect(cache.size).toBe(0);
    });

    it('should cleanup without logging', () => {
      cache.set('msg1', { pages: [['page1']], currentPage: 0, timestamp: Date.now() });

      expect(() => cleanupCalendarCache(cache)).not.toThrow();
    });
  });

  describe('cleanupNotificationTimeouts', () => {
    let timeoutMap: Map<string, NodeJS.Timeout[]>;

    beforeEach(() => {
      timeoutMap = new Map();
    });

    it('should remove old event timeouts', () => {
      const oldTime = new Date(Date.now() - 10000000).toISOString();
      const timeout = setTimeout(() => {}, 1000);
      timeoutMap.set(oldTime, [timeout]);

      cleanupNotificationTimeouts(timeoutMap);

      expect(timeoutMap.has(oldTime)).toBe(false);
    });

    it('should keep recent event timeouts', () => {
      const recentTime = new Date(Date.now() + 3600000).toISOString();
      const timeout = setTimeout(() => {}, 1000);
      timeoutMap.set(recentTime, [timeout]);

      cleanupNotificationTimeouts(timeoutMap);

      expect(timeoutMap.has(recentTime)).toBe(true);

      clearTimeout(timeout);
    });

    it('should handle empty map', () => {
      expect(() => cleanupNotificationTimeouts(timeoutMap)).not.toThrow();
      expect(timeoutMap.size).toBe(0);
    });
  });
});
