import { promises as fs } from 'fs';
import * as path from 'path';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_MAX_AGE_MS } from '../config/constants';
import { createLogger } from './logger';

const log = createLogger('health');

const HEARTBEAT_FILE = path.join(__dirname, '../../heartbeat.txt');

let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Writes current timestamp to heartbeat file
 */
async function writeHeartbeat(): Promise<void> {
  try {
    const timestamp = Date.now();
    const data = JSON.stringify({
      timestamp,
      date: new Date(timestamp).toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    }, null, 2);

    await fs.writeFile(HEARTBEAT_FILE, data, 'utf8');
  } catch (error) {
    log.error('Failed to write heartbeat', { error: String(error) });
  }
}

/**
 * Starts periodic heartbeat updates
 */
export async function startHeartbeat(): Promise<NodeJS.Timeout> {
  await writeHeartbeat(); // Write immediately and wait for file to exist

  heartbeatInterval = setInterval(() => {
    writeHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  log.info(`Heartbeat started (updating every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
  return heartbeatInterval;
}

/**
 * Stops heartbeat updates
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    log.info('Heartbeat stopped');
  }
}

/**
 * Checks if bot is healthy based on heartbeat file
 */
export async function checkHealth(): Promise<{ healthy: boolean; lastHeartbeat?: number; uptimeSeconds?: number }> {
  try {
    const data = await fs.readFile(HEARTBEAT_FILE, 'utf8');
    const heartbeat = JSON.parse(data);
    const age = Date.now() - heartbeat.timestamp;

    // Healthy if heartbeat within configured max age
    const healthy = age < HEARTBEAT_MAX_AGE_MS;

    return {
      healthy,
      lastHeartbeat: heartbeat.timestamp,
      uptimeSeconds: heartbeat.uptime,
    };
  } catch {
    return { healthy: false };
  }
}

/**
 * Gets heartbeat file path for external monitoring
 */
export function getHeartbeatPath(): string {
  return HEARTBEAT_FILE;
}
