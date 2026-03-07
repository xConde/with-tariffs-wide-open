import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { createLogger } from '../../src/utils/logger';

describe('Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof jest.spyOn>;
    warn: ReturnType<typeof jest.spyOn>;
    error: ReturnType<typeof jest.spyOn>;
  };
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalLogFormat = process.env.LOG_FORMAT;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_FORMAT = 'text';
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
    process.env.LOG_LEVEL = originalLogLevel;
    process.env.LOG_FORMAT = originalLogFormat;
  });

  describe('log levels', () => {
    it('outputs at all four levels', () => {
      const log = createLogger('test');
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');

      expect(consoleSpy.log).toHaveBeenCalledTimes(2); // debug + info
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('respects LOG_LEVEL threshold — hides debug at info level', () => {
      process.env.LOG_LEVEL = 'info';
      const log = createLogger('test');
      log.debug('hidden');
      log.info('visible');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect(consoleSpy.log.mock.calls[0][0]).toContain('visible');
    });

    it('respects LOG_LEVEL threshold — only error at error level', () => {
      process.env.LOG_LEVEL = 'error';
      const log = createLogger('test');
      log.debug('hidden');
      log.info('hidden');
      log.warn('hidden');
      log.error('visible');

      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    it('defaults to info level for invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'garbage';
      const log = createLogger('test');
      log.debug('hidden');
      log.info('visible');

      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('text format', () => {
    it('includes timestamp, level tag, and module name', () => {
      const log = createLogger('scheduler');
      log.info('Events updated');

      const output = consoleSpy.log.mock.calls[0][0] as string;
      expect(output).toMatch(/^\[\d{4}-\d{2}-\d{2}T/); // ISO timestamp
      expect(output).toContain('[INFO]');
      expect(output).toContain('[scheduler]');
      expect(output).toContain('Events updated');
    });

    it('includes data as JSON when provided', () => {
      const log = createLogger('test');
      log.info('count', { events: 15 });

      const output = consoleSpy.log.mock.calls[0][0] as string;
      expect(output).toContain('{"events":15}');
    });

    it('omits data when not provided', () => {
      const log = createLogger('test');
      log.info('simple message');

      const output = consoleSpy.log.mock.calls[0][0] as string;
      expect(output).not.toContain('{');
    });
  });

  describe('JSON format', () => {
    it('outputs valid JSON with all fields', () => {
      process.env.LOG_FORMAT = 'json';
      const log = createLogger('notifier');
      log.warn('timeout expired', { eventId: 'abc' });

      const output = consoleSpy.warn.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.level).toBe('warn');
      expect(parsed.module).toBe('notifier');
      expect(parsed.message).toBe('timeout expired');
      expect(parsed.data).toEqual({ eventId: 'abc' });
    });

    it('omits data field when not provided', () => {
      process.env.LOG_FORMAT = 'json';
      const log = createLogger('test');
      log.info('no data');

      const output = consoleSpy.log.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.data).toBeUndefined();
    });
  });

  describe('circular reference safety', () => {
    it('handles circular references in data without throwing', () => {
      const log = createLogger('test');
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      // Should not throw
      expect(() => log.info('circular data', circular)).not.toThrow();
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
      expect((consoleSpy.log.mock.calls[0][0] as string)).toContain('[unserializable]');
    });
  });

  describe('module context', () => {
    it('different loggers use different module names', () => {
      const log1 = createLogger('scheduler');
      const log2 = createLogger('notifier');

      log1.info('from scheduler');
      log2.info('from notifier');

      expect((consoleSpy.log.mock.calls[0][0] as string)).toContain('[scheduler]');
      expect((consoleSpy.log.mock.calls[1][0] as string)).toContain('[notifier]');
    });
  });
});
