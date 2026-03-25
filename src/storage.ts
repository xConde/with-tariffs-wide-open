import { promises as fs } from 'fs';
import * as path from 'path';
import { CalendarEvent } from './models/event';
import { createLogger } from './utils/logger';
import { StorageError } from './errors';

const log = createLogger('storage');

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'events.json');
const SCRAPER_STATE_FILE = path.join(DATA_DIR, 'scraper-state.json');

export function isValidEvent(event: unknown): event is CalendarEvent {
  return (
    typeof event === 'object' && event !== null &&
    typeof (event as Record<string, unknown>).date === 'string' && (event as Record<string, unknown>).date !== '' &&
    typeof (event as Record<string, unknown>).time === 'string' &&
    typeof (event as Record<string, unknown>).title === 'string' && (event as Record<string, unknown>).title !== ''
  );
}

export async function rotateBackups(filePath: string): Promise<void> {
  try {
    await fs.unlink(`${filePath}.bak.3`).catch(() => {});
    await fs.rename(`${filePath}.bak.2`, `${filePath}.bak.3`).catch(() => {});
    await fs.rename(`${filePath}.bak.1`, `${filePath}.bak.2`).catch(() => {});
    await fs.copyFile(filePath, `${filePath}.bak.1`).catch(() => {});
  } catch {
    // Backup rotation is best-effort — don't fail the save
  }
}

export async function restoreFromBackup(): Promise<CalendarEvent[]> {
  for (const suffix of ['.bak.1', '.bak.2', '.bak.3']) {
    try {
      const data = await fs.readFile(`${DATA_FILE}${suffix}`, 'utf8');
      const parsed: unknown = JSON.parse(data);
      if (!Array.isArray(parsed)) continue;
      const events = parsed.filter((e: unknown) => isValidEvent(e));
      if (events.length === 0) continue;
      log.warn(`Restored events from backup ${suffix}`, { count: events.length });
      return events;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code !== 'ENOENT') {
        log.warn(`Backup ${suffix} unreadable`, { error: String(error), code });
      }
      continue;
    }
  }
  return [];
}

export async function updateScrapeTimestamp(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SCRAPER_STATE_FILE, JSON.stringify({ lastScrape: Date.now() }), 'utf8');
}

export async function getLastScrapeTime(): Promise<number | null> {
  try {
    const data = await fs.readFile(SCRAPER_STATE_FILE, 'utf8');
    const parsed: unknown = JSON.parse(data);
    return typeof (parsed as Record<string, unknown>).lastScrape === 'number'
      ? (parsed as Record<string, unknown>).lastScrape as number
      : null;
  } catch { return null; }
}

export async function cleanupStaleTempFiles(): Promise<void> {
  try {
    await fs.unlink(`${DATA_FILE}.tmp`).catch(() => {});
  } catch { /* ignore */ }
}

export async function saveEvents(events: CalendarEvent[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await rotateBackups(DATA_FILE);
    // Atomic write: write to temp file then rename to prevent corruption on crash
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(events, null, 2), 'utf8');
    await fs.rename(tempFile, DATA_FILE);
  } catch (error) {
    log.error('Error saving events', { error: String(error) });
    throw new StorageError(`Failed to save events: ${String(error)}`, { cause: error });
  }
}

export async function getStoredEvents(): Promise<CalendarEvent[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(DATA_FILE, 'utf8');
    const parsed: unknown = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      log.error('events.json is not an array');
      return [];
    }
    const valid = parsed.filter((event: unknown, i: number) => {
      if (!isValidEvent(event)) {
        log.warn('Invalid event filtered out', { index: i });
        return false;
      }
      return true;
    });
    return valid;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    if (error instanceof SyntaxError) {
      log.error('CRITICAL: events.json is corrupted', { error: error.message });
      const recovered = await restoreFromBackup();
      if (recovered.length > 0) {
        log.warn('Recovered events from backup', { count: recovered.length });
        return recovered;
      }
      log.error('No valid backups found — returning empty');
      return [];
    }
    const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code === 'EACCES') {
      log.error('Permission denied reading events.json — check file permissions', { error: String(error) });
    } else if (code === 'EMFILE' || code === 'ENFILE') {
      log.error('Too many open files reading events.json — possible file descriptor leak', { error: String(error) });
    } else {
      log.error('Unexpected error reading events', { error: String(error), code });
    }
    return [];
  }
}
