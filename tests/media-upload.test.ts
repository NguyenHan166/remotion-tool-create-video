import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Asset,
  type AssetRecordPage,
  type AssetRepository,
  type CreateAssetRecordInput,
  type MarkAssetFailedInput,
  type MarkAssetReadyInput,
} from '../packages/database/src/index.js';
import {
  UploadTooLargeError,
  createAssetStorageLocation,
  initializeStorage,
  validateMediaUpload,
  type StoragePaths,
} from '../packages/storage/src/index.js';
import { createAssetCollectionHandlers } from '../apps/web/src/assets/handlers.js';
import {
  FfprobeUnavailableError,
  type MediaMetadataExtractor,
} from '../apps/web/src/assets/media-metadata.js';
import { DefaultAssetUploadService } from '../apps/web/src/assets/service.js';

const assetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const temporaryDirectories: string[] = [];

const supportedFixtures = [
  {
    name: 'photo.png',
    bytes: pngBytes,
    kind: 'IMAGE',
    mimeType: 'image/png',
  },
  {
    name: 'photo.jpg',
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]),
    kind: 'IMAGE',
    mimeType: 'image/jpeg',
  },
  {
    name: 'photo.jpeg',
    bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe1]),
    kind: 'IMAGE',
    mimeType: 'image/jpeg',
  },
  {
    name: 'photo.webp',
    bytes: new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBP'),
    kind: 'IMAGE',
    mimeType: 'image/webp',
  },
  {
    name: 'clip.mp4',
    bytes: new TextEncoder().encode('\u0000\u0000\u0000\u0018ftypisom'),
    kind: 'VIDEO',
    mimeType: 'video/mp4',
  },
  {
    name: 'clip.mov',
    bytes: new TextEncoder().encode('\u0000\u0000\u0000\u0018ftypqt  '),
    kind: 'VIDEO',
    mimeType: 'video/quicktime',
  },
  {
    name: 'clip.webm',
    bytes: Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]),
    kind: 'VIDEO',
    mimeType: 'video/webm',
  },
  {
    name: 'voice.mp3',
    bytes: new TextEncoder().encode('ID3\u0004'),
    kind: 'AUDIO',
    mimeType: 'audio/mpeg',
  },
  {
    name: 'voice.wav',
    bytes: new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WAVE'),
    kind: 'AUDIO',
    mimeType: 'audio/wav',
  },
  {
    name: 'voice.m4a',
    bytes: new TextEncoder().encode('\u0000\u0000\u0000\u0018ftypM4A '),
    kind: 'AUDIO',
    mimeType: 'audio/mp4',
  },
  {
    name: 'voice.aac',
    bytes: Uint8Array.from([0xff, 0xf1, 0x50, 0x80]),
    kind: 'AUDIO',
    mimeType: 'audio/aac',
  },
  {
    name: 'captions.srt',
    bytes: new TextEncoder().encode('1\n00:00:00,000 --> 00:00:02,000\nXin chÃ o Viá»‡t Nam\n'),
    kind: 'SUBTITLE',
    mimeType: 'application/x-subrip',
  },
] as const;

class RecordingAssetRepository implements AssetRepository {
  readonly createInputs: CreateAssetRecordInput[] = [];
  readonly markReadyInputs: MarkAssetReadyInput[] = [];
  readonly markFailedInputs: MarkAssetFailedInput[] = [];
  #asset: Asset | null = null;

  async create(input: CreateAssetRecordInput): Promise<Asset> {
    this.createInputs.push(input);

    if (input.id === undefined) {
      throw new Error('Upload service must provide the asset ID.');
    }

    const storageLocation = createAssetStorageLocation(input.id, input.fileExtension);
    const timestamp = new Date('2026-07-28T08:00:00.000Z');

    this.#asset = {
      id: input.id,
      kind: input.kind,
      status: 'PROCESSING',
      originalName: input.originalName,
      storedName: storageLocation.storedName,
      relativePath: storageLocation.relativePath,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      width: null,
      height: null,
      durationMs: null,
      hasAudio: null,
      errorCode: null,
      errorMessage: null,
      metadata: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    return this.#asset;
  }

  async markReady(input: MarkAssetReadyInput): Promise<Asset> {
    this.markReadyInputs.push(input);

    if (this.#asset === null) {
      throw new Error('Asset must be created before it can become ready.');
    }

    this.#asset = {
      ...this.#asset,
      status: 'READY',
      width: input.width,
      height: input.height,
      durationMs: input.durationMs,
      hasAudio: input.hasAudio,
      metadata: input.metadata,
      errorCode: null,
      errorMessage: null,
    };

    return this.#asset;
  }

  async markFailed(input: MarkAssetFailedInput): Promise<Asset> {
    this.markFailedInputs.push(input);

    if (this.#asset === null) {
      throw new Error('Asset must be created before it can fail.');
    }

    this.#asset = {
      ...this.#asset,
      status: 'FAILED',
      width: null,
      height: null,
      durationMs: null,
      hasAudio: null,
      metadata: null,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    };

    return this.#asset;
  }

  async markDeleted(): Promise<Asset | null> {
    if (this.#asset === null) {
      return null;
    }

    this.#asset = {
      ...this.#asset,
      status: 'DELETED',
    };

    return this.#asset;
  }

  async findById(): Promise<Asset | null> {
    return null;
  }

  async list(): Promise<AssetRecordPage> {
    return {
      items: [],
      total: 0,
    };
  }
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hansys-upload-'));
  temporaryDirectories.push(directory);

  return directory;
}

const successfulMetadataExtractor: MediaMetadataExtractor = {
  extract: async () => ({
    width: 640,
    height: 360,
    durationMs: null,
    hasAudio: false,
    metadata: {
      formatName: 'png_pipe',
      streamCount: 1,
      videoCodec: 'png',
    },
  }),
};

async function createTestContext(
  maxUploadBytes = 1024,
  metadataExtractor: MediaMetadataExtractor = successfulMetadataExtractor,
): Promise<{
  paths: StoragePaths;
  repository: RecordingAssetRepository;
  handlers: ReturnType<typeof createAssetCollectionHandlers>;
}> {
  const paths = await initializeStorage(createTemporaryDirectory());
  const repository = new RecordingAssetRepository();
  const service = new DefaultAssetUploadService(
    repository,
    paths,
    maxUploadBytes,
    () => assetId,
    metadataExtractor,
  );

  return {
    paths,
    repository,
    handlers: createAssetCollectionHandlers(service),
  };
}

function createMultipartRequest(file: File): Request {
  const formData = new FormData();
  formData.set('file', file);

  return new Request('http://localhost/api/v1/assets', {
    method: 'POST',
    headers: {
      'X-Request-ID': 'upload-request-1',
    },
    body: formData,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('media upload validation', () => {
  it.each(supportedFixtures)(
    'detects $name from content and maps it to $kind',
    ({ name, bytes, kind, mimeType }) => {
      expect(validateMediaUpload(name, bytes, 1024)).toMatchObject({
        kind,
        fileExtension: name.slice(name.lastIndexOf('.') + 1),
        mimeType,
        sizeBytes: BigInt(bytes.byteLength),
      });
    },
  );

  it('rejects content whose detected MIME does not match the extension', () => {
    expect(() => validateMediaUpload('renamed.jpg', pngBytes, 1024)).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_MEDIA_TYPE',
      }),
    );
    expect(() =>
      validateMediaUpload('payload.exe', new TextEncoder().encode('MZ'), 1024),
    ).toThrowError(
      expect.objectContaining({
        code: 'UNSUPPORTED_MEDIA_TYPE',
      }),
    );
  });

  it('rejects an oversized file before reading its bytes', async () => {
    const paths = await initializeStorage(createTemporaryDirectory());
    const repository = new RecordingAssetRepository();
    const arrayBuffer = vi.fn(async () => pngBytes.buffer);
    const service = new DefaultAssetUploadService(repository, paths, 7, () => assetId);

    await expect(
      service.upload({
        file: {
          name: 'photo.png',
          size: pngBytes.byteLength,
          arrayBuffer,
        },
      }),
    ).rejects.toBeInstanceOf(UploadTooLargeError);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(repository.createInputs).toHaveLength(0);
    expect(readdirSync(paths.assets)).toEqual([]);
    expect(readdirSync(paths.temp)).toEqual([]);
  });
});

describe('multipart asset upload API', () => {
  it('stores a validated upload through temp using only its UUID-based name', async () => {
    const { handlers, paths, repository } = await createTestContext();
    const response = await handlers.POST(
      createMultipartRequest(
        new File([pngBytes], '../../áº¢nh ká»³ nghá»‰.PNG', {
          type: 'text/plain',
        }),
      ),
    );
    const finalPath = join(paths.assets, `${assetId}.png`);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      id: assetId,
      kind: 'IMAGE',
      status: 'READY',
      originalName: '../../áº¢nh ká»³ nghá»‰.PNG',
      storedName: `${assetId}.png`,
      relativePath: `assets/${assetId}.png`,
      mimeType: 'image/png',
      sizeBytes: pngBytes.byteLength,
      width: 640,
      height: 360,
      hasAudio: false,
    });
    expect(repository.createInputs).toEqual([
      expect.objectContaining({
        id: assetId,
        kind: 'IMAGE',
        fileExtension: 'png',
        mimeType: 'image/png',
        sha256: createHash('sha256').update(pngBytes).digest('hex'),
      }),
    ]);
    expect(repository.markReadyInputs).toEqual([
      {
        assetId,
        width: 640,
        height: 360,
        durationMs: null,
        hasAudio: false,
        metadata: {
          formatName: 'png_pipe',
          streamCount: 1,
          videoCodec: 'png',
        },
      },
    ]);
    expect(readFileSync(finalPath)).toEqual(Buffer.from(pngBytes));
    expect(readdirSync(paths.temp)).toEqual([]);
    expect(finalPath).not.toContain('áº¢nh ká»³ nghá»‰');
  });

  it('returns 415 without records or files for a spoofed MIME/extension', async () => {
    const { handlers, paths, repository } = await createTestContext();
    const response = await handlers.POST(
      createMultipartRequest(new File([pngBytes], 'renamed.jpg', { type: 'image/jpeg' })),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'The uploaded file type is unsupported or does not match its extension.',
        details: [
          {
            path: 'file',
            message: 'Use a supported media extension with matching file content.',
          },
        ],
        requestId: 'upload-request-1',
      },
    });
    expect(repository.createInputs).toHaveLength(0);
    expect(readdirSync(paths.assets)).toEqual([]);
    expect(readdirSync(paths.temp)).toEqual([]);
  });

  it('returns 413 without records or files for an oversized multipart file', async () => {
    const { handlers, paths, repository } = await createTestContext(7);
    const response = await handlers.POST(
      createMultipartRequest(new File([pngBytes], 'photo.png', { type: 'image/png' })),
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'UPLOAD_TOO_LARGE',
        details: [
          {
            path: 'file',
            message: 'Maximum upload size is 7 bytes.',
          },
        ],
        requestId: 'upload-request-1',
      },
    });
    expect(repository.createInputs).toHaveLength(0);
    expect(existsSync(join(paths.assets, `${assetId}.png`))).toBe(false);
    expect(readdirSync(paths.temp)).toEqual([]);
  });

  it('persists FAILED and keeps the diagnostic file when metadata extraction fails', async () => {
    const metadataExtractor: MediaMetadataExtractor = {
      extract: vi.fn(async () => {
        throw new Error('fixture is corrupt');
      }),
    };
    const { handlers, paths, repository } = await createTestContext(1024, metadataExtractor);
    const response = await handlers.POST(
      createMultipartRequest(new File([pngBytes], 'corrupt.png', { type: 'image/png' })),
    );

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'The uploaded media could not be read.',
        details: [
          {
            path: 'file',
            message: 'The media container or streams are invalid.',
          },
        ],
        requestId: 'upload-request-1',
      },
    });
    expect(repository.markFailedInputs).toEqual([
      {
        assetId,
        errorCode: 'MEDIA_METADATA_EXTRACTION_FAILED',
        errorMessage: 'Media metadata could not be extracted.',
      },
    ]);
    expect(existsSync(join(paths.assets, `${assetId}.png`))).toBe(true);
    expect(readdirSync(paths.temp)).toEqual([]);
  });

  it('persists an ffprobe diagnostic and returns 500 when the executable is unavailable', async () => {
    const metadataExtractor: MediaMetadataExtractor = {
      extract: vi.fn(async () => {
        throw new FfprobeUnavailableError(new Error('spawn ENOENT'));
      }),
    };
    const { handlers, paths, repository } = await createTestContext(1024, metadataExtractor);
    const response = await handlers.POST(
      createMultipartRequest(new File([pngBytes], 'photo.png', { type: 'image/png' })),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Media metadata extraction is unavailable.',
        requestId: 'upload-request-1',
      },
    });
    expect(repository.markFailedInputs).toEqual([
      {
        assetId,
        errorCode: 'FFPROBE_UNAVAILABLE',
        errorMessage: 'ffprobe is unavailable.',
      },
    ]);
    expect(existsSync(join(paths.assets, `${assetId}.png`))).toBe(true);
  });
});
