import { describe, expect, it, vi } from 'vitest';
import { persistRenderFailure } from '../apps/worker/src/render-failure-runtime.js';
import {
  RenderPipelineError,
  classifyRenderFailure,
  getAutomaticRetryDelayMs,
} from '../apps/worker/src/render-errors.js';

describe('render failure classification', () => {
  it.each([
    [
      Object.assign(new Error('Invalid snapshot'), { code: 'PROJECT_DOCUMENT_MIGRATION_FAILED' }),
      'PROJECT_SCHEMA_INVALID',
    ],
    [
      Object.assign(new Error('Missing template'), { code: 'TEMPLATE_NOT_FOUND' }),
      'TEMPLATE_NOT_FOUND',
    ],
    [
      Object.assign(new Error('Invalid template content'), {
        name: 'RenderRevisionTemplateError',
        code: 'PROJECT_VALIDATION_FAILED',
      }),
      'TEMPLATE_VALIDATION_FAILED',
    ],
    [
      Object.assign(new Error('Asset not ready'), { code: 'RENDER_REVISION_ASSET_INVALID' }),
      'ASSET_METADATA_MISSING',
    ],
    [Object.assign(new Error('disk full'), { code: 'ENOSPC' }), 'STORAGE_FULL'],
    [new Error('FFmpeg exited with status 1'), 'FFMPEG_FAILED'],
    [new Error('renderMedia() got cancelled'), 'RENDER_CANCELLED'],
  ])('classifies a deterministic error as %s', (error, expectedCode) => {
    expect(classifyRenderFailure(error)).toMatchObject({
      code: expectedCode,
      transient: false,
    });
  });

  it('preserves typed pipeline errors and their safe message', () => {
    const cause = new Error('ENOENT D:\\private\\asset.mp4');
    const failure = classifyRenderFailure(
      new RenderPipelineError('ASSET_FILE_MISSING', 'Asset file could not be read.', { cause }),
    );

    expect(failure).toMatchObject({
      code: 'ASSET_FILE_MISSING',
      safeMessage: 'A referenced asset file is missing.',
      transient: false,
    });
    expect(failure.safeMessage).not.toContain('private');
    expect(failure.technicalError).toContain('asset.mp4');
  });

  it.each([
    [new Error('Protocol error: Target closed'), 'BROWSER_CRASHED'],
    [Object.assign(new Error('resource busy'), { code: 'EBUSY' }), 'UNKNOWN_RENDER_ERROR'],
  ])('retries only a recognized transient failure', (error, expectedCode) => {
    expect(classifyRenderFailure(error)).toMatchObject({
      code: expectedCode,
      transient: true,
    });
  });

  it('does not automatically retry timeouts or unknown deterministic failures', () => {
    expect(classifyRenderFailure(new Error('Render timed out after 30 seconds'))).toMatchObject({
      code: 'RENDER_TIMEOUT',
      transient: false,
    });
    expect(classifyRenderFailure(new Error('Component threw on frame 4'))).toMatchObject({
      code: 'UNKNOWN_RENDER_ERROR',
      transient: false,
    });
  });

  it('uses bounded exponential backoff between automatic attempts', () => {
    expect(getAutomaticRetryDelayMs(1)).toBe(1_000);
    expect(getAutomaticRetryDelayMs(2)).toBe(2_000);
    expect(getAutomaticRetryDelayMs(10)).toBe(30_000);
    expect(() => getAutomaticRetryDelayMs(0)).toThrowError(RangeError);
  });

  it('passes deterministic classification to persistence without enabling auto-retry', async () => {
    const failedAt = new Date('2026-07-31T16:00:00.000Z');
    const job = { id: '11111111-1111-4111-8111-111111111111', attempt: 1 };
    const failedJob = { id: job.id } as never;
    const recordFailure = vi.fn().mockResolvedValue({ action: 'FAILED', job: failedJob });

    await expect(
      persistRenderFailure({
        job,
        workerId: 'worker-a',
        error: new RenderPipelineError('COMPOSITION_SELECT_FAILED', 'Invalid component output.'),
        recordFailure,
        now: () => failedAt,
      }),
    ).resolves.toMatchObject({
      failure: {
        code: 'COMPOSITION_SELECT_FAILED',
        transient: false,
      },
      disposition: { action: 'FAILED' },
    });
    expect(recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        transient: false,
        failedAt,
        retryAt: new Date('2026-07-31T16:00:01.000Z'),
      }),
    );
  });
});
