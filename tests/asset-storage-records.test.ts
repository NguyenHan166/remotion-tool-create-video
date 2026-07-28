import { describe, expect, it, vi } from 'vitest';
import {
  PrismaAssetRepository,
  type Asset,
  type PrismaClient,
} from '../packages/database/src/index.js';
import { StoragePathError, createAssetStorageLocation } from '../packages/storage/src/index.js';

const assetId = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const normalizedAssetId = assetId.toLowerCase();
const createdAt = new Date('2026-07-28T08:00:00.000Z');
const storedAsset: Asset = {
  id: normalizedAssetId,
  kind: 'VIDEO',
  status: 'PROCESSING',
  originalName: '../../Bản tin nóng mùa hè.MP4',
  storedName: `${normalizedAssetId}.mp4`,
  relativePath: `assets/${normalizedAssetId}.mp4`,
  mimeType: 'video/mp4',
  sizeBytes: 42n,
  sha256: 'a'.repeat(64),
  width: null,
  height: null,
  durationMs: null,
  hasAudio: null,
  errorCode: null,
  errorMessage: null,
  metadata: null,
  createdAt,
  updatedAt: createdAt,
};

describe('asset storage naming', () => {
  it('uses only the normalized UUID and extension for relative storage paths', () => {
    expect(createAssetStorageLocation(assetId, '.MP4')).toEqual({
      storedName: `${normalizedAssetId}.mp4`,
      relativePath: `assets/${normalizedAssetId}.mp4`,
    });
  });

  it.each(['', '.', '../mp4', 'mp4/../../outside', 'mp 4', 'extension-is-too-long', '\0mp4'])(
    'rejects unsafe file extension %j',
    (fileExtension) => {
      expect(() => createAssetStorageLocation(assetId, fileExtension)).toThrow(StoragePathError);
    },
  );

  it('rejects a non-UUID asset ID', () => {
    expect(() => createAssetStorageLocation('../../original-name', 'png')).toThrow(
      StoragePathError,
    );
  });
});

describe('Prisma asset repository', () => {
  it('keeps the original name as metadata and never uses it as a disk path', async () => {
    const create = vi.fn(async () => storedAsset);
    const database = {
      asset: {
        create,
      },
    } as unknown as PrismaClient;
    const repository = new PrismaAssetRepository(database, () => assetId);

    await expect(
      repository.create({
        kind: 'VIDEO',
        originalName: storedAsset.originalName,
        fileExtension: '.MP4',
        mimeType: storedAsset.mimeType,
        sizeBytes: storedAsset.sizeBytes,
        sha256: storedAsset.sha256,
      }),
    ).resolves.toEqual(storedAsset);

    expect(create).toHaveBeenCalledWith({
      data: {
        id: assetId,
        kind: 'VIDEO',
        originalName: '../../Bản tin nóng mùa hè.MP4',
        storedName: `${normalizedAssetId}.mp4`,
        relativePath: `assets/${normalizedAssetId}.mp4`,
        mimeType: 'video/mp4',
        sizeBytes: 42n,
        sha256: 'a'.repeat(64),
      },
    });
    expect(storedAsset.relativePath).not.toContain('Bản tin');
    expect(storedAsset.relativePath).not.toContain('..');
  });

  it('lists assets with pagination and metadata/reference filters', async () => {
    const findMany = vi.fn(async () => [storedAsset]);
    const count = vi.fn(async () => 1);
    const transaction = vi.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries));
    const database = {
      asset: {
        findMany,
        count,
      },
      $transaction: transaction,
    } as unknown as PrismaClient;
    const repository = new PrismaAssetRepository(database);

    await expect(
      repository.list({
        page: 2,
        pageSize: 10,
        projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        kind: 'VIDEO',
        status: 'PROCESSING',
        search: 'bản tin',
      }),
    ).resolves.toEqual({
      items: [storedAsset],
      total: 1,
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        projects: {
          some: {
            projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        },
        kind: 'VIDEO',
        status: 'PROCESSING',
        originalName: {
          contains: 'bản tin',
          mode: 'insensitive',
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({
      where: {
        projects: {
          some: {
            projectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
        },
        kind: 'VIDEO',
        status: 'PROCESSING',
        originalName: {
          contains: 'bản tin',
          mode: 'insensitive',
        },
      },
    });
  });
});
