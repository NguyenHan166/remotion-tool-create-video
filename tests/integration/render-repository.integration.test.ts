import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  InvalidRenderStatusTransitionError,
  PrismaRenderJobRepository,
  PrismaRenderOutputRepository,
  PrismaRenderRevisionRepository,
  createPrismaClient,
  type PrismaClient,
} from '../../packages/database/src/index.js';
import { parseProjectDocument } from '../../packages/project-schema/src/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? describe.skip : describe;
const createdProjectIds: string[] = [];
const createdAssetIds: string[] = [];
let database: PrismaClient;

integrationTest('Prisma render repositories integration', () => {
  beforeAll(async () => {
    database = createPrismaClient(testDatabaseUrl!);
    await database.$connect();
  });

  afterEach(async () => {
    const projectIds = createdProjectIds.splice(0);

    if (projectIds.length === 0) {
      return;
    }

    await database.renderJob.deleteMany({
      where: {
        projectId: {
          in: projectIds,
        },
      },
    });
    await database.projectRevision.deleteMany({
      where: {
        projectId: {
          in: projectIds,
        },
      },
    });
    await database.project.deleteMany({
      where: {
        id: {
          in: projectIds,
        },
      },
    });

    const assetIds = createdAssetIds.splice(0);

    if (assetIds.length > 0) {
      await database.asset.deleteMany({
        where: {
          id: {
            in: assetIds,
          },
        },
      });
    }
  });

  afterAll(async () => {
    await database.$disconnect();
  });

  it('reads jobs with outputs and enforces guarded transitions under a row lock', async () => {
    const projectId = randomUUID();
    const revisionId = randomUUID();
    const renderJobId = randomUUID();
    const renderOutputId = randomUUID();
    createdProjectIds.push(projectId);

    await database.project.create({
      data: {
        id: projectId,
        name: 'Render repository integration',
        draftDocument: {},
        revisions: {
          create: {
            id: revisionId,
            revisionNumber: 1,
            schemaVersion: 1,
            templateId: 'news-clean-v1',
            templateVersion: 1,
            contentHash: 'a'.repeat(64),
            document: {},
          },
        },
      },
    });
    await database.renderJob.create({
      data: {
        id: renderJobId,
        projectId,
        revisionId,
        preset: 'vertical-h264',
      },
    });

    const outputRepository = new PrismaRenderOutputRepository(database, () => renderOutputId);
    await outputRepository.create({
      renderJobId,
      kind: 'VIDEO',
      relativePath: `renders/${renderJobId}/video.mp4`,
      fileName: 'video.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 1024n,
      width: 1080,
      height: 1920,
      durationMs: 10_000n,
      metadata: {
        codec: 'h264',
      },
    });

    const jobRepository = new PrismaRenderJobRepository(database);
    await expect(
      jobRepository.list({
        page: 1,
        pageSize: 10,
        projectId,
        status: 'QUEUED',
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: renderJobId,
          outputs: [
            {
              id: renderOutputId,
            },
          ],
        },
      ],
    });
    await expect(
      jobRepository.transitionStatus({
        renderJobId,
        nextStatus: 'PREPARING',
      }),
    ).resolves.toMatchObject({
      status: 'PREPARING',
    });
    await expect(
      jobRepository.transitionStatus({
        renderJobId,
        nextStatus: 'COMPLETED',
      }),
    ).rejects.toBeInstanceOf(InvalidRenderStatusTransitionError);
    await expect(jobRepository.findById(renderJobId)).resolves.toMatchObject({
      status: 'PREPARING',
    });
    await expect(outputRepository.findById(renderOutputId)).resolves.toMatchObject({
      renderJobId,
    });
    await expect(outputRepository.listByRenderJobId(renderJobId)).resolves.toHaveLength(1);
  });

  it('rolls back the revision snapshot when queued job creation fails', async () => {
    const projectId = randomUUID();
    createdProjectIds.push(projectId);
    const document = parseProjectDocument({
      schemaVersion: 1,
      metadata: {
        title: 'Atomic enqueue rollback',
      },
      template: {
        id: 'news-clean-v1',
        version: 1,
      },
      scenes: [
        {
          id: randomUUID(),
          type: 'hook',
          name: 'Opening',
        },
      ],
    });

    await database.project.create({
      data: {
        id: projectId,
        name: 'Atomic enqueue rollback',
        draftDocument: document,
      },
    });

    const repository = new PrismaRenderJobRepository(database);
    await expect(
      repository.enqueue({
        projectId,
        preset: 'x'.repeat(101),
        validateDraft: () => undefined,
      }),
    ).rejects.toThrow();

    await expect(
      database.projectRevision.count({
        where: {
          projectId,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      database.renderJob.count({
        where: {
          projectId,
        },
      }),
    ).resolves.toBe(0);
  });

  it('atomically freezes ready assets into a revision and queues its job', async () => {
    const projectId = randomUUID();
    const assetId = randomUUID();
    createdProjectIds.push(projectId);
    createdAssetIds.push(assetId);
    const document = parseProjectDocument({
      schemaVersion: 1,
      metadata: {
        title: 'Atomic enqueue success',
      },
      template: {
        id: 'news-clean-v1',
        version: 1,
      },
      theme: {
        logoAssetId: assetId,
      },
      scenes: [
        {
          id: randomUUID(),
          type: 'hook',
          name: 'Opening',
        },
      ],
    });

    await database.asset.create({
      data: {
        id: assetId,
        kind: 'LOGO',
        status: 'READY',
        originalName: 'logo.png',
        storedName: `${assetId}.png`,
        relativePath: `assets/${assetId}.png`,
        mimeType: 'image/png',
        sizeBytes: 128n,
        sha256: 'f'.repeat(64),
      },
    });
    await database.project.create({
      data: {
        id: projectId,
        name: 'Atomic enqueue success',
        draftDocument: document,
      },
    });

    const repository = new PrismaRenderJobRepository(database);
    const job = await repository.enqueue({
      projectId,
      preset: 'vertical-h264',
      validateDraft: () => undefined,
    });

    expect(job).toMatchObject({
      projectId,
      status: 'QUEUED',
      preset: 'vertical-h264',
      outputs: [],
    });
    await expect(
      database.projectRevision.findUnique({
        where: {
          id: job.revisionId,
        },
        include: {
          assets: true,
        },
      }),
    ).resolves.toMatchObject({
      projectId,
      revisionNumber: 1,
      templateId: 'news-clean-v1',
      templateVersion: 1,
      document,
      assets: [
        {
          assetId,
        },
      ],
    });

    await database.project.update({
      where: {
        id: projectId,
      },
      data: {
        draftDocument: {
          ...document,
          metadata: {
            ...document.metadata,
            title: 'Draft changed after enqueue',
          },
        },
      },
    });
    await expect(
      new PrismaRenderRevisionRepository(database).findById(job.revisionId),
    ).resolves.toMatchObject({
      id: job.revisionId,
      projectId,
      document,
      assets: [
        {
          id: assetId,
          kind: 'LOGO',
          status: 'READY',
          relativePath: `assets/${assetId}.png`,
        },
      ],
    });
  });

  it('claims one owner per job under concurrent workers', async () => {
    const projectId = randomUUID();
    const revisionId = randomUUID();
    const renderJobId = randomUUID();
    createdProjectIds.push(projectId);

    await database.project.create({
      data: {
        id: projectId,
        name: 'Concurrent queue claim',
        draftDocument: {},
        revisions: {
          create: {
            id: revisionId,
            revisionNumber: 1,
            schemaVersion: 1,
            templateId: 'news-clean-v1',
            templateVersion: 1,
            contentHash: 'b'.repeat(64),
            document: {},
          },
        },
        renderJobs: {
          create: {
            id: renderJobId,
            revisionId,
            preset: 'vertical-h264',
          },
        },
      },
    });

    const secondDatabase = createPrismaClient(testDatabaseUrl!);
    await secondDatabase.$connect();

    try {
      const claims = await Promise.all([
        new PrismaRenderJobRepository(database).claimNext('worker-a'),
        new PrismaRenderJobRepository(secondDatabase).claimNext('worker-b'),
      ]);
      const owners = claims.filter((claim) => claim !== null);

      expect(owners).toHaveLength(1);
      expect(owners[0]).toMatchObject({
        id: renderJobId,
        status: 'PREPARING',
        attempt: 1,
      });
      expect(['worker-a', 'worker-b']).toContain(owners[0]?.workerId);
      expect(claims.filter((claim) => claim === null)).toHaveLength(1);
      await expect(
        database.renderJob.findUnique({ where: { id: renderJobId } }),
      ).resolves.toMatchObject({
        status: 'PREPARING',
        workerId: owners[0]?.workerId,
        attempt: 1,
        startedAt: expect.any(Date),
        heartbeatAt: expect.any(Date),
      });
    } finally {
      await secondDatabase.$disconnect();
    }
  });

  it('respects availability, attempts, priority and FIFO ordering', async () => {
    const projectId = randomUUID();
    const revisionId = randomUUID();
    const now = Date.now();
    const highOldId = randomUUID();
    const highNewId = randomUUID();
    const lowId = randomUUID();
    const futureId = randomUUID();
    const exhaustedId = randomUUID();
    createdProjectIds.push(projectId);

    await database.project.create({
      data: {
        id: projectId,
        name: 'Queue ordering',
        draftDocument: {},
        revisions: {
          create: {
            id: revisionId,
            revisionNumber: 1,
            schemaVersion: 1,
            templateId: 'news-clean-v1',
            templateVersion: 1,
            contentHash: 'c'.repeat(64),
            document: {},
          },
        },
      },
    });
    await database.renderJob.createMany({
      data: [
        {
          id: lowId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          priority: 1,
          createdAt: new Date(now - 30_000),
          availableAt: new Date(now - 30_000),
        },
        {
          id: highOldId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          priority: 10,
          createdAt: new Date(now - 20_000),
          availableAt: new Date(now - 20_000),
        },
        {
          id: highNewId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          priority: 10,
          createdAt: new Date(now - 10_000),
          availableAt: new Date(now - 10_000),
        },
        {
          id: futureId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          priority: 100,
          availableAt: new Date(now + 60_000),
        },
        {
          id: exhaustedId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          priority: 100,
          attempt: 2,
          maxAttempts: 2,
          availableAt: new Date(now - 60_000),
        },
      ],
    });

    const repository = new PrismaRenderJobRepository(database);
    await expect(repository.claimNext('ordering-worker-1')).resolves.toMatchObject({
      id: highOldId,
    });
    await expect(repository.claimNext('ordering-worker-2')).resolves.toMatchObject({
      id: highNewId,
    });
    await expect(repository.claimNext('ordering-worker-3')).resolves.toMatchObject({
      id: lowId,
    });
    await expect(repository.claimNext('ordering-worker-4')).resolves.toBeNull();
    const ineligibleJobs = await database.renderJob.findMany({
      where: {
        id: {
          in: [futureId, exhaustedId],
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    expect(ineligibleJobs.map((job) => job.status)).toEqual(['QUEUED', 'QUEUED']);
  });

  it('recovers stale jobs across a worker restart and preserves fresh work', async () => {
    const projectId = randomUUID();
    const revisionId = randomUUID();
    const retryJobId = randomUUID();
    const exhaustedJobId = randomUUID();
    const freshJobId = randomUUID();
    const recoveredAt = new Date();
    const staleHeartbeat = new Date(recoveredAt.getTime() - 10 * 60_000);
    const freshHeartbeat = new Date(recoveredAt.getTime() - 30_000);
    const cleanedJobIds: string[] = [];
    createdProjectIds.push(projectId);

    await database.project.create({
      data: {
        id: projectId,
        name: 'Stale recovery restart simulation',
        draftDocument: {},
        revisions: {
          create: {
            id: revisionId,
            revisionNumber: 1,
            schemaVersion: 1,
            templateId: 'news-clean-v1',
            templateVersion: 1,
            contentHash: 'd'.repeat(64),
            document: {},
          },
        },
      },
    });
    await database.renderJob.createMany({
      data: [
        {
          id: retryJobId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          status: 'RENDERING',
          progress: 0.5,
          workerId: 'worker-before-restart',
          attempt: 1,
          maxAttempts: 2,
          heartbeatAt: staleHeartbeat,
          startedAt: staleHeartbeat,
        },
        {
          id: exhaustedJobId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          status: 'ENCODING',
          progress: 0.9,
          workerId: 'worker-before-restart',
          attempt: 2,
          maxAttempts: 2,
          heartbeatAt: staleHeartbeat,
          startedAt: staleHeartbeat,
        },
        {
          id: freshJobId,
          projectId,
          revisionId,
          preset: 'vertical-h264',
          status: 'RENDERING',
          progress: 0.25,
          workerId: 'worker-still-running',
          attempt: 1,
          maxAttempts: 2,
          heartbeatAt: freshHeartbeat,
          startedAt: freshHeartbeat,
        },
      ],
    });

    const repository = new PrismaRenderJobRepository(database);
    await expect(
      repository.recoverStale({
        staleBefore: new Date(recoveredAt.getTime() - 5 * 60_000),
        recoveredAt,
        cleanupAttempt: async (renderJobId) => {
          cleanedJobIds.push(renderJobId);
        },
      }),
    ).resolves.toEqual({
      retriedJobIds: [retryJobId],
      failedJobIds: [exhaustedJobId],
    });
    expect(cleanedJobIds).toHaveLength(2);
    expect(cleanedJobIds).toEqual(expect.arrayContaining([retryJobId, exhaustedJobId]));

    await expect(repository.claimNext('worker-after-restart')).resolves.toMatchObject({
      id: retryJobId,
      status: 'PREPARING',
      workerId: 'worker-after-restart',
      attempt: 2,
    });
    await expect(
      database.renderJob.findUnique({ where: { id: exhaustedJobId } }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      workerId: null,
      errorCode: 'WORKER_LOST',
      finishedAt: recoveredAt,
    });
    await expect(
      database.renderJob.findUnique({ where: { id: freshJobId } }),
    ).resolves.toMatchObject({
      status: 'RENDERING',
      workerId: 'worker-still-running',
      heartbeatAt: freshHeartbeat,
    });
  });
});
