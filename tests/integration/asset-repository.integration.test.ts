import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  PrismaAssetRepository,
  createPrismaClient,
  type PrismaClient,
} from '../../packages/database/src/index.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? describe.skip : describe;
const createdAssetIds: string[] = [];
let database: PrismaClient;

integrationTest('Prisma asset repository integration', () => {
  beforeAll(async () => {
    database = createPrismaClient(testDatabaseUrl!);
    await database.$connect();
  });

  afterEach(async () => {
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

  it('creates and queries an asset without using its original name as storage path', async () => {
    const assetId = randomUUID();
    const repository = new PrismaAssetRepository(database, () => assetId);
    createdAssetIds.push(assetId);

    const created = await repository.create({
      kind: 'IMAGE',
      originalName: '../../Ảnh kỳ nghỉ.PNG',
      fileExtension: '.PNG',
      mimeType: 'image/png',
      sizeBytes: 128n,
      sha256: 'd'.repeat(64),
    });

    expect(created).toMatchObject({
      id: assetId,
      status: 'PROCESSING',
      originalName: '../../Ảnh kỳ nghỉ.PNG',
      storedName: `${assetId}.png`,
      relativePath: `assets/${assetId}.png`,
    });
    expect(created.relativePath).not.toContain('Ảnh kỳ nghỉ');
    await expect(repository.findById(assetId)).resolves.toEqual(created);
    await expect(
      repository.list({
        page: 1,
        pageSize: 10,
        kind: 'IMAGE',
        status: 'PROCESSING',
        search: 'kỳ nghỉ',
      }),
    ).resolves.toMatchObject({
      items: [
        {
          id: assetId,
        },
      ],
      total: 1,
    });
  });
});
