import { describe, it, expect } from '@jest/globals';
import { ScraperError, StorageError, ValidationError } from '../src/errors';

describe('ScraperError', () => {
  it('has correct name', () => {
    const err = new ScraperError('something failed', true);
    expect(err.name).toBe('ScraperError');
  });

  it('sets retryable: true', () => {
    const err = new ScraperError('network timeout', true);
    expect(err.retryable).toBe(true);
  });

  it('sets retryable: false', () => {
    const err = new ScraperError('html structure changed', false);
    expect(err.retryable).toBe(false);
  });

  it('is an instance of Error', () => {
    const err = new ScraperError('test', true);
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves message', () => {
    const err = new ScraperError('MarketWatch HTTP 403', false);
    expect(err.message).toBe('MarketWatch HTTP 403');
  });

  it('supports cause via options', () => {
    const cause = new Error('original');
    const err = new ScraperError('wrapped', false, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('StorageError', () => {
  it('has correct name', () => {
    const err = new StorageError('write failed');
    expect(err.name).toBe('StorageError');
  });

  it('is an instance of Error', () => {
    const err = new StorageError('write failed');
    expect(err).toBeInstanceOf(Error);
  });

  it('preserves message', () => {
    const err = new StorageError('Failed to save events: ENOSPC');
    expect(err.message).toBe('Failed to save events: ENOSPC');
  });
});

describe('ValidationError', () => {
  it('has correct name', () => {
    const err = new ValidationError('invalid input');
    expect(err.name).toBe('ValidationError');
  });

  it('is an instance of Error', () => {
    const err = new ValidationError('invalid input');
    expect(err).toBeInstanceOf(Error);
  });
});
