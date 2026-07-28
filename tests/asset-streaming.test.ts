import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type Asset,
  type AssetRecordPage,
  type AssetRepository,
} from '../packages/database/src/index.js';
import {
  InvalidByteRangeError,
  initializeStorage,
  parseByteRangeHeader,
  type StoragePaths,
} from '../packages/storage/src/index.js';
import { DefaultAssetFileService } from '../apps/web/src/assets/file-service.js';
import { createAssetFileHandlers } from '../apps/web/src/assets/handlers.js';

const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fileName = `${assetId}.mp4`;
const relativePath = `assets/${fileName}`;
const fileBytes = new TextEncoder().encode('0123456789');
const temporaryDirectories: string[] = [];

function createAsset(status: Asset['status'] = 'READY'): Asset {
  const timestamp = new Date('2026-07-28T08:00:00.000Z');

  return {
    id: assetId,
    kind: 'VIDEO',
    status,
    originalName: 'fixture.mp4',
    storedName: fileName,
    relativePath,
    mimeType: 'video/mp4',
    sizeBytes: BigInt(fileBytes.byteLength),
    sha256: 'a'.repeat(64),
    width: 1920,
    height: 1080,
    durationMs: 2500n,
    hasAudio: true,
    errorCode: null,
    errorMessage: null,
    metadata: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

class StreamingAssetRepository implements AssetRepository {
  readonly #asset: Asset | null;

  constructor(asset: Asset | null) {
    this.#asset = asset;
  }

  async create(): Promise<Asset> {
    throw new Error('Not implemented in streaming fixture repository.');
  }

  async markReady(): Promise<Asset> {
    throw new Error('Not implemented in streaming fixture repository.');
  }

  async markFailed(): Promise<Asset> {
    throw new Error('Not implemented in streaming fixture repository.');
  }

  async findById(id: string): Promise<Asset | null> {
    return this.#asset?.id === id ? this.#asset : null;
  }

  async list(): Promise<AssetRecordPage> {
    return {
      items: this.#asset === null ? [] : [this.#asset],
      total: this.#asset === null ? 0 : 1,
    };
  }
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hansys-stream-'));
  temporaryDirectories.push(directory);

  return directory;
}

async function createTestContext(
  asset: Asset | null = createAsset(),
  writePhysicalFile = true,
): Promise<{
  paths: StoragePaths;
  handlers: ReturnType<typeof createAssetFileHandlers>;
}> {
  const paths = await initializeStorage(createTemporaryDirectory());

  if (writePhysicalFile) {
    writeFileSync(join(paths.assets, fileName), fileBytes);
  }

  const service = new DefaultAssetFileService(new StreamingAssetRepository(asset), paths);

  return {
    paths,
    handlers: createAssetFileHandlers(service),
  };
}

function createRequest(range?: string): Request {
  return new Request(`http://localhost/api/v1/assets/${assetId}/file`, {
    headers: {
      'X-Request-ID': 'stream-request-1',
      ...(range === undefined ? {} : { Range: range }),
    },
  });
}

function createContext(id = assetId): {
  params: {
    assetId: string;
  };
} {
  return {
    params: {
      assetId: id,
    },
  };
}

async function readResponseBytes(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('byte range parsing', () => {
  it.each([
    ['bytes=0-3', { start: 0, end: 3 }],
    ['bytes=4-', { start: 4, end: 9 }],
    ['bytes=-3', { start: 7, end: 9 }],
    ['bytes=-99', { start: 0, end: 9 }],
    ['Bytes=2-4', { start: 2, end: 4 }],
    ['bytes=8-99', { start: 8, end: 9 }],
  ] as const)('parses %s', (header, expected) => {
    expect(parseByteRangeHeader(header, fileBytes.byteLength)).toEqual(expected);
  });

  it.each([
    'bytes=',
    'bytes=10-',
    'bytes=8-3',
    'bytes=-0',
    'bytes=0-1,4-5',
    'bytes=999999999999999999999999-',
  ])('rejects invalid or unsatisfiable range %s', (header) => {
    expect(() => parseByteRangeHeader(header, fileBytes.byteLength)).toThrowError(
      InvalidByteRangeError,
    );
  });
});

describe('asset file streaming API', () => {
  it('streams the full file with media headers', async () => {
    const { handlers } = await createTestContext();
    const response = await handlers.GET(createRequest(), createContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-type')).toBe('video/mp4');
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-range')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await readResponseBytes(response)).toEqual(fileBytes);
  });

  it('supports browser-style seeking with bounded, open-ended and suffix ranges', async () => {
    const { handlers } = await createTestContext();
    const bounded = await handlers.GET(createRequest('bytes=2-5'), createContext());
    const openEnded = await handlers.GET(createRequest('bytes=7-'), createContext());
    const suffix = await handlers.GET(createRequest('bytes=-3'), createContext());

    expect(bounded.status).toBe(206);
    expect(bounded.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(bounded.headers.get('content-length')).toBe('4');
    expect(new TextDecoder().decode(await readResponseBytes(bounded))).toBe('2345');

    expect(openEnded.status).toBe(206);
    expect(openEnded.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(new TextDecoder().decode(await readResponseBytes(openEnded))).toBe('789');

    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('content-range')).toBe('bytes 7-9/10');
    expect(new TextDecoder().decode(await readResponseBytes(suffix))).toBe('789');
  });

  it('ignores unsupported range units and serves the full representation', async () => {
    const { handlers } = await createTestContext();
    const response = await handlers.GET(createRequest('items=0-2'), createContext());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-range')).toBeNull();
    expect(await readResponseBytes(response)).toEqual(fileBytes);
  });

  it('returns 416 with the current size for an unsatisfiable range', async () => {
    const { handlers } = await createTestContext();
    const response = await handlers.GET(createRequest('bytes=20-30'), createContext());

    expect(response.status).toBe(416);
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.get('content-range')).toBe('bytes */10');
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Requested byte range is not satisfiable.',
        requestId: 'stream-request-1',
      },
    });
  });

  it('rejects invalid IDs, missing assets and assets that are not READY', async () => {
    const ready = await createTestContext();
    const missing = await createTestContext(null, false);
    const processing = await createTestContext(createAsset('PROCESSING'));
    const invalidIdResponse = await ready.handlers.GET(
      createRequest(),
      createContext('not-a-uuid'),
    );
    const missingResponse = await missing.handlers.GET(createRequest(), createContext());
    const processingResponse = await processing.handlers.GET(createRequest(), createContext());

    expect(invalidIdResponse.status).toBe(400);
    await expect(invalidIdResponse.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
      },
    });
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toMatchObject({
      error: {
        code: 'ASSET_NOT_FOUND',
      },
    });
    expect(processingResponse.status).toBe(409);
    await expect(processingResponse.json()).resolves.toMatchObject({
      error: {
        code: 'ASSET_NOT_READY',
      },
    });
  });

  it('returns 404 when the metadata record exists but the physical file is missing', async () => {
    const { handlers } = await createTestContext(createAsset(), false);
    const response = await handlers.GET(createRequest(), createContext());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'ASSET_NOT_FOUND',
      },
    });
  });
});
