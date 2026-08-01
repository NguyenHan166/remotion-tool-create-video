import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RenderJobRecord, RenderJobRepository } from '../packages/database/src/index.js';
import { initializeStorage } from '../packages/storage/src/index.js';
import { createRenderOutputFileHandlers } from '../apps/web/src/renders/handlers.js';
import { DefaultRenderOutputFileService } from '../apps/web/src/renders/file-service.js';

const renderJobId = '11111111-1111-4111-8111-111111111111';
const timestamp = new Date('2026-08-01T08:00:00.000Z');
const videoBytes = new TextEncoder().encode('0123456789');
const thumbnailBytes = new TextEncoder().encode('jpeg');
const temporaryDirectories: string[] = [];

function createJob(status: RenderJobRecord['status'] = 'COMPLETED'): RenderJobRecord {
  return {
    id: renderJobId,
    projectId: '22222222-2222-4222-8222-222222222222',
    revisionId: '33333333-3333-4333-8333-333333333333',
    status,
    preset: 'vertical-h264',
    priority: 0,
    progress: status === 'COMPLETED' ? 1 : 0.9,
    renderedFrames: 300,
    encodedFrames: 300,
    totalFrames: 300,
    stageMessage: null,
    workerId: 'worker-a',
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
        id: '44444444-4444-4444-8444-444444444444',
        renderJobId,
        kind: 'VIDEO',
        relativePath: `renders/${renderJobId}/video.mp4`,
        fileName: 'Bản tin.mp4',
        mimeType: 'video/mp4',
        sizeBytes: BigInt(videoBytes.byteLength),
        width: 1080,
        height: 1920,
        durationMs: 10_000n,
        metadata: null,
        createdAt: timestamp,
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        renderJobId,
        kind: 'THUMBNAIL',
        relativePath: `thumbnails/${renderJobId}.jpg`,
        fileName: 'thumbnail.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: BigInt(thumbnailBytes.byteLength),
        width: 1080,
        height: 1920,
        durationMs: null,
        metadata: { frame: 149 },
        createdAt: timestamp,
      },
    ],
  };
}

class OutputStreamingRepository implements RenderJobRepository {
  constructor(readonly job: RenderJobRecord | null) {}
  async findById(id: string) {
    return this.job?.id === id ? this.job : null;
  }
  async enqueue(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async claimNext() {
    return null;
  }
  async recoverStale() {
    return { retriedJobIds: [], failedJobIds: [] };
  }
  async requestCancellation(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async isCancellationRequested() {
    return false;
  }
  async completeCancellation(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async recordFailure(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async complete(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async retry(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async updateProgress(): Promise<void> {
    throw new Error('Not implemented.');
  }
  async list() {
    return { items: this.job === null ? [] : [this.job], total: this.job === null ? 0 : 1 };
  }
  async transitionStatus(): Promise<never> {
    throw new Error('Not implemented.');
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

async function setup(status: RenderJobRecord['status'] = 'COMPLETED') {
  const directory = mkdtempSync(join(tmpdir(), 'hansys-render-output-'));
  temporaryDirectories.push(directory);
  const paths = await initializeStorage(directory);
  mkdirSync(join(paths.renders, renderJobId));
  writeFileSync(join(paths.renders, renderJobId, 'video.mp4'), videoBytes);
  writeFileSync(join(paths.thumbnails, `${renderJobId}.jpg`), thumbnailBytes);
  const service = new DefaultRenderOutputFileService(
    new OutputStreamingRepository(createJob(status)),
    paths,
  );

  return {
    video: createRenderOutputFileHandlers(service, 'VIDEO'),
    thumbnail: createRenderOutputFileHandlers(service, 'THUMBNAIL'),
  };
}

const context = { params: Promise.resolve({ renderId: renderJobId }) };

describe('render output download API', () => {
  it('downloads video with attachment naming and byte ranges', async () => {
    const { video } = await setup();
    const response = await video.GET(
      new Request(`http://localhost/api/v1/renders/${renderJobId}/download`, {
        headers: { Range: 'bytes=2-5' },
      }),
      context,
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''B%E1%BA%A3n%20tin.mp4",
    );
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('2345');
  });

  it('serves the thumbnail inline', async () => {
    const { thumbnail } = await setup();
    const response = await thumbnail.GET(
      new Request(`http://localhost/api/v1/renders/${renderJobId}/thumbnail`),
      context,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('content-disposition')).toContain('inline;');
    expect(new TextDecoder().decode(await response.arrayBuffer())).toBe('jpeg');
  });

  it('does not expose outputs before the render is completed', async () => {
    const { video } = await setup('ENCODING');
    const response = await video.GET(
      new Request(`http://localhost/api/v1/renders/${renderJobId}/download`),
      context,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'RENDER_OUTPUT_NOT_READY' },
    });
  });
});
