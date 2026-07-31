import { describe, expect, it, vi } from 'vitest';
import { PrismaRenderJobRepository, type PrismaClient } from '../packages/database/src/index.js';

const retryJobId = '11111111-1111-4111-8111-111111111111';
const failedJobId = '22222222-2222-4222-8222-222222222222';
const staleBefore = new Date('2026-07-31T12:00:00.000Z');
const recoveredAt = new Date('2026-07-31T12:05:00.000Z');

function createRepository(
  staleJobs: Array<{
    id: string;
    attempt: number;
    maxAttempts: number;
    workerId: string | null;
  }>,
) {
  const update = vi.fn().mockResolvedValue(undefined);
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue(staleJobs),
    renderJob: { update },
  };
  const database = {
    $transaction: vi.fn(async (operation: (client: typeof transaction) => unknown) =>
      operation(transaction),
    ),
  } as unknown as PrismaClient;

  return {
    repository: new PrismaRenderJobRepository(database),
    database,
    transaction,
    update,
  };
}

describe('stale render recovery', () => {
  it('requeues jobs with attempts remaining and fails exhausted jobs as WORKER_LOST', async () => {
    const events: string[] = [];
    const { repository, update } = createRepository([
      { id: retryJobId, attempt: 1, maxAttempts: 2, workerId: 'worker-old-a' },
      { id: failedJobId, attempt: 2, maxAttempts: 2, workerId: 'worker-old-b' },
    ]);
    update.mockImplementation(async ({ where }: { where: { id: string } }) => {
      events.push(`update:${where.id}`);
    });

    await expect(
      repository.recoverStale({
        staleBefore,
        recoveredAt,
        cleanupAttempt: async (renderJobId) => {
          events.push(`cleanup:${renderJobId}`);
        },
      }),
    ).resolves.toEqual({
      retriedJobIds: [retryJobId],
      failedJobIds: [failedJobId],
    });

    expect(events.slice(0, 2)).toEqual([`cleanup:${retryJobId}`, `cleanup:${failedJobId}`]);
    expect(update).toHaveBeenCalledWith({
      where: { id: retryJobId },
      data: expect.objectContaining({
        status: 'QUEUED',
        progress: 0,
        workerId: null,
        availableAt: recoveredAt,
        heartbeatAt: null,
        finishedAt: null,
      }),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: failedJobId },
      data: expect.objectContaining({
        status: 'FAILED',
        workerId: null,
        errorCode: 'WORKER_LOST',
        finishedAt: recoveredAt,
      }),
    });
  });

  it('aborts database changes when temporary output cleanup fails', async () => {
    const { repository, update } = createRepository([
      { id: retryJobId, attempt: 1, maxAttempts: 2, workerId: 'worker-old' },
    ]);

    await expect(
      repository.recoverStale({
        staleBefore,
        cleanupAttempt: async () => {
          throw new Error('storage offline');
        },
      }),
    ).rejects.toThrowError('storage offline');
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects invalid recovery timestamps before opening a transaction', async () => {
    const { repository, database } = createRepository([]);

    await expect(
      repository.recoverStale({ staleBefore: new Date(Number.NaN) }),
    ).rejects.toThrowError(RangeError);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
