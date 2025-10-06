import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { startHeartbeat, stopHeartbeat, checkHealth, getHeartbeatPath } from '../../src/utils/healthCheck';
import { promises as fs } from 'fs';

describe('Health Check System', () => {
  afterEach(() => {
    stopHeartbeat();
  });

  describe('Heartbeat File', () => {
    it('should have valid heartbeat file path', () => {
      const path = getHeartbeatPath();
      expect(path).toContain('heartbeat.txt');
      expect(path).toBeTruthy();
    });

    it('should create heartbeat file on start', async () => {
      startHeartbeat();

      await new Promise(resolve => setTimeout(resolve, 100));

      const path = getHeartbeatPath();
      try {
        const exists = await fs.access(path).then(() => true).catch(() => false);
        expect(exists).toBe(true);

        if (exists) {
          const data = await fs.readFile(path, 'utf8');
          const parsed = JSON.parse(data);
          expect(parsed.timestamp).toBeDefined();
          expect(parsed.date).toBeDefined();
        }
      } finally {
        await fs.unlink(path).catch(() => {});
      }
    });

    it('should stop heartbeat cleanly', () => {
      const interval = startHeartbeat();
      expect(interval).toBeDefined();

      stopHeartbeat();
      expect(() => stopHeartbeat()).not.toThrow();
    });
  });

  describe('Health Check', () => {
    it('should return healthy status with recent heartbeat', async () => {
      startHeartbeat();
      await new Promise(resolve => setTimeout(resolve, 200));

      const health = await checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.lastHeartbeat).toBeDefined();

      stopHeartbeat();
      await fs.unlink(getHeartbeatPath()).catch(() => {});
    });

    it('should return unhealthy when file missing', async () => {
      const health = await checkHealth();
      expect(health.healthy).toBe(false);
    });
  });

  describe('Heartbeat Data', () => {
    it('should include timestamp', async () => {
      startHeartbeat();
      await new Promise(resolve => setTimeout(resolve, 100));

      const data = await fs.readFile(getHeartbeatPath(), 'utf8');
      const parsed = JSON.parse(data);

      expect(parsed.timestamp).toBeGreaterThan(0);
      expect(typeof parsed.timestamp).toBe('number');

      await fs.unlink(getHeartbeatPath()).catch(() => {});
    });

    it('should include uptime', async () => {
      startHeartbeat();
      await new Promise(resolve => setTimeout(resolve, 100));

      const data = await fs.readFile(getHeartbeatPath(), 'utf8');
      const parsed = JSON.parse(data);

      expect(parsed.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof parsed.uptime).toBe('number');

      await fs.unlink(getHeartbeatPath()).catch(() => {});
    });
  });
});
