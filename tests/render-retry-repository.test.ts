import { describe, expect, it, vi } from 'vitest';
import {
  InvalidRenderStatusTransitionError,
  PrismaRenderJobRepository,
  RenderJobFailureRejectedError,
  type PrismaClient,
  type RenderJobRecord,
  type RenderStatus,
} from '../packages/database/src/index.js';

const renderJobId = '11111111-1111-4111-8111-111111111111';
const failedAt = new Date('2026-07-31T16:00:00.000Z');
const retryAt = new Date('2026-07-31T16:00:01.000Z');

type LockedJob = {
  status: RenderStatus;
  workerId: string | null;
  attempt: number;
  maxAttempts: number;
};

function createRepository(lockedJob: LockedJob) {
  const updatedJob = {
    id: renderJobId,
    status: lockedJob.status,
    outputs: [],
  } as unknown as RenderJobRecord;
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([lockedJob]),
    renderJob: {
      update: vi.fn().mockResolvedValue(updatedJob),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  } as unknown as PrismaClient;

  return {
    repository: new PrismaRenderJobRepository(database),
    transaction,
    updatedJob,
  };
}

const browserFailure = {
  renderJobId,
  workerId: 'worker-a',
  errorCode: 'BROWSER_CRASHED',
  errorMessage: 'The render browser stopped unexpectedly.',
  technicalError: 'Protocol error: Target closed',
  transient: true,
  failedAt,
  retryAt,
} as const;

describe('render failure persistence and retry', () => {
  it('queues a transient failure when an automatic attempt remains', async () => {
    const { repository, transaction, updatedJob } = createRepository({
      status: 'RENDERING',
      workerId: 'worker-a',
      attempt: 1,
      maxAttempts: 2,
    });

    await expect(repository.recordFailure(browserFailure)).resolves.toEqual({
      action: 'RETRY_QUEUED',
      job: updatedJob,
    });
    expect(transaction.renderJob.update).toHaveBeenCalledWith({
      where: { id: renderJobId },
      data: {
        status: 'QUEUED',
        progress: 0,
        renderedFrames: null,
        encodedFrames: null,
        totalFrames: null,
        stageMessage: 'Retry queued after BROWSER_CRASHED.',
        workerId: null,
        availableAt: retryAt,
        heartbeatAt: null,
        finishedAt: null,
        errorCode: 'BROWSER_CRASHED',
        errorMessage: 'The render browser stopped unexpectedly.',
        technicalError: 'Protocol error: Target closed',
      },
      include: {
        outputs: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  it.each([
    { transient: false, attempt: 1, label: 'deterministic' },
    { transient: true, attempt: 2, label: 'exhausted transient' },
  ])('marks a $label failure as FAILED', async ({ transient, attempt }) => {
    const { repository, transaction, updatedJob } = createRepository({
      status: 'RENDERING',
      workerId: 'worker-a',
      attempt,
      maxAttempts: 2,
    });

    await expect(repository.recordFailure({ ...browserFailure, transient })).resolves.toEqual({
      action: 'FAILED',
      job: updatedJob,
    });
    expect(transaction.renderJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorCode: 'BROWSER_CRASHED',
          finishedAt: failedAt,
        }),
      }),
    );
  });

  it('rejects stale workers without mutating the job', async () => {
    const { repository, transaction } = createRepository({
      status: 'RENDERING',
      workerId: 'worker-new',
      attempt: 1,
      maxAttempts: 2,
    });

    await expect(repository.recordFailure(browserFailure)).rejects.toBeInstanceOf(
      RenderJobFailureRejectedError,
    );
    expect(transaction.renderJob.update).not.toHaveBeenCalled();
  });

  it.each(['FAILED', 'CANCELLED'] as const)('manually retries a %s job', async (status) => {
    const { repository, transaction, updatedJob } = createRepository({
      status,
      workerId: 'worker-a',
      attempt: 2,
      maxAttempts: 2,
    });

    await expect(repository.retry(renderJobId)).resolves.toBe(updatedJob);
    expect(transaction.renderJob.update).toHaveBeenCalledWith({
      where: { id: renderJobId },
      data: expect.objectContaining({
        status: 'QUEUED',
        progress: 0,
        maxAttempts: 3,
        workerId: null,
        errorCode: null,
        startedAt: null,
        finishedAt: null,
      }),
      include: {
        outputs: { orderBy: { createdAt: 'asc' } },
      },
    });
  });

  it('rejects manual retry for an active job', async () => {
    const { repository, transaction } = createRepository({
      status: 'ENCODING',
      workerId: 'worker-a',
      attempt: 1,
      maxAttempts: 2,
    });

    await expect(repository.retry(renderJobId)).rejects.toBeInstanceOf(
      InvalidRenderStatusTransitionError,
    );
    expect(transaction.renderJob.update).not.toHaveBeenCalled();
  });
});
