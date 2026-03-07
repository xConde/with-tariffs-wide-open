type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (env in LEVEL_PRIORITY) return env as LogLevel;
  return 'info';
}

function isJsonFormat(): boolean {
  return (process.env.LOG_FORMAT || 'text').toLowerCase() === 'json';
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return '[unserializable]';
  }
}

function formatText(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const tag = level.toUpperCase();
  let line = `[${timestamp}] [${tag}] [${module}] ${message}`;
  if (data !== undefined) {
    line += ` ${safeStringify(data)}`;
  }
  return line;
}

function formatJson(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
  };
  if (data !== undefined) {
    entry.data = data;
  }
  return safeStringify(entry);
}

export function createLogger(module: string): Logger {
  function emit(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const threshold = getConfiguredLevel();
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[threshold]) return;

    const output = isJsonFormat()
      ? formatJson(level, module, message, data)
      : formatText(level, module, message, data);

    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (message, data) => emit('debug', message, data),
    info: (message, data) => emit('info', message, data),
    warn: (message, data) => emit('warn', message, data),
    error: (message, data) => emit('error', message, data),
  };
}
