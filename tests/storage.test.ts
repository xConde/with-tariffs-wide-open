import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';

// Mock the fs module before importing storage
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    unlink: jest.fn(),
    copyFile: jest.fn(),
  },
}));

// Mock logger to suppress output and allow assertion
jest.mock('../src/utils/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { getStoredEvents, isValidEvent, rotateBackups, restoreFromBackup, cleanupStaleTempFiles, updateScrapeTimestamp, getLastScrapeTime, saveEvents } from '../src/storage';
import type { CalendarEvent } from '../src/models/event';

// readFile is overloaded; cast to the utf8 string-returning variant to avoid Buffer type conflicts.
type ReadFileStringFn = (path: Parameters<typeof fs.promises.readFile>[0], encoding: 'utf8') => Promise<string>;
const mockReadFile = fs.promises.readFile as unknown as jest.MockedFunction<ReadFileStringFn>;
const mockMkdir = fs.promises.mkdir as jest.MockedFunction<typeof fs.promises.mkdir>;
const mockWriteFile = fs.promises.writeFile as jest.MockedFunction<typeof fs.promises.writeFile>;
const mockUnlink = fs.promises.unlink as jest.MockedFunction<typeof fs.promises.unlink>;
const mockRename = fs.promises.rename as jest.MockedFunction<typeof fs.promises.rename>;
const mockCopyFile = fs.promises.copyFile as jest.MockedFunction<typeof fs.promises.copyFile>;

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): CalendarEvent {
  return {
    date: 'March 24',
    time: '8:30 AM',
    title: 'GDP Report',
    period: 'Q4',
    ...overrides,
  } as CalendarEvent;
}

describe('isValidEvent()', () => {
  it('returns true for a fully valid event', () => {
    expect(isValidEvent(makeEvent())).toBe(true);
  });

  it('returns true for an event with an empty time (TBA)', () => {
    expect(isValidEvent(makeEvent({ time: '' }))).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidEvent(null)).toBe(false);
  });

  it('returns false for a non-object', () => {
    expect(isValidEvent('string')).toBe(false);
    expect(isValidEvent(42)).toBe(false);
  });

  it('returns false when title is missing', () => {
    const event = { date: 'March 24', time: '8:30 AM' };
    expect(isValidEvent(event)).toBe(false);
  });

  it('returns false when title is an empty string', () => {
    expect(isValidEvent(makeEvent({ title: '' }))).toBe(false);
  });

  it('returns false when date is missing', () => {
    const event = { time: '8:30 AM', title: 'GDP' };
    expect(isValidEvent(event)).toBe(false);
  });

  it('returns false when date is an empty string', () => {
    expect(isValidEvent(makeEvent({ date: '' }))).toBe(false);
  });

  it('returns false when date is a non-string type', () => {
    expect(isValidEvent(makeEvent({ date: 20240324 }))).toBe(false);
  });

  it('returns false when time is a non-string type', () => {
    expect(isValidEvent(makeEvent({ time: null }))).toBe(false);
  });
});

describe('getStoredEvents()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
  });

  it('returns valid events unchanged', async () => {
    const events = [makeEvent(), makeEvent({ title: 'CPI Data' })];
    mockReadFile.mockResolvedValue(JSON.stringify(events));

    const result = await getStoredEvents();
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('GDP Report');
    expect(result[1].title).toBe('CPI Data');
  });

  it('filters out events missing title', async () => {
    const events = [
      makeEvent({ title: 'Valid' }),
      { date: 'March 24', time: '9:00 AM' }, // no title
    ];
    mockReadFile.mockResolvedValue(JSON.stringify(events));

    const result = await getStoredEvents();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Valid');
  });

  it('filters out events with non-string date', async () => {
    const events = [
      makeEvent(),
      { date: 20240324, time: '9:00 AM', title: 'Bad Date Event' },
    ];
    mockReadFile.mockResolvedValue(JSON.stringify(events));

    const result = await getStoredEvents();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('GDP Report');
  });

  it('returns empty array when JSON is not an array', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ date: 'March 24', time: '8:30 AM', title: 'Wrapped' })
    );

    const result = await getStoredEvents();
    expect(result).toHaveLength(0);
  });

  it('returns only valid events from a mixed array', async () => {
    const events = [
      makeEvent({ title: 'Good 1' }),
      { date: '', time: '9:00 AM', title: 'Empty Date' },
      makeEvent({ title: 'Good 2' }),
      { date: 'March 24', time: 123, title: 'Bad Time' },
      { date: 'March 24', time: '10:00 AM', title: '' },
      makeEvent({ title: 'Good 3', time: '' }),
    ];
    mockReadFile.mockResolvedValue(JSON.stringify(events));

    const result = await getStoredEvents();
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.title)).toEqual(['Good 1', 'Good 2', 'Good 3']);
  });

  it('returns empty array when file does not exist (ENOENT)', async () => {
    const enoentError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    mockReadFile.mockRejectedValue(enoentError);

    const result = await getStoredEvents();
    expect(result).toHaveLength(0);
  });

  it('returns events from backup when events.json is corrupted and a valid backup exists', async () => {
    const backupEvents = [makeEvent({ title: 'Backup Event' })];
    // First call: corrupted events.json; second call: valid .bak.1
    mockReadFile
      .mockResolvedValueOnce('not valid json{{{')
      .mockResolvedValueOnce(JSON.stringify(backupEvents));

    const result = await getStoredEvents();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Backup Event');
  });

  it('returns empty array when events.json is corrupted and no backups exist', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    // First call: corrupted events.json; remaining calls: all backups missing
    mockReadFile
      .mockResolvedValueOnce('not valid json{{{')
      .mockRejectedValue(enoent);

    const result = await getStoredEvents();
    expect(result).toHaveLength(0);
  });
});

describe('rotateBackups()', () => {
  const filePath = '/fake/events.json';

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnlink.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
  });

  it('calls unlink on .bak.3', async () => {
    await rotateBackups(filePath);
    expect(mockUnlink).toHaveBeenCalledWith(`${filePath}.bak.3`);
  });

  it('renames .bak.2 to .bak.3', async () => {
    await rotateBackups(filePath);
    expect(mockRename).toHaveBeenCalledWith(`${filePath}.bak.2`, `${filePath}.bak.3`);
  });

  it('renames .bak.1 to .bak.2', async () => {
    await rotateBackups(filePath);
    expect(mockRename).toHaveBeenCalledWith(`${filePath}.bak.1`, `${filePath}.bak.2`);
  });

  it('copies current file to .bak.1', async () => {
    await rotateBackups(filePath);
    expect(mockCopyFile).toHaveBeenCalledWith(filePath, `${filePath}.bak.1`);
  });

  it('executes operations in the correct order', async () => {
    const calls: string[] = [];
    mockUnlink.mockImplementation(async () => { calls.push('unlink'); });
    mockRename.mockImplementation(async (src) => { calls.push(`rename-${src}`); });
    mockCopyFile.mockImplementation(async () => { calls.push('copy'); });

    await rotateBackups(filePath);

    expect(calls).toEqual([
      'unlink',
      `rename-${filePath}.bak.2`,
      `rename-${filePath}.bak.1`,
      'copy',
    ]);
  });

  it('does not throw when unlink fails (file missing)', async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(rotateBackups(filePath)).resolves.toBeUndefined();
  });

  it('does not throw when rename fails (backup missing)', async () => {
    mockRename.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(rotateBackups(filePath)).resolves.toBeUndefined();
  });

  it('does not throw when copyFile fails (source missing)', async () => {
    mockCopyFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(rotateBackups(filePath)).resolves.toBeUndefined();
  });
});

describe('restoreFromBackup()', () => {
  const events: CalendarEvent[] = [makeEvent({ title: 'Restored' })];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array when all backups are missing', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await restoreFromBackup();
    expect(result).toEqual([]);
  });

  it('returns events from .bak.1 when it exists', async () => {
    mockReadFile.mockResolvedValueOnce(JSON.stringify(events));

    const result = await restoreFromBackup();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Restored');
  });

  it('falls through to .bak.2 when .bak.1 is missing', async () => {
    const v2: CalendarEvent[] = [makeEvent({ title: 'from-bak2' })];
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(JSON.stringify(v2));

    const result = await restoreFromBackup();
    expect(result[0].title).toBe('from-bak2');
  });

  it('falls through to .bak.3 when .bak.1 and .bak.2 are missing', async () => {
    const v3: CalendarEvent[] = [makeEvent({ title: 'from-bak3' })];
    mockReadFile
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      .mockResolvedValueOnce(JSON.stringify(v3));

    const result = await restoreFromBackup();
    expect(result[0].title).toBe('from-bak3');
  });

  it('skips a corrupt backup and tries the next one', async () => {
    const v2: CalendarEvent[] = [makeEvent({ title: 'healthy-bak2' })];
    mockReadFile
      .mockResolvedValueOnce('not valid json{{{')
      .mockResolvedValueOnce(JSON.stringify(v2));

    const result = await restoreFromBackup();
    expect(result[0].title).toBe('healthy-bak2');
  });

  it('returns empty array when all backups are corrupt', async () => {
    mockReadFile.mockResolvedValue('{{invalid}}');

    const result = await restoreFromBackup();
    expect(result).toEqual([]);
  });
});

describe('cleanupStaleTempFiles()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls unlink on the .tmp file', async () => {
    mockUnlink.mockResolvedValue(undefined);

    await cleanupStaleTempFiles();

    expect(mockUnlink).toHaveBeenCalledTimes(1);
    const calledWith = (mockUnlink.mock.calls[0] as string[])[0];
    expect(calledWith).toMatch(/events\.json\.tmp$/);
  });

  it('does not throw when the .tmp file does not exist', async () => {
    mockUnlink.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(cleanupStaleTempFiles()).resolves.toBeUndefined();
  });
});

describe('updateScrapeTimestamp()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('writes scraper-state.json with a lastScrape timestamp', async () => {
    const before = Date.now();
    await updateScrapeTimestamp();
    const after = Date.now();

    expect(mockMkdir).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);

    const [filePath, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(filePath).toMatch(/scraper-state\.json$/);
    const parsed = JSON.parse(content) as { lastScrape: number };
    expect(parsed.lastScrape).toBeGreaterThanOrEqual(before);
    expect(parsed.lastScrape).toBeLessThanOrEqual(after);
  });
});

describe('getLastScrapeTime()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the stored timestamp when the file exists', async () => {
    const ts = 1711234567890;
    mockReadFile.mockResolvedValue(JSON.stringify({ lastScrape: ts }));

    const result = await getLastScrapeTime();
    expect(result).toBe(ts);
  });

  it('returns null when the file does not exist (ENOENT)', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await getLastScrapeTime();
    expect(result).toBeNull();
  });

  it('returns null when lastScrape is not a number', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ lastScrape: 'not-a-number' }));

    const result = await getLastScrapeTime();
    expect(result).toBeNull();
  });
});

describe('saveEvents()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockRename.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('calls rotateBackups before writing (unlink + rename + copyFile precede writeFile)', async () => {
    const callOrder: string[] = [];
    mockUnlink.mockImplementation(async () => { callOrder.push('unlink'); });
    mockRename.mockImplementation(async () => { callOrder.push('rename'); });
    mockCopyFile.mockImplementation(async () => { callOrder.push('copy'); });
    mockWriteFile.mockImplementation(async () => { callOrder.push('write'); });

    await saveEvents([makeEvent()]);

    // rotateBackups operations must all precede the writeFile call
    const writeIndex = callOrder.indexOf('write');
    expect(writeIndex).toBeGreaterThan(0);
    expect(callOrder.slice(0, writeIndex)).toContain('copy');
  });

  it('writes to a .tmp file first, then renames to the final path (atomic write)', async () => {
    await saveEvents([makeEvent()]);

    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [writePath] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(writePath).toMatch(/events\.json\.tmp$/);

    expect(mockRename).toHaveBeenCalled();
    // The last rename call moves .tmp → events.json
    const renameCalls = mockRename.mock.calls as [string, string][];
    const finalRename = renameCalls[renameCalls.length - 1];
    expect(finalRename[0]).toMatch(/events\.json\.tmp$/);
    expect(finalRename[1]).toMatch(/events\.json$/);
    expect(finalRename[1]).not.toMatch(/\.tmp$/);
  });

  it('serialises the events array as JSON in the temp file', async () => {
    const events = [makeEvent({ title: 'GDP Report' }), makeEvent({ title: 'CPI Data' })];

    await saveEvents(events);

    const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    const parsed = JSON.parse(content) as CalendarEvent[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe('GDP Report');
    expect(parsed[1].title).toBe('CPI Data');
  });

  it('throws StorageError when writeFile fails', async () => {
    mockWriteFile.mockRejectedValue(new Error('disk full'));

    await expect(saveEvents([makeEvent()])).rejects.toThrow('Failed to save events');
  });

  it('throws StorageError when rename fails', async () => {
    mockRename.mockImplementation(async (src) => {
      // Allow rotateBackups renames (.bak.*) to succeed; reject the final .tmp rename
      if (String(src).endsWith('.tmp')) throw new Error('rename failed');
    });

    await expect(saveEvents([makeEvent()])).rejects.toThrow('Failed to save events');
  });

  it('saves an empty array without throwing', async () => {
    await expect(saveEvents([])).resolves.toBeUndefined();

    const [, content] = mockWriteFile.mock.calls[0] as [string, string, string];
    expect(JSON.parse(content)).toEqual([]);
  });
});
