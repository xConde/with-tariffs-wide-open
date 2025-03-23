import { promises as fs } from 'fs';
import * as path from 'path';
import { CalendarEvent } from './models/event';

const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'events.json');

export async function saveEvents(events: CalendarEvent[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(events, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving events:', error);
    throw error;
  }
}

export async function getStoredEvents(): Promise<CalendarEvent[]> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data) as CalendarEvent[];
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error reading events:', error);
    throw error;
  }
}
