import { describe, expect, it } from 'vitest';
import {
  InvalidRenderStatusTransitionError,
  assertRenderStatusTransition,
  canTransitionRenderStatus,
  type RenderJobRecord,
  type RenderJobRepository,
  type RenderStatus,
  type TransitionRenderJobInput,
} from '../packages/database/src/index.js';
import {
  createRenderCollectionHandlers,
  createRenderResourceHandlers,
} from '../apps/web/src/renders/handlers.js';
import { DefaultRenderService } from '../apps/web/src/renders/service.js';

const renderJobId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const revisionId = '33333333-3333-4333-8333-333333333333';
const outputId = '44444444-4444-4444-8444-444444444444';
const timestamp = new Date('2026-07-31T10:00:00.000Z');

const allowedTransitions: ReadonlyArray<readonly [RenderStatus, RenderStatus]> = [
  ['QUEUED', 'PREPARING'],
  ['QUEUED', 'CANCEL_REQUESTED'],
  ['PREPARING', 'BUNDLING'],
  ['PREPARING', 'FAILED'],
  ['PREPARING', 'CANCEL_REQUESTED'],
  ['BUNDLING', 'RENDERING'],
  ['BUNDLING', 'FAILED'],
  ['BUNDLING', 'CANCEL_REQUESTED'],
  ['RENDERING', 'ENCODING'],
  ['RENDERING', 'FAILED'],
  ['RENDERING', 'CANCEL_REQUESTED'],
  ['ENCODING', 'COMPLETED'],
  ['ENCODING', 'FAILED'],
  ['ENCODING', 'CANCEL_REQUESTED'],
  ['CANCEL_REQUESTED', 'CANCELLED'],
  ['FAILED', 'QUEUED'],
  ['CANCELLED', 'QUEUED'],
];

const statuses: RenderStatus[] = [
  'QUEUED',
  'PREPARING',
  'BUNDLING',
  'RENDERING',
  'ENCODING',
  'COMPLETED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED',
];

function createRenderJob(status: RenderStatus = 'COMPLETED'): RenderJobRecord {
  return {
    id: renderJobId,
    projectId,
    revisionId,
    status,
    preset: 'web-1080p',
    priority: 0,
    progress: status === 'COMPLETED' ? 1 : 0,
    renderedFrames: 300,
    encodedFrames: 300,
    totalFrames: 300,
    stageMessage: null,
    workerId: null,
    attempt: 1,
    maxAttempts: 2,
    errorCode: null,
    errorMessage: null,
    technicalError: null,
    availableAt: timestamp,
    heartbeatAt: timestamp,
    startedAt: timestamp,
    finishedAt: status === 'COMPLETED' ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
    outputs: [
      {
        id: outputId,
        renderJobId,
        kind: 'VIDEO',
        relativePath: `renders/${renderJobId}/video.mp4`,
        fileName: 'video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 1024n,
        width: 1920,
        height: 1080,
        durationMs: 10_000n,
        metadata: null,
        createdAt: timestamp,
      },
    ],
  };
}

class MemoryRenderJobRepository implements RenderJobRepository {
  readonly jobs: RenderJobRecord[];
  lastListInput: Parameters<RenderJobRepository['list']>[0] | null = null;

  constructor(jobs: RenderJobRecord[]) {
    this.jobs = jobs;
  }

  async enqueue(): Promise<RenderJobRecord> {
    throw new Error('Not implemented by this read-only test repository.');
  }

  async claimNext(): Promise<RenderJobRecord | null> {
    return null;
  }

  async recoverStale() {
    return { retriedJobIds: [], failedJobIds: [] };
  }

  async updateProgress(): Promise<void> {
    throw new Error('Not implemented by this read-only test repository.');
  }

  async findById(id: string): Promise<RenderJobRecord | null> {
    return this.jobs.find((job) => job.id === id) ?? null;
  }

  async list(input: Parameters<RenderJobRepository['list']>[0]) {
    this.lastListInput = input;
    const matchingJobs = this.jobs.filter(
      (job) =>
        (input.projectId === undefined || job.projectId === input.projectId) &&
        (input.status === undefined || job.status === input.status),
    );

    return {
      items: matchingJobs.slice((input.page - 1) * input.pageSize, input.page * input.pageSize),
      total: matchingJobs.length,
    };
  }

  async transitionStatus({
    renderJobId: id,
    nextStatus,
  }: TransitionRenderJobInput): Promise<RenderJobRecord> {
    const job = await this.findById(id);

    if (job === null) {
      throw new Error('Render job not found.');
    }

    assertRenderStatusTransition(id, job.status, nextStatus);
    job.status = nextStatus;
    return job;
  }
}

describe('render status transition guard', () => {
  it.each(allowedTransitions)('allows %s -> %s', (currentStatus, nextStatus) => {
    expect(canTransitionRenderStatus(currentStatus, nextStatus)).toBe(true);
    expect(() =>
      assertRenderStatusTransition(renderJobId, currentStatus, nextStatus),
    ).not.toThrow();
  });

  const invalidTransitions = statuses.flatMap((currentStatus) =>
    statuses
      .filter(
        (nextStatus) =>
          !allowedTransitions.some(
            ([allowedCurrent, allowedNext]) =>
              allowedCurrent === currentStatus && allowedNext === nextStatus,
          ),
      )
      .map((nextStatus) => [currentStatus, nextStatus] as const),
  );

  it.each(invalidTransitions)('rejects %s -> %s', (currentStatus, nextStatus) => {
    expect(canTransitionRenderStatus(currentStatus, nextStatus)).toBe(false);

    try {
      assertRenderStatusTransition(renderJobId, currentStatus, nextStatus);
      throw new Error('Expected transition to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRenderStatusTransitionError);
      expect(error).toMatchObject({
        code: 'RENDER_INVALID_STATE',
        renderJobId,
        currentStatus,
        nextStatus,
      });
    }
  });
});

describe('render list and read handlers', () => {
  it('lists filtered render jobs and serializes bigint output metadata', async () => {
    const repository = new MemoryRenderJobRepository([createRenderJob()]);
    const handlers = createRenderCollectionHandlers(new DefaultRenderService(repository));
    const response = await handlers.GET(
      new Request(
        `http://localhost/api/v1/renders?page=1&pageSize=10&projectId=${projectId}&status=COMPLETED`,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      items: [
        {
          id: renderJobId,
          status: 'COMPLETED',
          outputs: [
            {
              id: outputId,
              sizeBytes: 1024,
              durationMs: 10_000,
            },
          ],
        },
      ],
    });
    expect(repository.lastListInput).toEqual({
      page: 1,
      pageSize: 10,
      projectId,
      status: 'COMPLETED',
    });
  });

  it('reads one render job and returns the standard not-found envelope', async () => {
    const repository = new MemoryRenderJobRepository([createRenderJob()]);
    const handlers = createRenderResourceHandlers(new DefaultRenderService(repository));
    const foundResponse = await handlers.GET(
      new Request(`http://localhost/api/v1/renders/${renderJobId}`),
      { params: Promise.resolve({ renderId: renderJobId }) },
    );
    const missingId = '55555555-5555-4555-8555-555555555555';
    const missingResponse = await handlers.GET(
      new Request(`http://localhost/api/v1/renders/${missingId}`, {
        headers: {
          'x-request-id': 'render-request-1',
        },
      }),
      { params: Promise.resolve({ renderId: missingId }) },
    );

    expect(foundResponse.status).toBe(200);
    await expect(foundResponse.json()).resolves.toMatchObject({
      id: renderJobId,
      projectId,
      revisionId,
    });
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({
      error: {
        code: 'RENDER_NOT_FOUND',
        message: 'Render job not found.',
        requestId: 'render-request-1',
      },
    });
  });

  it('rejects invalid list filters and render IDs', async () => {
    const repository = new MemoryRenderJobRepository([]);
    const service = new DefaultRenderService(repository);
    const collection = createRenderCollectionHandlers(service);
    const resource = createRenderResourceHandlers(service);
    const listResponse = await collection.GET(
      new Request('http://localhost/api/v1/renders?page=0&status=UNKNOWN'),
    );
    const resourceResponse = await resource.GET(
      new Request('http://localhost/api/v1/renders/not-a-uuid'),
      { params: Promise.resolve({ renderId: 'not-a-uuid' }) },
    );

    expect(listResponse.status).toBe(400);
    await expect(listResponse.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'Render query is invalid.',
      },
    });
    expect(resourceResponse.status).toBe(400);
    await expect(resourceResponse.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'Render ID is invalid.',
      },
    });
  });
});
