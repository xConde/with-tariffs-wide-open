export class ScraperError extends Error {
  readonly retryable: boolean;
  readonly cause?: unknown;

  constructor(message: string, retryable: boolean, options?: { cause?: unknown }) {
    super(message);
    this.name = 'ScraperError';
    this.retryable = retryable;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class StorageError extends Error {
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'StorageError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
