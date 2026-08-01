import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  StructuredLogger,
  normalizeRequestId,
  redactAbsolutePaths,
  sanitizeLogValue,
} from '../packages/shared/src/observability.js';
import {
  RenderDiagnostics,
  persistRenderDiagnostics,
} from '../apps/worker/src/render-diagnostics.js';
import { initializeStorage } from '../packages/storage/src/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('structured logging', () => {
  it('preserves context while redacting secrets and absolute paths', () => {
    const entries: unknown[] = [];
    const logger = new StructuredLogger({
      context: { requestId: 'request-1', jobId: 'job-1' },
      sink: (entry) => entries.push(entry),
      now: () => new Date('2026-08-01T08:00:00.000Z'),
    });

    logger.error(
      'render.failed at E:\\private\\render.mp4',
      {
        authorization: 'Bearer secret-token',
        relativePath: 'logs/job-1/attempt-1.jsonl',
        outputLocation: 'E:\\private\\render.mp4',
      },
      new Error('ffmpeg failed at /home/runner/private/output.mp4'),
    );

    expect(entries[0]).toMatchObject({
      requestId: 'request-1',
      jobId: 'job-1',
      level: 'error',
      timestamp: '2026-08-01T08:00:00.000Z',
      authorization: '[REDACTED]',
      relativePath: 'logs/job-1/attempt-1.jsonl',
      outputLocation: '[PATH_REDACTED]',
    });
    expect(JSON.stringify(entries[0])).not.toContain('secret-token');
    expect(JSON.stringify(entries[0])).not.toContain('private\\render.mp4');
    expect(JSON.stringify(entries[0])).not.toContain('/home/runner');
  });

  it('generates bounded request IDs and sanitizes nested values', () => {
    expect(normalizeRequestId('request:trusted-1')).toBe('request:trusted-1');
    expect(normalizeRequestId('bad request')).toMatch(/^req-[a-z0-9]+-[a-z0-9]+$/u);
    expect(redactAbsolutePaths('C:\\data\\render.mp4')).toBe('[PATH_REDACTED]');
    expect(sanitizeLogValue({ apiKey: 'hidden', nested: [{ path: '/tmp/output.log' }] })).toEqual({
      apiKey: '[REDACTED]',
      nested: [{ path: '[PATH_REDACTED]' }],
    });
  });
});

describe('render diagnostics', () => {
  it('writes redacted JSONL diagnostics under a relative logs path', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'hansys-diagnostics-'));
    temporaryDirectories.push(parent);
    const paths = await initializeStorage(join(parent, 'data'));
    const diagnostics = new RenderDiagnostics(
      {
        renderJobId: '11111111-1111-4111-8111-111111111111',
        workerId: 'worker-1',
        attempt: 2,
      },
      () => new Date('2026-08-01T08:00:00.000Z'),
    );
    const logger = new StructuredLogger({
      context: { renderJobId: '11111111-1111-4111-8111-111111111111', workerId: 'worker-1' },
      sink: (entry) => diagnostics.capture(entry),
      now: () => new Date('2026-08-01T08:00:00.000Z'),
    });

    logger.info('render.started', { sourcePath: 'D:\\workspace\\video.ts' });
    diagnostics.captureBrowserLog({
      text: 'Browser warning from /tmp/secret.log',
      type: 'warning',
      stackTrace: [{ url: 'file:///D:/workspace/video.ts', lineNumber: 1 }],
    });
    diagnostics.captureFailure(new Error('Crash at C:\\private\\browser.exe'));

    const output = await persistRenderDiagnostics(
      paths,
      {
        renderJobId: '11111111-1111-4111-8111-111111111111',
        workerId: 'worker-1',
        attempt: 2,
      },
      diagnostics,
    );
    const contents = await readFile(join(paths.root, output.relativePath), 'utf8');

    expect(output).toMatchObject({
      kind: 'LOG',
      relativePath: 'logs/11111111-1111-4111-8111-111111111111/attempt-2.jsonl',
      mimeType: 'application/x-ndjson',
      metadata: { redacted: true },
    });
    expect(contents).toContain('render.diagnostic_started');
    expect(contents).not.toContain('D:\\workspace');
    expect(contents).not.toContain('/tmp/secret.log');
    expect(contents).not.toContain('C:\\private');
    expect(contents).not.toContain(paths.root);
    expect(contents.trim().split('\n')).toHaveLength(4);
  });
});
