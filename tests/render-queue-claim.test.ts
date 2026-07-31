import { describe, expect, it, vi } from 'vitest';
import {
  PrismaRenderJobRepository,
  assertRenderWorkerId,
  type PrismaClient,
  type RenderJobRecord,
} from '../packages/database/src/index.js';

const renderJobId = '11111111-1111-4111-8111-111111111111';
const timestamp = new Date('2026-07-31T13:00:00.000Z');

function createClaimedJob(): RenderJobRecord {
  return {
    id: renderJobId,
    projectId: '22222222-2222-4222-8222-222222222222',
    revisionId: '33333333-3333-4333-8333-333333333333',
    status: 'PREPARING',
    preset: 'vertical-h264',
    priority: 0,
    progress: 0,
    renderedFrames: null,
    encodedFrames: null,
    totalFrames: null,
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
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    outputs: [],
  };
}

function createRepository(claimedIds: Array<{ id: string }>) {
  const claimedJob = createClaimedJob();
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue(claimedIds),
    renderJob: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(claimedJob),
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
  };
}

describe('PostgreSQL render queue claim', () => {
  it('returns null without reading a job when no eligible row was claimed', async () => {
    const { repository, transaction } = createRepository([]);

    await expect(repository.claimNext('worker-a')).resolves.toBeNull();
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.renderJob.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('loads the row updated by the atomic claim query', async () => {
    const { repository, transaction } = createRepository([{ id: renderJobId }]);

    await expect(repository.claimNext('worker-a')).resolves.toEqual(createClaimedJob());
    expect(transaction.renderJob.findUniqueOrThrow).toHaveBeenCalledWith({
      where: {
        id: renderJobId,
      },
      include: {
        outputs: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });
  });

  it('rejects invalid worker IDs before opening a transaction', async () => {
    const { repository } = createRepository([]);

    expect(() => assertRenderWorkerId('')).toThrowError(
      'Worker ID must contain 1 to 200 characters.',
    );
    expect(() => assertRenderWorkerId(' '.repeat(10))).toThrowError(RangeError);
    expect(() => assertRenderWorkerId('x'.repeat(201))).toThrowError(RangeError);
    await expect(repository.claimNext('')).rejects.toThrowError(RangeError);
  });
});
