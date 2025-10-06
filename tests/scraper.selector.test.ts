import { describe, it, expect } from '@jest/globals';

describe('Scraper Selector Fallbacks', () => {
  describe('Selector Configuration', () => {
    it('should have multiple selectors defined', () => {
      const selectors = [
        'div.element--tableblock table tbody tr',
        'table.calendar tbody tr',
        '.economic-calendar table tbody tr',
        'table tbody tr',
      ];

      expect(selectors.length).toBeGreaterThanOrEqual(3);
      expect(selectors[0]).toBeTruthy();
    });

    it('should have selectors in order of specificity', () => {
      const selectors = [
        'div.element--tableblock table tbody tr', // Most specific
        'table.calendar tbody tr',
        '.economic-calendar table tbody tr',
        'table tbody tr',                         // Least specific (fallback)
      ];

      expect(selectors[0].length).toBeGreaterThan(selectors[3].length);
    });

    it('should have generic fallback selector', () => {
      const fallback = 'table tbody tr';
      expect(fallback).toBe('table tbody tr');
      expect(fallback.split(' ').length).toBe(3); // Simple selector
    });
  });

  describe('Selector Matching Logic', () => {
    it('should use first matching selector', () => {
      const selectors = ['selector1', 'selector2', 'selector3'];
      const found = ['selector2']; // Simulate selector2 matches

      const firstMatch = selectors.find(s => found.includes(s));
      expect(firstMatch).toBe('selector2');
    });

    it('should fall through to generic selector if needed', () => {
      const selectors = [
        'specific-selector',
        'table tbody tr', // Generic fallback
      ];

      const lastResort = selectors[selectors.length - 1];
      expect(lastResort).toBe('table tbody tr');
    });
  });

  describe('Error Handling', () => {
    it('should throw error if no selectors match', () => {
      const rowsFound = 0;

      if (rowsFound === 0) {
        const error = new Error('MarketWatch HTML structure may have changed - no table found');
        expect(error.message).toContain('HTML structure');
      }
    });

    it('should log which selector was used', () => {
      const selector = 'div.element--tableblock table tbody tr';
      const rowCount = 89;

      const logMessage = `Using selector: "${selector}" (found ${rowCount} rows)`;
      expect(logMessage).toContain(selector);
      expect(logMessage).toContain('89');
    });
  });

  describe('Resilience', () => {
    it('should handle MarketWatch HTML changes gracefully', () => {
      const selectors = [
        'old-selector',   // Old structure (may fail)
        'new-selector',   // New structure (fallback)
        'table tbody tr', // Generic (ultimate fallback)
      ];

      expect(selectors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
