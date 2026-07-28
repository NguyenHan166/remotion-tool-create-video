import { describe, expect, it, vi } from 'vitest';
import {
  type AssetInUseError,
  Prisma,
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

  it('persists successful metadata and diagnostic failure states', async () => {
    const update = vi
      .fn()
      .mockResolvedValueOnce({
        ...storedAsset,
        status: 'READY',
        width: 1920,
        height: 1080,
        durationMs: 2500n,
        hasAudio: true,
      })
      .mockResolvedValueOnce({
        ...storedAsset,
        status: 'FAILED',
        errorCode: 'MEDIA_METADATA_EXTRACTION_FAILED',
        errorMessage: 'Media metadata could not be extracted.',
      });
    const database = {
      asset: {
        update,
      },
    } as unknown as PrismaClient;
    const repository = new PrismaAssetRepository(database);

    await repository.markReady({
      assetId: storedAsset.id,
      width: 1920,
      height: 1080,
      durationMs: 2500n,
      hasAudio: true,
      metadata: {
        formatName: 'mov,mp4',
        streamCount: 2,
        videoCodec: 'h264',
        audioCodec: 'aac',
      },
    });
    await repository.markFailed({
      assetId: storedAsset.id,
      errorCode: 'MEDIA_METADATA_EXTRACTION_FAILED',
      errorMessage: 'Media metadata could not be extracted.',
    });

    expect(update).toHaveBeenNthCalledWith(1, {
      where: {
        id: storedAsset.id,
      },
      data: {
        status: 'READY',
        width: 1920,
        height: 1080,
        durationMs: 2500n,
        hasAudio: true,
        metadata: {
          formatName: 'mov,mp4',
          streamCount: 2,
          videoCodec: 'h264',
          audioCodec: 'aac',
        },
        errorCode: null,
        errorMessage: null,
      },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: {
        id: storedAsset.id,
      },
      data: {
        status: 'FAILED',
        width: null,
        height: null,
        durationMs: null,
        hasAudio: null,
        metadata: Prisma.DbNull,
        errorCode: 'MEDIA_METADATA_EXTRACTION_FAILED',
        errorMessage: 'Media metadata could not be extracted.',
      },
    });
  });

  it('excludes soft-deleted assets from unfiltered library queries', async () => {
    const findMany = vi.fn(async () => [storedAsset]);
    const count = vi.fn(async () => 1);
    const database = {
      asset: {
        findMany,
        count,
      },
      $transaction: vi.fn(async (queries: Array<Promise<unknown>>) => Promise.all(queries)),
    } as unknown as PrismaClient;
    const repository = new PrismaAssetRepository(database);

    await repository.list({
      page: 1,
      pageSize: 20,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            not: 'DELETED',
          },
        },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: {
        status: {
          not: 'DELETED',
        },
      },
    });
  });

  it('soft-deletes an unreferenced asset while holding its row lock', async () => {
    const update = vi.fn(async () => ({
      ...storedAsset,
      status: 'DELETED' as const,
    }));
    const transactionClient = {
      $queryRaw: vi.fn(async () => [{ id: storedAsset.id }]),
      projectAsset: {
        count: vi.fn(async () => 0),
      },
      revisionAsset: {
        count: vi.fn(async () => 0),
      },
      asset: {
        update,
      },
    };
    const database = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    } as unknown as PrismaClient;
    const repository = new PrismaAssetRepository(database);

    await expect(repository.markDeleted(storedAsset.id)).resolves.toMatchObject({
      id: storedAsset.id,
      status: 'DELETED',
    });
    expect(transactionClient.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transactionClient.projectAsset.count).toHaveBeenCalledWith({
      where: {
        assetId: storedAsset.id,
      },
    });
    expect(transactionClient.revisionAsset.count).toHaveBeenCalledWith({
      where: {
        assetId: storedAsset.id,
      },
    });
    expect(update).toHaveBeenCalledWith({
      where: {
        id: storedAsset.id,
      },
      data: {
        status: 'DELETED',
      },
    });
  });

  it('rejects deletion when an asset is referenced', async () => {
    const update = vi.fn();
    const transactionClient = {
      $queryRaw: vi.fn(async () => [{ id: storedAsset.id }]),
      projectAsset: {
        count: vi.fn(async () => 1),
      },
      revisionAsset: {
        count: vi.fn(async () => 2),
      },
      asset: {
        update,
      },
    };
    const database = {
      $transaction: vi.fn(
        async (callback: (transaction: typeof transactionClient) => Promise<unknown>) =>
          callback(transactionClient),
      ),
    } as unknown as PrismaClient;
    const repository = new PrismaAssetRepository(database);

    await expect(repository.markDeleted(storedAsset.id)).rejects.toMatchObject({
      name: 'AssetInUseError',
      code: 'ASSET_IN_USE',
      assetId: storedAsset.id,
      projectReferenceCount: 1,
      revisionReferenceCount: 2,
    } satisfies Partial<AssetInUseError>);
    expect(update).not.toHaveBeenCalled();
  });
});
