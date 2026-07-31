import { describe, expect, it } from 'vitest';
import {
  AssetNotFoundError,
  RenderAssetNotReadyError,
  assertRenderAssetsReady,
  type EnqueueRenderJobInput,
  type RenderJobRecord,
  type RenderJobRepository,
} from '../packages/database/src/index.js';
import { parseProjectDocument } from '../packages/project-schema/src/index.js';
import { createRenderCollectionHandlers } from '../apps/web/src/renders/handlers.js';
import { DefaultRenderService } from '../apps/web/src/renders/service.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const revisionId = '22222222-2222-4222-8222-222222222222';
const renderJobId = '33333333-3333-4333-8333-333333333333';
const sceneId = '44444444-4444-4444-8444-444444444444';
const assetId = '55555555-5555-4555-8555-555555555555';
const timestamp = new Date('2026-07-31T12:00:00.000Z');

function createQueuedJob(): RenderJobRecord {
  return {
    id: renderJobId,
    projectId,
    revisionId,
    status: 'QUEUED',
    preset: 'vertical-h264',
    priority: 0,
    progress: 0,
    renderedFrames: null,
    encodedFrames: null,
    totalFrames: null,
    stageMessage: null,
    workerId: null,
    attempt: 0,
    maxAttempts: 2,
    errorCode: null,
    errorMessage: null,
    technicalError: null,
    availableAt: timestamp,
    heartbeatAt: null,
    startedAt: null,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    outputs: [],
  };
}

function createDraft(options: { templateId?: string; width?: number; height?: number } = {}) {
  return parseProjectDocument({
    schemaVersion: 1,
    metadata: {
      title: 'Render enqueue test',
    },
    composition: {
      width: options.width ?? 1080,
      height: options.height ?? 1920,
      fps: 30,
    },
    template: {
      id: options.templateId ?? 'news-clean-v1',
      version: 1,
    },
    scenes: [
      {
        id: sceneId,
        type: 'hook',
        name: 'Opening',
      },
    ],
  });
}

class EnqueueTestRepository implements RenderJobRepository {
  readonly #draft: ReturnType<typeof createDraft>;
  lastInput: EnqueueRenderJobInput | null = null;

  constructor(draft: ReturnType<typeof createDraft>) {
    this.#draft = draft;
  }

  async enqueue(input: EnqueueRenderJobInput): Promise<RenderJobRecord> {
    this.lastInput = input;
    input.validateDraft(this.#draft);
    return createQueuedJob();
  }

  async claimNext(): Promise<RenderJobRecord | null> {
    return null;
  }

  async recoverStale() {
    return { retriedJobIds: [], failedJobIds: [] };
  }

  async requestCancellation(): Promise<RenderJobRecord> {
    throw new Error('Not implemented by enqueue test repository.');
  }

  async isCancellationRequested(): Promise<boolean> {
    return false;
  }

  async completeCancellation(): Promise<RenderJobRecord> {
    throw new Error('Not implemented by enqueue test repository.');
  }

  async recordFailure(): Promise<never> {
    throw new Error('Not implemented by enqueue test repository.');
  }

  async retry(): Promise<RenderJobRecord> {
    throw new Error('Not implemented by enqueue test repository.');
  }

  async updateProgress(): Promise<void> {
    throw new Error('Not implemented by enqueue test repository.');
  }

  async findById(): Promise<RenderJobRecord | null> {
    return null;
  }

  async list() {
    return { items: [], total: 0 };
  }

  async transitionStatus(): Promise<RenderJobRecord> {
    throw new Error('Not implemented by enqueue test repository.');
  }
}

function createJsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/renders', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': 'render-enqueue-request',
    },
    body: JSON.stringify(body),
  });
}

describe('render asset readiness validation', () => {
  it('accepts every referenced asset only when all are READY', () => {
    expect(() =>
      assertRenderAssetsReady([assetId], [{ id: assetId, status: 'READY' }]),
    ).not.toThrow();
  });

  it('distinguishes missing and deleted assets from assets that are not ready', () => {
    expect(() => assertRenderAssetsReady([assetId], [])).toThrowError(AssetNotFoundError);
    expect(() =>
      assertRenderAssetsReady([assetId], [{ id: assetId, status: 'DELETED' }]),
    ).toThrowError(AssetNotFoundError);

    try {
      assertRenderAssetsReady([assetId], [{ id: assetId, status: 'PROCESSING' }]);
      throw new Error('Expected asset readiness validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(RenderAssetNotReadyError);
      expect(error).toMatchObject({
        code: 'ASSET_NOT_READY',
        assetIds: [assetId],
      });
    }
  });
});

describe('POST /renders', () => {
  it('validates the locked draft and returns the queued job', async () => {
    const repository = new EnqueueTestRepository(createDraft());
    const handlers = createRenderCollectionHandlers(
      new DefaultRenderService(repository, { maxAttempts: 4 }),
    );
    const response = await handlers.POST(
      createJsonRequest({
        projectId,
        preset: 'vertical-h264',
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: renderJobId,
      projectId,
      revisionId,
      status: 'QUEUED',
      preset: 'vertical-h264',
      outputs: [],
    });
    expect(repository.lastInput).toMatchObject({
      projectId,
      preset: 'vertical-h264',
      maxAttempts: 4,
    });
  });

  it('rejects a draft that is incompatible with its registered template', async () => {
    const repository = new EnqueueTestRepository(createDraft({ width: 1000, height: 800 }));
    const handlers = createRenderCollectionHandlers(new DefaultRenderService(repository));
    const response = await handlers.POST(
      createJsonRequest({
        projectId,
        preset: 'vertical-h264',
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'PROJECT_VALIDATION_FAILED',
        message: 'Project document is incompatible with its template.',
        details: [
          {
            path: 'composition',
            message: 'News Clean supports only 9:16, 16:9 and 1:1 compositions.',
          },
        ],
        requestId: 'render-enqueue-request',
      },
    });
  });

  it('rejects a draft whose template is not registered', async () => {
    const repository = new EnqueueTestRepository(createDraft({ templateId: 'missing-v1' }));
    const handlers = createRenderCollectionHandlers(new DefaultRenderService(repository));
    const response = await handlers.POST(
      createJsonRequest({
        projectId,
        preset: 'vertical-h264',
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'TEMPLATE_NOT_FOUND',
        message: 'Project template not found.',
        requestId: 'render-enqueue-request',
      },
    });
  });

  it('rejects malformed requests before opening the enqueue transaction', async () => {
    const repository = new EnqueueTestRepository(createDraft());
    const handlers = createRenderCollectionHandlers(new DefaultRenderService(repository));
    const response = await handlers.POST(
      createJsonRequest({
        projectId: 'not-a-uuid',
        preset: 'unknown',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'Render request is invalid.',
      },
    });
    expect(repository.lastInput).toBeNull();
  });
});
