import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  InvalidRenderStatusTransitionError,
  PrismaRenderJobRepository,
  PrismaRenderOutputRepository,
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
  });
});
