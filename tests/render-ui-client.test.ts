import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RenderApiError,
  cancelRender,
  createRender,
  fetchRenders,
  getRenderDownloadUrl,
  getRenderPollingInterval,
  getRenderProgressPercent,
  getRenderThumbnailUrl,
  isActiveRenderStatus,
  retryRender,
  type RenderJobDto,
  type RenderJobPageDto,
  type RenderStatus,
} from '../apps/web/src/renders/client.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const renderId = '22222222-2222-4222-8222-222222222222';

function createJob(status: RenderStatus, progress = 0): RenderJobDto {
  return {
    id: renderId,
    projectId,
    revisionId: '33333333-3333-4333-8333-333333333333',
    status,
    preset: 'vertical-h264',
    priority: 0,
    progress,
    renderedFrames: null,
    encodedFrames: null,
    totalFrames: null,
    stageMessage: null,
    attempt: 1,
    maxAttempts: 2,
    errorCode: status === 'FAILED' ? 'OUTPUT_PROBE_FAILED' : null,
    errorMessage: status === 'FAILED' ? 'The rendered video could not be verified.' : null,
    availableAt: '2026-08-01T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    outputs: [],
  };
}

function createPage(job: RenderJobDto): RenderJobPageDto {
  return {
    items: [job],
    page: 1,
    pageSize: 10,
    total: 1,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('render queue client', () => {
  it('lists project renders with pagination and forwards abort signals', async () => {
    const page = createPage(createJob('QUEUED'));
    const fetchMock = vi.fn(async () => Response.json(page));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      fetchRenders({ projectId, page: 2, pageSize: 5 }, controller.signal),
    ).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/renders?projectId=${projectId}&page=2&pageSize=5`,
      { signal: controller.signal },
    );
  });

  it('creates, cancels and retries render jobs through the documented endpoints', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(createJob('QUEUED')))
      .mockResolvedValueOnce(Response.json(createJob('CANCEL_REQUESTED', 0.4)))
      .mockResolvedValueOnce(Response.json(createJob('QUEUED')));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createRender(projectId, 'vertical-high')).resolves.toMatchObject({
      status: 'QUEUED',
    });
    await expect(cancelRender(renderId)).resolves.toMatchObject({
      status: 'CANCEL_REQUESTED',
    });
    await expect(retryRender(renderId)).resolves.toMatchObject({ status: 'QUEUED' });

    expect(fetchMock.mock.calls).toEqual([
      [
        '/api/v1/renders',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, preset: 'vertical-high' }),
        },
      ],
      [`/api/v1/renders/${renderId}/cancel`, { method: 'POST' }],
      [`/api/v1/renders/${renderId}/retry`, { method: 'POST' }],
    ]);
  });

  it('preserves safe API diagnostics without exposing an unknown response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: {
              code: 'PROJECT_VALIDATION_FAILED',
              message: 'Project document is incompatible with its template.',
              details: [{ path: 'scenes.0', message: 'Headline is required.' }],
              technicalError: 'private stack trace',
            },
          },
          { status: 422 },
        ),
      ),
    );

    const error = await createRender(projectId, 'draft').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RenderApiError);
    expect(error).toMatchObject({
      status: 422,
      code: 'PROJECT_VALIDATION_FAILED',
      message: 'Project document is incompatible with its template.',
      details: ['Headline is required.'],
    });
    expect(error).not.toHaveProperty('technicalError');
  });

  it('polls active states, stops on terminal states and clamps progress safely', () => {
    for (const status of [
      'QUEUED',
      'PREPARING',
      'BUNDLING',
      'RENDERING',
      'ENCODING',
      'CANCEL_REQUESTED',
    ] as const) {
      expect(isActiveRenderStatus(status)).toBe(true);
      expect(getRenderPollingInterval(createPage(createJob(status)))).toBe(1_000);
    }

    for (const status of ['COMPLETED', 'FAILED', 'CANCELLED'] as const) {
      expect(isActiveRenderStatus(status)).toBe(false);
      expect(getRenderPollingInterval(createPage(createJob(status)))).toBe(false);
    }

    expect(getRenderPollingInterval(undefined)).toBe(false);
    expect(getRenderProgressPercent(-1)).toBe(0);
    expect(getRenderProgressPercent(0.426)).toBe(43);
    expect(getRenderProgressPercent(2)).toBe(100);
    expect(getRenderProgressPercent(Number.NaN)).toBe(0);
    expect(getRenderDownloadUrl(renderId)).toBe(`/api/v1/renders/${renderId}/download`);
    expect(getRenderThumbnailUrl(renderId)).toBe(`/api/v1/renders/${renderId}/thumbnail`);
  });
});
