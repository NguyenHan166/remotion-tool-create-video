import { describe, expect, it, vi } from 'vitest';
import {
  PrismaRenderJobRepository,
  RenderJobProgressRejectedError,
  type PrismaClient,
} from '../packages/database/src/index.js';

const renderJobId = '11111111-1111-4111-8111-111111111111';
const heartbeatAt = new Date('2026-07-31T14:00:00.000Z');

function createRepository(updateCount = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count: updateCount });
  const database = {
    renderJob: { updateMany },
  } as unknown as PrismaClient;

  return {
    repository: new PrismaRenderJobRepository(database),
    updateMany,
  };
}

describe('render job progress updates', () => {
  it('atomically advances progress for the owning worker and permitted stages', async () => {
    const { repository, updateMany } = createRepository();

    await repository.updateProgress({
      renderJobId,
      workerId: 'worker-a',
      status: 'ENCODING',
      progress: 0.82,
      renderedFrames: 120,
      encodedFrames: 96,
      totalFrames: 120,
      stageMessage: 'Encoding H.264 media.',
      heartbeatAt,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: renderJobId,
        workerId: 'worker-a',
        status: { in: ['RENDERING', 'ENCODING'] },
        progress: { lte: 0.82 },
        AND: [
          { OR: [{ renderedFrames: null }, { renderedFrames: { lte: 120 } }] },
          { OR: [{ encodedFrames: null }, { encodedFrames: { lte: 96 } }] },
          { OR: [{ totalFrames: null }, { totalFrames: 120 }] },
        ],
      },
      data: {
        status: 'ENCODING',
        progress: 0.82,
        stageMessage: 'Encoding H.264 media.',
        heartbeatAt,
        renderedFrames: 120,
        encodedFrames: 96,
        totalFrames: 120,
      },
    });
  });

  it('rejects stale ownership, invalid stage, or regressing progress atomically', async () => {
    const { repository } = createRepository(0);

    await expect(
      repository.updateProgress({
        renderJobId,
        workerId: 'worker-old',
        status: 'RENDERING',
        progress: 0.4,
        stageMessage: 'Rendering frames.',
      }),
    ).rejects.toBeInstanceOf(RenderJobProgressRejectedError);
  });

  it('validates progress payloads before querying the database', async () => {
    const { repository, updateMany } = createRepository();

    await expect(
      repository.updateProgress({
        renderJobId,
        workerId: 'worker-a',
        status: 'RENDERING',
        progress: 1.01,
        stageMessage: 'Rendering frames.',
      }),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      repository.updateProgress({
        renderJobId,
        workerId: 'worker-a',
        status: 'ENCODING',
        progress: 0.8,
        renderedFrames: 11,
        totalFrames: 10,
        stageMessage: 'Encoding H.264 media.',
      }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
