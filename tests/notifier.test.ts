import { describe, it, expect } from '@jest/globals';
import { normalizeMarketWatchMonth, MONTH_NORMALIZATION } from '../src/utils/dateParser';

describe('Notifier Date Normalization', () => {
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
});
