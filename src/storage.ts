import { promises as fs } from 'fs';
import * as path from 'path';
import { CalendarEvent } from './models/event';
import { createLogger } from './utils/logger';

const log = createLogger('storage');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'events.json');

export async function saveEvents(events: CalendarEvent[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Atomic write: write to temp file then rename to prevent corruption on crash
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(events, null, 2), 'utf8');
    await fs.rename(tempFile, DATA_FILE);
  } catch (error) {
    log.error('Error saving events', { error: String(error) });
    throw error;
  }
}

export async function getStoredEvents(): Promise<CalendarEvent[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data) as CalendarEvent[];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    if (error instanceof SyntaxError) {
      log.error('CRITICAL: events.json is corrupted (JSON parse failed)', { error: error.message });
      log.error('Returning empty events - next scheduled scrape will restore data');
      return [];
    }
    log.error('Error reading events', { error: String(error) });
    return [];
  }
}
