import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  AssetNotFoundError,
  PrismaProjectRepository,
  ProjectVersionConflictError,
  createPrismaClient,
  type PrismaClient,
} from '../../packages/database/src/index.js';
import { parseProjectDocument } from '../../packages/project-schema/src/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? describe.skip : describe;
const createdAssetIds: string[] = [];
const createdProjectIds: string[] = [];
let database: PrismaClient;

integrationTest('Prisma project repository integration', () => {
  beforeAll(async () => {
    database = createPrismaClient(testDatabaseUrl!);
    await database.$connect();
  });

  afterEach(async () => {
    const projectIds = createdProjectIds.splice(0);

    if (projectIds.length > 0) {
      await database.project.deleteMany({
        where: {
          id: {
            in: projectIds,
          },
        },
      });
    }

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

  it('allows one optimistic update and rejects the stale writer', async () => {
    const repository = new PrismaProjectRepository(database);
    const document = parseProjectDocument({
      schemaVersion: 1,
      metadata: {
        title: 'Repository conflict test',
      },
      template: {
        id: 'warning-dark-v1',
      },
      scenes: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          type: 'hook',
          name: 'Opening',
        },
      ],
    });
    const project = await repository.create({
      name: 'Repository conflict test',
      description: null,
      draftDocument: document,
      assetIds: [],
    });
    createdProjectIds.push(project.id);

    const updates = await Promise.allSettled([
      repository.updateDraft({
        projectId: project.id,
        expectedDraftVersion: 1,
        name: 'Writer A',
        draftDocument: document,
        assetIds: [],
      }),
      repository.updateDraft({
        projectId: project.id,
        expectedDraftVersion: 1,
        name: 'Writer B',
        draftDocument: document,
        assetIds: [],
      }),
    ]);
    const fulfilled = updates.filter((result) => result.status === 'fulfilled');
    const rejected = updates.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({
        code: 'PROJECT_VERSION_CONFLICT',
        expectedDraftVersion: 1,
        actualDraftVersion: 2,
      }),
    });
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      ProjectVersionConflictError,
    );

    await expect(repository.findById(project.id)).resolves.toMatchObject({
      draftVersion: 2,
    });
  });

  it('replaces stale asset links and rolls back when a referenced asset is missing', async () => {
    const repository = new PrismaProjectRepository(database);
    const firstAssetId = randomUUID();
    const secondAssetId = randomUUID();
    const missingAssetId = randomUUID();
    createdAssetIds.push(firstAssetId, secondAssetId);

    await database.asset.createMany({
      data: [
        {
          id: firstAssetId,
          kind: 'IMAGE',
          status: 'READY',
          originalName: 'first.png',
          storedName: `${firstAssetId}.png`,
          relativePath: `assets/${firstAssetId}.png`,
          mimeType: 'image/png',
          sizeBytes: 1n,
          sha256: 'a'.repeat(64),
        },
        {
          id: secondAssetId,
          kind: 'IMAGE',
          status: 'READY',
          originalName: 'second.png',
          storedName: `${secondAssetId}.png`,
          relativePath: `assets/${secondAssetId}.png`,
          mimeType: 'image/png',
          sizeBytes: 1n,
          sha256: 'b'.repeat(64),
        },
      ],
    });

    const firstDocument = parseProjectDocument({
      schemaVersion: 1,
      metadata: {
        title: 'Asset synchronization test',
      },
      template: {
        id: 'warning-dark-v1',
      },
      theme: {
        logoAssetId: firstAssetId,
      },
      scenes: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          type: 'image',
          name: 'Asset scene',
        },
      ],
    });
    const project = await repository.create({
      name: 'Asset synchronization test',
      description: null,
      draftDocument: firstDocument,
      assetIds: [firstAssetId],
    });
    createdProjectIds.push(project.id);

    await expect(
      database.projectAsset.findMany({
        where: {
          projectId: project.id,
        },
        select: {
          assetId: true,
        },
      }),
    ).resolves.toEqual([{ assetId: firstAssetId }]);

    const secondDocument = parseProjectDocument({
      ...firstDocument,
      theme: {
        ...firstDocument.theme,
        logoAssetId: secondAssetId,
      },
    });
    await repository.updateDraft({
      projectId: project.id,
      expectedDraftVersion: 1,
      draftDocument: secondDocument,
      assetIds: [secondAssetId],
    });

    await expect(
      database.projectAsset.findMany({
        where: {
          projectId: project.id,
        },
        select: {
          assetId: true,
        },
      }),
    ).resolves.toEqual([{ assetId: secondAssetId }]);

    const missingAssetUpdate = repository.updateDraft({
      projectId: project.id,
      expectedDraftVersion: 2,
      draftDocument: secondDocument,
      assetIds: [missingAssetId],
    });

    await expect(missingAssetUpdate).rejects.toMatchObject({
      code: 'ASSET_NOT_FOUND',
      assetIds: [missingAssetId],
    });
    await expect(missingAssetUpdate).rejects.toBeInstanceOf(AssetNotFoundError);

    await expect(repository.findById(project.id)).resolves.toMatchObject({
      draftVersion: 2,
    });
    await expect(
      database.projectAsset.findMany({
        where: {
          projectId: project.id,
        },
        select: {
          assetId: true,
        },
      }),
    ).resolves.toEqual([{ assetId: secondAssetId }]);
  });
});
