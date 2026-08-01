import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EnvironmentValidationError,
  parseClientEnvironment,
  parseWebServerEnvironment,
  parseWorkerServerEnvironment,
} from '../packages/shared/src/environment.js';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const requiredServerEnvironment = {
  APP_VERSION: '0.1.0',
  DATABASE_URL: 'postgresql://hansys:secret@localhost:5432/hansys_video',
  DATA_DIR: '/data',
};

function readExampleEnvironment(): Record<string, string> {
  const contents = readFileSync(join(repositoryRoot, '.env.example'), 'utf8');

  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');

        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );
}

describe('environment validation', () => {
  it('parses web values and applies documented defaults', () => {
    const environment = parseWebServerEnvironment({
      ...requiredServerEnvironment,
      APP_PORT: '4000',
      MAX_UPLOAD_MB: '512',
    });

    expect(environment).toEqual({
      ...requiredServerEnvironment,
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      APP_PORT: 4000,
      APP_URL: 'http://localhost:3000',
      MAX_UPLOAD_MB: 512,
      AUTO_SAVE_DELAY_MS: 800,
      RENDER_MAX_ATTEMPTS: 2,
    });
  });

  it('returns a clear startup error for missing required server variables', () => {
    expect(() => parseWebServerEnvironment({})).toThrowError(EnvironmentValidationError);

    try {
      parseWebServerEnvironment({});
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as Error).message).toContain('Invalid web server environment configuration:');
      expect((error as Error).message).toContain(
        '- APP_VERSION: Required environment variable is missing',
      );
      expect((error as Error).message).toContain(
        '- DATABASE_URL: Required environment variable is missing',
      );
      expect((error as Error).message).toContain(
        '- DATA_DIR: Required environment variable is missing',
      );
    }
  });

  it('validates worker rendering settings', () => {
    const environment = parseWorkerServerEnvironment(requiredServerEnvironment);

    expect(environment.RENDER_JOB_CONCURRENCY).toBe(1);
    expect(environment.RENDER_FRAME_CONCURRENCY).toBe('50%');
    expect(environment.RENDER_JOB_POLL_MS).toBe(1000);
    expect(environment.RENDER_STALE_AFTER_MINUTES).toBe(30);
    expect(environment.RENDER_MAX_ATTEMPTS).toBe(2);
    expect(environment.STORAGE_RETENTION_DAYS).toBe(30);
    expect(environment.STORAGE_CLEANUP_INTERVAL_MS).toBe(6 * 60 * 60_000);
    expect(environment.WORKER_SHUTDOWN_TIMEOUT_MS).toBe(30_000);

    expect(() =>
      parseWorkerServerEnvironment({
        ...requiredServerEnvironment,
        RENDER_FRAME_CONCURRENCY: '101%',
      }),
    ).toThrowError(/percentage from 1% to 100%/);
  });

  it('requires the public client URL without exposing server variables', () => {
    expect(() => parseClientEnvironment({})).toThrowError(
      /NEXT_PUBLIC_APP_URL: Required environment variable is missing/,
    );

    const environment = parseClientEnvironment({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      DATABASE_URL: requiredServerEnvironment.DATABASE_URL,
    });

    expect(environment).toEqual({
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    });
    expect(environment).not.toHaveProperty('DATABASE_URL');
  });

  it('keeps the example environment valid for every runtime schema', () => {
    const exampleEnvironment = readExampleEnvironment();

    expect(() => parseWebServerEnvironment(exampleEnvironment)).not.toThrow();
    expect(() => parseWorkerServerEnvironment(exampleEnvironment)).not.toThrow();
    expect(() => parseClientEnvironment(exampleEnvironment)).not.toThrow();
  });
});
