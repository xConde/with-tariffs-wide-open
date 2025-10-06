import { promises as fs } from 'fs';
import * as path from 'path';

const HEARTBEAT_FILE = path.join(__dirname, '../../heartbeat.txt');
const HEARTBEAT_INTERVAL_MS = 60000; // 1 minute

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
    console.error('Failed to write heartbeat:', error);
  }
}

/**
 * Starts periodic heartbeat updates
 */
export function startHeartbeat(): NodeJS.Timeout {
  writeHeartbeat(); // Write immediately

  heartbeatInterval = setInterval(() => {
    writeHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`Heartbeat started (updating every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
  return heartbeatInterval;
}

/**
 * Stops heartbeat updates
 */
export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log('Heartbeat stopped');
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

    // Healthy if heartbeat within last 2 minutes
    const healthy = age < 120000;

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
