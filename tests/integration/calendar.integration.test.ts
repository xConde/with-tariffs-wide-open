import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { generateTestEvents, generatePastEventsWithActuals } from '../../src/utils/testDataGenerator';
import { CalendarEvent } from '../../src/models/event';
import { saveEvents, getStoredEvents } from '../../src/storage';
import { promises as fs } from 'fs';
import * as path from 'path';

const TEST_DATA_DIR = path.join(__dirname, '../../data');
const TEST_DATA_FILE = path.join(TEST_DATA_DIR, 'events.json');

describe('Calendar Integration Tests', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(TEST_DATA_FILE);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('Test Data Generation', () => {
    it('should generate future events', () => {
      const events = generateTestEvents(7);

      expect(events.length).toBeGreaterThan(0);
      expect(events.length).toBeLessThanOrEqual(7 * 6); // Max 6 events per day

      events.forEach(event => {
        expect(event).toHaveProperty('date');
        expect(event).toHaveProperty('time');
        expect(event).toHaveProperty('title');
        expect(event.date).toMatch(/^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),/);
      });
    });

    it('should generate past events with actuals', () => {
      const events = generatePastEventsWithActuals(2);

      expect(events.length).toBeGreaterThan(0);

      const hasActual = events.some(e => e.actual && e.actual.trim() !== '');
      expect(hasActual).toBe(true);

      events.forEach(event => {
        if (event.actual) {
          expect(event.forecast).toBeTruthy();
        }
      });
    });

    it('should sort events chronologically', () => {
      const events = generateTestEvents(5);

      for (let i = 1; i < events.length; i++) {
        const prevDate = events[i - 1].date;
        const currDate = events[i].date;

        expect(currDate >= prevDate).toBe(true);
      }
    });
  });

  describe('Storage Integration', () => {
    it('should save and retrieve events', async () => {
      const testEvents = generateTestEvents(3);

      await saveEvents(testEvents);
      const retrieved = await getStoredEvents();

      expect(retrieved.length).toBe(testEvents.length);
      expect(retrieved[0].title).toBe(testEvents[0].title);
    });

    it('should handle empty storage', async () => {
      const events = await getStoredEvents();
      expect(Array.isArray(events)).toBe(true);
    });

    it('should overwrite previous data', async () => {
      const firstBatch = generateTestEvents(2);
      await saveEvents(firstBatch);

      const secondBatch = generateTestEvents(5);
      await saveEvents(secondBatch);

      const retrieved = await getStoredEvents();
      expect(retrieved.length).toBe(secondBatch.length);
    });
  });

  describe('Event Format Validation', () => {
    it('should have valid time format', () => {
      const events = generateTestEvents(3);
      const timePattern = /^\d{1,2}:\d{2} (am|pm)$/;

      events.forEach(event => {
        expect(event.time).toMatch(timePattern);
      });
    });

    it('should have valid date format', () => {
      const events = generateTestEvents(3);
      const datePattern = /^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY), (JAN\.|FEB\.|MAR\.|APR\.|MAY|JUNE|JULY|AUG\.|SEPT\.|OCT\.|NOV\.|DEC\.) \d{1,2}$/;

      events.forEach(event => {
        expect(event.date).toMatch(datePattern);
      });
    });

    it('should have valid economic data formats', () => {
      const events = generatePastEventsWithActuals(1);

      events.forEach(event => {
        if (event.forecast) {
          const isPercent = event.forecast.includes('%');
          const isDollar = event.forecast.includes('$') || event.forecast.includes('B') || event.forecast.includes('million');
          const isNumber = /\d/.test(event.forecast);

          expect(isPercent || isDollar || isNumber || event.forecast === '--').toBe(true);
        }
      });
    });
  });
});
