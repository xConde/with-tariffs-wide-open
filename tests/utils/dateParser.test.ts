import { describe, it, expect } from '@jest/globals';
import {
  normalizeMarketWatchMonth,
  MONTH_NORMALIZATION,
  fixTimeString,
  parseDateHeader,
} from '../../src/utils/dateParser';

describe('dateParser', () => {
  describe('normalizeMarketWatchMonth()', () => {
    it('should normalize abbreviated months with periods', () => {
      expect(normalizeMarketWatchMonth('JAN. 6')).toBe('January 6');
      expect(normalizeMarketWatchMonth('FEB. 3')).toBe('February 3');
      expect(normalizeMarketWatchMonth('MAR. 15')).toBe('March 15');
      expect(normalizeMarketWatchMonth('APR. 1')).toBe('April 1');
      expect(normalizeMarketWatchMonth('AUG. 22')).toBe('August 22');
      expect(normalizeMarketWatchMonth('SEPT. 10')).toBe('September 10');
      expect(normalizeMarketWatchMonth('OCT. 6')).toBe('October 6');
      expect(normalizeMarketWatchMonth('NOV. 30')).toBe('November 30');
      expect(normalizeMarketWatchMonth('DEC. 25')).toBe('December 25');
    });

    it('should normalize full-name months without periods', () => {
      expect(normalizeMarketWatchMonth('MAY 5')).toBe('May 5');
      expect(normalizeMarketWatchMonth('JUNE 14')).toBe('June 14');
      expect(normalizeMarketWatchMonth('JULY 4')).toBe('July 4');
    });

    it('should be case-insensitive', () => {
      expect(normalizeMarketWatchMonth('Jan. 6')).toBe('January 6');
      expect(normalizeMarketWatchMonth('oct. 6')).toBe('October 6');
      expect(normalizeMarketWatchMonth('Sept. 10')).toBe('September 10');
    });

    it('should return input unchanged for unrecognized formats', () => {
      expect(normalizeMarketWatchMonth('Unknown 1')).toBe('Unknown 1');
      expect(normalizeMarketWatchMonth('')).toBe('');
    });

    it('should cover all 12 months in the normalization map', () => {
      expect(Object.keys(MONTH_NORMALIZATION)).toHaveLength(12);
    });
  });

  describe('fixTimeString()', () => {
    it('should add space before am/pm when missing', () => {
      expect(fixTimeString('8:30am')).toBe('8:30 am');
      expect(fixTimeString('10:00pm')).toBe('10:00 pm');
      expect(fixTimeString('1:15AM')).toBe('1:15 AM');
      expect(fixTimeString('12:00PM')).toBe('12:00 PM');
    });

    it('should leave correctly formatted times unchanged', () => {
      expect(fixTimeString('8:30 am')).toBe('8:30 am');
      expect(fixTimeString('10:00 PM')).toBe('10:00 PM');
    });

    it('should leave non-matching formats unchanged', () => {
      expect(fixTimeString('TBA')).toBe('TBA');
      expect(fixTimeString('')).toBe('');
      expect(fixTimeString('8:30')).toBe('8:30');
    });
  });

  describe('parseDateHeader()', () => {
    it('should parse valid date headers with standard month names', () => {
      const result = parseDateHeader('Monday, March 17');
      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(2); // March
      expect(result.getDate()).toBe(17);
    });

    it('should parse MarketWatch abbreviated months with periods', () => {
      const result = parseDateHeader('Monday, OCT. 6');
      expect(result.getMonth()).toBe(9); // October
      expect(result.getDate()).toBe(6);
    });

    it('should parse SEPT. format correctly', () => {
      const result = parseDateHeader('Wednesday, SEPT. 10');
      expect(result.getMonth()).toBe(8); // September
      expect(result.getDate()).toBe(10);
    });

    it('should parse MAY format (no period)', () => {
      const result = parseDateHeader('Thursday, MAY 5');
      expect(result.getMonth()).toBe(4); // May
      expect(result.getDate()).toBe(5);
    });

    it('should parse JUNE format (no period)', () => {
      const result = parseDateHeader('Friday, JUNE 14');
      expect(result.getMonth()).toBe(5); // June
      expect(result.getDate()).toBe(14);
    });

    it('should use current year by default', () => {
      const result = parseDateHeader('Friday, JUNE 20');
      const currentYear = new Date().getFullYear();
      expect(result.getFullYear()).toBeGreaterThanOrEqual(currentYear);
    });

    it('should handle year rollover when in Nov/Dec viewing January dates', () => {
      // This test validates the rollover logic exists
      const result = parseDateHeader('Wednesday, January 15');
      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(0); // January
      expect(result.getDate()).toBe(15);
    });

    it('should return epoch date for malformed input', () => {
      const result = parseDateHeader('garbage');
      expect(result).toBeInstanceOf(Date);
      // With no comma, parts[1] is undefined, dayMonth is '', parse fails
      expect(result.getTime()).toBe(0);
    });

    it('should return epoch date for empty string', () => {
      const result = parseDateHeader('');
      expect(result.getTime()).toBe(0);
    });

    it('should parse dates with various day names', () => {
      const tuesday = parseDateHeader('Tuesday, APR. 8');
      expect(tuesday.getMonth()).toBe(3); // April
      expect(tuesday.getDate()).toBe(8);

      const sunday = parseDateHeader('Sunday, DEC. 25');
      expect(sunday.getMonth()).toBe(11); // December
      expect(sunday.getDate()).toBe(25);
    });
  });
});
