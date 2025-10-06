import { describe, it, expect } from '@jest/globals';
import { validateEvent, validateEvents, shouldAcceptScrapedData } from '../../src/utils/dataValidation';
import { CalendarEvent } from '../../src/models/event';

describe('Data Validation', () => {
  describe('Single Event Validation', () => {
    it('should validate correct event', () => {
      const event: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: '8:30 am',
        title: 'Consumer Price Index',
        period: 'Sept.',
        forecast: '0.4%',
        previous: '0.3%',
        actual: '',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject event with missing date', () => {
      const event: CalendarEvent = {
        date: '',
        time: '8:30 am',
        title: 'Test',
        period: 'Sept.',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('date'))).toBe(true);
    });

    it('should reject event with invalid date format', () => {
      const event: CalendarEvent = {
        date: 'October 6, 2025',
        time: '8:30 am',
        title: 'Test',
        period: 'Sept.',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('date format'))).toBe(true);
    });

    it('should accept TBA time format', () => {
      const event: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: 'TBA',
        title: 'Auto sales',
        period: 'Sept.',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid time format', () => {
      const event: CalendarEvent = {
        date: 'MONDAY, OCT. 6',
        time: '830am',
        title: 'Test',
        period: 'Sept.',
      };

      const result = validateEvent(event);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('time format'))).toBe(true);
    });
  });

  describe('Event Array Validation', () => {
    it('should validate array of correct events', () => {
      const events: CalendarEvent[] = [
        {
          date: 'MONDAY, OCT. 6',
          time: '8:30 am',
          title: 'CPI',
          period: 'Sept.',
          forecast: '0.4%',
          previous: '0.3%',
        },
        {
          date: 'TUESDAY, OCT. 7',
          time: '10:00 am',
          title: 'Fed Speech',
          period: '',
        },
      ];

      const result = validateEvents(events);
      expect(result.valid).toBe(true);
    });

    it('should reject empty array', () => {
      const result = validateEvents([]);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('empty'))).toBe(true);
    });

    it('should detect missing data in multiple events', () => {
      const events: CalendarEvent[] = Array(10).fill({
        date: 'MONDAY, OCT. 6',
        time: '8:30 am',
        title: 'Test',
        period: '',
        forecast: '',
        previous: '',
        actual: '',
      });

      const result = validateEvents(events);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Suspicious'))).toBe(true);
    });
  });

  describe('Scraped Data Acceptance', () => {
    it('should accept valid scraped data with sufficient events', () => {
      const events: CalendarEvent[] = Array(20).fill(null).map((_, i) => ({
        date: 'MONDAY, OCT. 6',
        time: '8:30 am',
        title: `Event ${i}`,
        period: 'Sept.',
        forecast: '0.4%',
        previous: '0.3%',
      }));

      const result = shouldAcceptScrapedData(events);
      expect(result).toBe(true);
    });

    it('should reject data with too few events', () => {
      const events: CalendarEvent[] = [
        {
          date: 'MONDAY, OCT. 6',
          time: '8:30 am',
          title: 'CPI',
          period: 'Sept.',
        },
      ];

      const result = shouldAcceptScrapedData(events);
      expect(result).toBe(false);
    });

    it('should reject invalid event formats', () => {
      const events: CalendarEvent[] = [
        {
          date: '',
          time: '',
          title: '',
          period: '',
        },
      ];

      const result = shouldAcceptScrapedData(events);
      expect(result).toBe(false);
    });
  });
});
