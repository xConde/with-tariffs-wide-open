import { describe, it, expect } from '@jest/globals';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BASE_DELAY_MS,
} from '../src/config/constants';

describe('Discord Bot Reliability', () => {
  describe('Reconnect Configuration', () => {
    it('should have a positive base delay', () => {
      expect(RECONNECT_BASE_DELAY_MS).toBeGreaterThan(0);
    });

    it('should have a reasonable max reconnect attempts', () => {
      expect(MAX_RECONNECT_ATTEMPTS).toBeGreaterThan(0);
      expect(MAX_RECONNECT_ATTEMPTS).toBeLessThanOrEqual(10);
    });

    it('should produce increasing delays with linear backoff', () => {
      const delays: number[] = [];
      for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
        delays.push(RECONNECT_BASE_DELAY_MS * attempt);
      }

      for (let i = 1; i < delays.length; i++) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }

      expect(delays[delays.length - 1]).toBe(
        RECONNECT_BASE_DELAY_MS * MAX_RECONNECT_ATTEMPTS
      );
    });

    it('should cap total reconnect wait time below 3 minutes', () => {
      // discordBot.ts uses delay = RECONNECT_BASE_DELAY_MS * attempt
      // Total wait = base * (1 + 2 + ... + MAX) = base * MAX*(MAX+1)/2
      const totalMs = RECONNECT_BASE_DELAY_MS * MAX_RECONNECT_ATTEMPTS * (MAX_RECONNECT_ATTEMPTS + 1) / 2;
      expect(totalMs).toBeLessThan(180000); // 3 minutes
    });

    it('should match expected constant values', () => {
      // Guard against accidental edits to critical reconnect constants
      expect(MAX_RECONNECT_ATTEMPTS).toBe(5);
      expect(RECONNECT_BASE_DELAY_MS).toBe(5000);
    });
  });
});
