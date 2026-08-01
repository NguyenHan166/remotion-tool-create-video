import { z } from 'zod';

const requiredString = z.string().trim().min(1, 'Must not be empty');
const positiveInteger = z.coerce.number().int().positive();
const nonNegativeInteger = z.coerce.number().int().nonnegative();

const commonServerEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: requiredString,
  DATABASE_URL: requiredString.refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'Must be a PostgreSQL connection URL',
  ),
  DATA_DIR: requiredString,
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  RENDER_MAX_ATTEMPTS: positiveInteger.default(2),
});

export const webServerEnvironmentSchema = commonServerEnvironmentSchema.extend({
  APP_PORT: positiveInteger.max(65_535).default(3000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  MAX_UPLOAD_MB: positiveInteger.default(1024),
  AUTO_SAVE_DELAY_MS: nonNegativeInteger.default(800),
});

export const workerServerEnvironmentSchema = commonServerEnvironmentSchema.extend({
  RENDER_JOB_CONCURRENCY: positiveInteger.default(1),
  RENDER_FRAME_CONCURRENCY: z
    .string()
    .trim()
    .refine(
      (value) => /^[1-9]\d*$/.test(value) || /^(?:[1-9]|[1-9]\d|100)%$/.test(value),
      'Must be a positive integer or a percentage from 1% to 100%',
    )
    .default('50%'),
  RENDER_JOB_POLL_MS: positiveInteger.default(1000),
  RENDER_STALE_AFTER_MINUTES: positiveInteger.default(30),
  STORAGE_RETENTION_DAYS: nonNegativeInteger.default(30),
  STORAGE_CLEANUP_INTERVAL_MS: positiveInteger.default(6 * 60 * 60_000),
  WORKER_SHUTDOWN_TIMEOUT_MS: positiveInteger.default(30_000),
});

export const clientEnvironmentSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

export type WebServerEnvironment = z.infer<typeof webServerEnvironmentSchema>;
export type WorkerServerEnvironment = z.infer<typeof workerServerEnvironmentSchema>;
export type ClientEnvironment = z.infer<typeof clientEnvironmentSchema>;

export type EnvironmentSource = Record<string, string | undefined>;

type EnvironmentIssue = {
  path: string;
  message: string;
};

export class EnvironmentValidationError extends Error {
  readonly issues: readonly EnvironmentIssue[];

  constructor(scope: string, issues: readonly EnvironmentIssue[]) {
    const details = issues.map(({ path, message }) => `- ${path}: ${message}`).join('\n');

    super(`Invalid ${scope} environment configuration:\n${details}`);
    this.name = 'EnvironmentValidationError';
    this.issues = issues;
  }
}

function readEnvironmentValue(environment: EnvironmentSource, path: PropertyKey[]): unknown {
  let value: unknown = environment;

  for (const segment of path) {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    value = (value as Record<PropertyKey, unknown>)[segment];
  }

  return value;
}

function parseEnvironment<TSchema extends z.ZodType>(
  schema: TSchema,
  environment: EnvironmentSource,
  scope: string,
): z.output<TSchema> {
  const result = schema.safeParse(environment);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join('.') || 'environment',
    message:
      readEnvironmentValue(environment, issue.path) === undefined
        ? 'Required environment variable is missing'
        : issue.message,
  }));

  throw new EnvironmentValidationError(scope, issues);
}

export function parseWebServerEnvironment(environment: EnvironmentSource): WebServerEnvironment {
  return parseEnvironment(webServerEnvironmentSchema, environment, 'web server');
}

export function parseWorkerServerEnvironment(
  environment: EnvironmentSource,
): WorkerServerEnvironment {
  return parseEnvironment(workerServerEnvironmentSchema, environment, 'worker server');
}

export function parseClientEnvironment(environment: EnvironmentSource): ClientEnvironment {
  return parseEnvironment(clientEnvironmentSchema, environment, 'client');
}
