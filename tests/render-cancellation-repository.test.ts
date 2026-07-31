import { describe, expect, it, vi } from 'vitest';
import {
  InvalidRenderStatusTransitionError,
  PrismaRenderJobRepository,
  RenderJobCancellationRejectedError,
  type PrismaClient,
  type RenderJobRecord,
  type RenderStatus,
} from '../packages/database/src/index.js';

const renderJobId = '11111111-1111-4111-8111-111111111111';
const finishedAt = new Date('2026-07-31T15:00:00.000Z');

function createJob(status: RenderStatus): RenderJobRecord {
  return {
    id: renderJobId,
    status,
    outputs: [],
  } as unknown as RenderJobRecord;
}

function createRepository(status: RenderStatus) {
  const job = createJob(status);
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ status }]),
    renderJob: {
      update: vi.fn().mockResolvedValue(job),
      findUniqueOrThrow: vi.fn().mockResolvedValue(job),
    },
  };
  const renderJob = {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn().mockResolvedValue(job),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const database = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) =>
      operation(transaction),
    ),
    renderJob,
  } as unknown as PrismaClient;

  return {
    repository: new PrismaRenderJobRepository(database),
    transaction,
    renderJob,
    job,
  };
}

describe('render cancellation repository', () => {
  it('moves a queued job through the request state and finishes it atomically', async () => {
    const { repository, transaction, job } = createRepository('QUEUED');

    await expect(repository.requestCancellation(renderJobId)).resolves.toBe(job);
    expect(transaction.renderJob.update).toHaveBeenNthCalledWith(1, {
      where: { id: renderJobId },
      data: {
        status: 'CANCEL_REQUESTED',
        stageMessage: 'Cancellation requested.',
      },
    });
    expect(transaction.renderJob.update).toHaveBeenNthCalledWith(2, {
      where: { id: renderJobId },
      data: {
        status: 'CANCELLED',
        stageMessage: 'Render cancelled before execution.',
        workerId: null,
        heartbeatAt: null,
        finishedAt: expect.any(Date),
      },
      include: {
        outputs: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  it('leaves an active job requested for its owning worker', async () => {
    const { repository, transaction, job } = createRepository('RENDERING');

    await expect(repository.requestCancellation(renderJobId)).resolves.toBe(job);
    expect(transaction.renderJob.update).toHaveBeenCalledOnce();
    expect(transaction.renderJob.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: renderJobId },
      include: {
        outputs: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  it('rejects cancellation from terminal states', async () => {
    const { repository, transaction } = createRepository('COMPLETED');

    await expect(repository.requestCancellation(renderJobId)).rejects.toBeInstanceOf(
      InvalidRenderStatusTransitionError,
    );
    expect(transaction.renderJob.update).not.toHaveBeenCalled();
  });

  it('checks cancellation ownership with one lightweight read', async () => {
    const { repository, renderJob } = createRepository('RENDERING');
    renderJob.findUnique.mockResolvedValue({
      status: 'CANCEL_REQUESTED',
      workerId: 'worker-a',
    });

    await expect(
      repository.isCancellationRequested({ renderJobId, workerId: 'worker-a' }),
    ).resolves.toBe(true);
    expect(renderJob.findUnique).toHaveBeenCalledWith({
      where: { id: renderJobId },
      select: { status: true, workerId: true },
    });
  });

  it('completes cancellation only for the worker owning a requested job', async () => {
    const { repository, renderJob, job } = createRepository('CANCEL_REQUESTED');

    await expect(
      repository.completeCancellation({ renderJobId, workerId: 'worker-a', finishedAt }),
    ).resolves.toBe(job);
    expect(renderJob.updateMany).toHaveBeenCalledWith({
      where: {
        id: renderJobId,
        workerId: 'worker-a',
        status: 'CANCEL_REQUESTED',
      },
      data: {
        status: 'CANCELLED',
        stageMessage: 'Render cancelled.',
        heartbeatAt: finishedAt,
        finishedAt,
      },
    });
  });

  it('rejects a stale worker completing cancellation', async () => {
    const { repository, renderJob } = createRepository('CANCEL_REQUESTED');
    renderJob.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.completeCancellation({ renderJobId, workerId: 'worker-old' }),
    ).rejects.toBeInstanceOf(RenderJobCancellationRejectedError);
    expect(renderJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
