import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AssetInUseError,
  type Asset,
  type AssetRecordPage,
  type AssetRepository,
  type ListAssetRecordsInput,
} from '../packages/database/src/index.js';
import { initializeStorage, type StoragePaths } from '../packages/storage/src/index.js';
import {
  createAssetCollectionHandlers,
  createAssetResourceHandlers,
} from '../apps/web/src/assets/handlers.js';
import { DefaultAssetUploadService } from '../apps/web/src/assets/service.js';

const imageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const videoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const imageRelativePath = `assets/${imageId}.png`;
const temporaryDirectories: string[] = [];

function createAsset(overrides: Partial<Asset> = {}): Asset {
  const timestamp = new Date('2026-07-28T08:00:00.000Z');

  return {
    id: imageId,
    kind: 'IMAGE',
    status: 'READY',
    originalName: 'hero-image.png',
    storedName: `${imageId}.png`,
    relativePath: imageRelativePath,
    mimeType: 'image/png',
    sizeBytes: 128n,
    sha256: 'a'.repeat(64),
    width: 640,
    height: 360,
    durationMs: null,
    hasAudio: false,
    errorCode: null,
    errorMessage: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

class LibraryAssetRepository implements AssetRepository {
  readonly #assets = new Map<string, Asset>();
  readonly #inUseAssetIds: ReadonlySet<string>;

  constructor(assets: Asset[], inUseAssetIds: ReadonlySet<string> = new Set()) {
    this.#assets = new Map(assets.map((asset) => [asset.id, asset]));
    this.#inUseAssetIds = inUseAssetIds;
  }

  async create(): Promise<Asset> {
    throw new Error('Not implemented in library fixture repository.');
  }

  async markReady(): Promise<Asset> {
    throw new Error('Not implemented in library fixture repository.');
  }

  async markFailed(): Promise<Asset> {
    throw new Error('Not implemented in library fixture repository.');
  }

  async markDeleted(assetId: string): Promise<Asset | null> {
    const asset = this.#assets.get(assetId);

    if (asset === undefined) {
      return null;
    }

    if (this.#inUseAssetIds.has(assetId)) {
      throw new AssetInUseError(assetId, 1, 0);
    }

    const deleted = {
      ...asset,
      status: 'DELETED' as const,
    };
    this.#assets.set(assetId, deleted);

    return deleted;
  }

  async findById(assetId: string): Promise<Asset | null> {
    return this.#assets.get(assetId) ?? null;
  }

  async list(input: ListAssetRecordsInput): Promise<AssetRecordPage> {
    const search = input.search?.toLocaleLowerCase();
    const items = [...this.#assets.values()]
      .filter((asset) => asset.status !== 'DELETED')
      .filter((asset) => input.kind === undefined || asset.kind === input.kind)
      .filter((asset) => input.status === undefined || asset.status === input.status)
      .filter(
        (asset) => search === undefined || asset.originalName.toLocaleLowerCase().includes(search),
      );
    const start = (input.page - 1) * input.pageSize;

    return {
      items: items.slice(start, start + input.pageSize),
      total: items.length,
    };
  }
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hansys-library-'));
  temporaryDirectories.push(directory);

  return directory;
}

async function createTestContext(inUseAssetIds: ReadonlySet<string> = new Set()): Promise<{
  paths: StoragePaths;
  collection: ReturnType<typeof createAssetCollectionHandlers>;
  resource: ReturnType<typeof createAssetResourceHandlers>;
}> {
  const paths = await initializeStorage(createTemporaryDirectory());
  const repository = new LibraryAssetRepository(
    [
      createAsset(),
      createAsset({
        id: videoId,
        kind: 'VIDEO',
        originalName: 'intro-video.mp4',
        storedName: `${videoId}.mp4`,
        relativePath: `assets/${videoId}.mp4`,
        mimeType: 'video/mp4',
        durationMs: 2500n,
        hasAudio: true,
      }),
    ],
    inUseAssetIds,
  );
  writeFileSync(join(paths.assets, `${imageId}.png`), 'image');
  writeFileSync(join(paths.assets, `${videoId}.mp4`), 'video');
  const service = new DefaultAssetUploadService(repository, paths, 1024);

  return {
    paths,
    collection: createAssetCollectionHandlers(service),
    resource: createAssetResourceHandlers(service),
  };
}

function resourceContext(assetId: string): {
  params: Promise<{ assetId: string }>;
} {
  return {
    params: Promise.resolve({
      assetId,
    }),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset library API', () => {
  it('lists and filters asset metadata for the library', async () => {
    const { collection } = await createTestContext();
    const response = await collection.GET(
      new Request(
        'http://localhost/api/v1/assets?page=1&pageSize=12&kind=IMAGE&status=READY&search=hero',
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      items: [
        {
          id: imageId,
          kind: 'IMAGE',
          status: 'READY',
          originalName: 'hero-image.png',
          width: 640,
          height: 360,
        },
      ],
      page: 1,
      pageSize: 12,
      total: 1,
    });
  });

  it('reads metadata and deletes an unreferenced asset and physical file', async () => {
    const { paths, resource } = await createTestContext();
    const context = resourceContext(imageId);
    const getResponse = await resource.GET(
      new Request(`http://localhost/api/v1/assets/${imageId}`),
      context,
    );
    const deleteResponse = await resource.DELETE(
      new Request(`http://localhost/api/v1/assets/${imageId}`, {
        method: 'DELETE',
      }),
      context,
    );
    const getAfterDelete = await resource.GET(
      new Request(`http://localhost/api/v1/assets/${imageId}`),
      context,
    );

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      id: imageId,
      status: 'READY',
    });
    expect(deleteResponse.status).toBe(204);
    expect(existsSync(join(paths.assets, `${imageId}.png`))).toBe(false);
    expect(getAfterDelete.status).toBe(404);
  });

  it('returns ASSET_IN_USE and preserves the file when references exist', async () => {
    const { paths, resource } = await createTestContext(new Set([imageId]));
    const response = await resource.DELETE(
      new Request(`http://localhost/api/v1/assets/${imageId}`, {
        method: 'DELETE',
        headers: {
          'X-Request-ID': 'delete-request-1',
        },
      }),
      resourceContext(imageId),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'ASSET_IN_USE',
        message: 'Asset is in use and cannot be deleted.',
        details: [
          {
            path: 'assetId',
            message: 'Referenced by 1 project(s) and 0 revision(s).',
          },
        ],
        requestId: 'delete-request-1',
      },
    });
    expect(existsSync(join(paths.assets, `${imageId}.png`))).toBe(true);
  });

  it('validates filters and asset IDs at the HTTP boundary', async () => {
    const { collection, resource } = await createTestContext();
    const invalidQuery = await collection.GET(
      new Request('http://localhost/api/v1/assets?page=0&kind=UNKNOWN'),
    );
    const invalidId = await resource.GET(
      new Request('http://localhost/api/v1/assets/not-a-uuid'),
      resourceContext('not-a-uuid'),
    );

    expect(invalidQuery.status).toBe(400);
    await expect(invalidQuery.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
      },
    });
    expect(invalidId.status).toBe(400);
    await expect(invalidId.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
      },
    });
  });
});
