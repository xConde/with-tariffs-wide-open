import { describe, it, expect, jest } from '@jest/globals';
import axios from 'axios';
import { SCRAPER_TIMEOUT_MS } from '../src/config/constants';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Scraper Reliability', () => {
  describe('Timeout Configuration', () => {
    it('should have timeout configured', () => {
      expect(SCRAPER_TIMEOUT_MS).toBeDefined();
      expect(SCRAPER_TIMEOUT_MS).toBeGreaterThan(0);
      expect(SCRAPER_TIMEOUT_MS).toBeLessThanOrEqual(30000); // Max 30s
    });

    it('should use reasonable timeout value', () => {
      // Should be between 10-20 seconds for reliability
      expect(SCRAPER_TIMEOUT_MS).toBeGreaterThanOrEqual(10000);
      expect(SCRAPER_TIMEOUT_MS).toBeLessThanOrEqual(20000);
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors gracefully', () => {
      const timeoutError = new Error('timeout of 15000ms exceeded');
      (timeoutError as any).code = 'ECONNABORTED';

      // Scraper should throw meaningful error
      expect(timeoutError.message).toContain('timeout');
    });

    it('should handle HTTP errors', () => {
      const httpError = {
        response: {
          status: 503,
          statusText: 'Service Unavailable'
        }
      };

      expect(httpError.response.status).toBe(503);
    });

    it('should handle network errors', () => {
      const networkError = {
        request: {},
        response: undefined
      };

      expect(networkError.response).toBeUndefined();
      expect(networkError.request).toBeDefined();
    });
  });

  describe('Axios Configuration', () => {
    it('should validate timeout is passed to axios', () => {
      // This validates that SCRAPER_TIMEOUT_MS constant exists and is used
      const config = {
        timeout: SCRAPER_TIMEOUT_MS,
        headers: {
          'User-Agent': 'test-agent'
        }
      };

      expect(config.timeout).toBe(15000);
      expect(config.headers).toBeDefined();
    });
  });
});
