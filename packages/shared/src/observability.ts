export const REDACTED_VALUE = '[REDACTED]';
export const REDACTED_PATH = '[PATH_REDACTED]';

export type StructuredLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type StructuredLogContext = Readonly<Record<string, unknown>>;

export type StructuredLogEntry = Readonly<{
  timestamp: string;
  level: StructuredLogLevel;
  message: string;
  [key: string]: unknown;
}>;

export type StructuredLogSink = (entry: StructuredLogEntry) => void;

export type StructuredLoggerOptions = Readonly<{
  context?: StructuredLogContext;
  sink?: StructuredLogSink;
  now?: () => Date;
}>;

const sensitiveKeyPattern =
  /(?:password|passwd|token|secret|authorization|cookie|api[-_]?key|credential|private[-_]?key|client[-_]?secret)/iu;
const windowsAbsolutePathPattern = /(?:[a-z]:[\\/])[^\s"'`<>\]}),;]+/giu;
const unixAbsolutePathPattern =
  /(?:\/(?:users|home|var|tmp|private|data|workspace|mnt|opt|root|app|srv|code|repo|project|projects|build)\/)[^\s"'`<>\]}),;]+/giu;
let requestIdCounter = 0;

export function redactAbsolutePaths(value: string): string {
  return value
    .replace(windowsAbsolutePathPattern, REDACTED_PATH)
    .replace(unixAbsolutePathPattern, REDACTED_PATH);
}

function isSensitiveKey(key: string | undefined): boolean {
  return key !== undefined && sensitiveKeyPattern.test(key);
}

export function sanitizeLogValue(value: unknown, key?: string, depth = 0): unknown {
  if (isSensitiveKey(key)) {
    return REDACTED_VALUE;
  }

  if (depth > 6) {
    return '[DEPTH_LIMIT]';
  }

  if (typeof value === 'string') {
    return redactAbsolutePaths(value);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return typeof value === 'bigint' ? value.toString() : value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactAbsolutePaths(value.message),
      ...(value.stack === undefined ? {} : { stack: redactAbsolutePaths(value.stack) }),
      ...(value.cause === undefined
        ? {}
        : { cause: sanitizeLogValue(value.cause, 'cause', depth + 1) }),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, undefined, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = sanitizeLogValue(childValue, childKey, depth + 1);
    }

    return result;
  }

  return String(value);
}

function defaultSink(entry: StructuredLogEntry): void {
  const line = JSON.stringify(entry);

  if (entry.level === 'error') {
    console.error(line);
  } else if (entry.level === 'warn') {
    console.warn(line);
  } else if (entry.level === 'debug') {
    console.debug(line);
  } else {
    console.info(line);
  }
}

export function normalizeRequestId(value: string | null | undefined): string {
  const candidate = value?.trim();

  return candidate !== undefined && /^[A-Za-z0-9._:-]{1,128}$/u.test(candidate)
    ? candidate
    : `req-${Date.now().toString(36)}-${(requestIdCounter++).toString(36)}`;
}

export class StructuredLogger {
  readonly #context: StructuredLogContext;
  readonly #sink: StructuredLogSink;
  readonly #now: () => Date;

  constructor({
    context = {},
    sink = defaultSink,
    now = () => new Date(),
  }: StructuredLoggerOptions = {}) {
    this.#context = context;
    this.#sink = sink;
    this.#now = now;
  }

  child(context: StructuredLogContext): StructuredLogger {
    return new StructuredLogger({
      context: { ...this.#context, ...context },
      sink: this.#sink,
      now: this.#now,
    });
  }

  log(
    level: StructuredLogLevel,
    message: string,
    context: StructuredLogContext = {},
    error?: unknown,
  ): StructuredLogEntry {
    const safeContext = sanitizeLogValue({ ...this.#context, ...context }) as Record<
      string,
      unknown
    >;
    const entry: StructuredLogEntry = {
      ...safeContext,
      ...(error === undefined ? {} : { error: sanitizeLogValue(error, 'error') }),
      timestamp: this.#now().toISOString(),
      level,
      message: redactAbsolutePaths(message),
    };

    this.#sink(entry);
    return entry;
  }

  debug(message: string, context: StructuredLogContext = {}): StructuredLogEntry {
    return this.log('debug', message, context);
  }

  info(message: string, context: StructuredLogContext = {}): StructuredLogEntry {
    return this.log('info', message, context);
  }

  warn(message: string, context: StructuredLogContext = {}, error?: unknown): StructuredLogEntry {
    return this.log('warn', message, context, error);
  }

  error(message: string, context: StructuredLogContext = {}, error?: unknown): StructuredLogEntry {
    return this.log('error', message, context, error);
  }
}

export function createStructuredLogger(options: StructuredLoggerOptions = {}): StructuredLogger {
  return new StructuredLogger(options);
}
