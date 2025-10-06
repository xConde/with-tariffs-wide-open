import { describe, it, expect } from '@jest/globals';

describe('Notification Message Logic', () => {
  describe('Beat/Miss Prediction', () => {
    function predictBeat(actual: string, forecast: string): 'beat' | 'miss' | 'neutral' {
      const a = parseFloat(actual.replace(/[^0-9.-]/g, ''));
      const f = parseFloat(forecast.replace(/[^0-9.-]/g, ''));

      if (isNaN(a) || isNaN(f)) return 'neutral';
      if (a > f) return 'beat';
      if (a < f) return 'miss';
      return 'neutral';
    }

    it('should detect beat when actual > forecast', () => {
      expect(predictBeat('5.2%', '5.0%')).toBe('beat');
      expect(predictBeat('100', '99')).toBe('beat');
    });

    it('should detect miss when actual < forecast', () => {
      expect(predictBeat('4.8%', '5.0%')).toBe('miss');
      expect(predictBeat('99', '100')).toBe('miss');
    });

    it('should return neutral when equal', () => {
      expect(predictBeat('5.0%', '5.0%')).toBe('neutral');
      expect(predictBeat('100', '100')).toBe('neutral');
    });

    it('should handle malformed data', () => {
      expect(predictBeat('N/A', '5.0%')).toBe('neutral');
      expect(predictBeat('5.0%', 'N/A')).toBe('neutral');
      expect(predictBeat('', '')).toBe('neutral');
    });

    it('should handle negative numbers', () => {
      expect(predictBeat('-2.0%', '-3.0%')).toBe('beat');
      expect(predictBeat('-4.0%', '-3.0%')).toBe('miss');
    });
  });

  describe('Beat/Miss Indicator', () => {
    function getBeatMissIndicator(prediction: 'beat' | 'miss' | 'neutral'): string {
      if (prediction === 'beat') return '↑ Higher';
      if (prediction === 'miss') return '↓ Lower';
      return '– Expected';
    }

    it('should return correct indicator for beat', () => {
      expect(getBeatMissIndicator('beat')).toBe('↑ Higher');
    });

    it('should return correct indicator for miss', () => {
      expect(getBeatMissIndicator('miss')).toBe('↓ Lower');
    });

    it('should return correct indicator for neutral', () => {
      expect(getBeatMissIndicator('neutral')).toBe('– Expected');
    });
  });

  describe('Window text formatting', () => {
    function formatWindowText(windowMinutes: number): string {
      return windowMinutes === 30 ? '30-Minutes' : windowMinutes === 1 ? '1-Minute' : `${windowMinutes}-Minute`;
    }

    it('should format 30-minute window', () => {
      expect(formatWindowText(30)).toBe('30-Minutes');
    });

    it('should format 1-minute window', () => {
      expect(formatWindowText(1)).toBe('1-Minute');
    });

    it('should format custom window', () => {
      expect(formatWindowText(15)).toBe('15-Minute');
    });
  });
});
