import { type AssetRepository } from '@hansys/database';
import {
  StoredAssetFileNotFoundError,
  createStoredAssetStream,
  type StoragePaths,
} from '@hansys/storage';

export type AssetFileStreamResponse = Readonly<{
  status: 200 | 206;
  body: ReadableStream<Uint8Array>;
  headers: Readonly<Record<string, string>>;
}>;

export interface AssetFileService {
  stream(assetId: string, rangeHeader?: string): Promise<AssetFileStreamResponse>;
}

export class AssetFileNotFoundError extends Error {
  readonly code = 'ASSET_NOT_FOUND';

  constructor() {
    super('Asset file not found.');
    this.name = 'AssetFileNotFoundError';
  }
}

export class AssetNotReadyError extends Error {
  readonly code = 'ASSET_NOT_READY';

  constructor() {
    super('Asset is not ready for streaming.');
    this.name = 'AssetNotReadyError';
  }
}

function getSupportedRangeHeader(rangeHeader: string | undefined): string | undefined {
  if (rangeHeader === undefined) {
    return undefined;
  }

  const normalizedHeader = rangeHeader.trim();

  return /^bytes=/iu.test(normalizedHeader) ? normalizedHeader : undefined;
}

export class DefaultAssetFileService implements AssetFileService {
  readonly #repository: AssetRepository;
  readonly #storagePaths: StoragePaths;

  constructor(repository: AssetRepository, storagePaths: StoragePaths) {
    this.#repository = repository;
    this.#storagePaths = storagePaths;
  }

  async stream(assetId: string, rangeHeader?: string): Promise<AssetFileStreamResponse> {
    const asset = await this.#repository.findById(assetId);

    if (asset === null || asset.status === 'DELETED') {
      throw new AssetFileNotFoundError();
    }

    if (asset.status !== 'READY') {
      throw new AssetNotReadyError();
    }

    let storedStream: Awaited<ReturnType<typeof createStoredAssetStream>>;

    try {
      storedStream = await createStoredAssetStream(
        this.#storagePaths,
        asset.relativePath,
        getSupportedRangeHeader(rangeHeader),
      );
    } catch (error) {
      if (error instanceof StoredAssetFileNotFoundError) {
        throw new AssetFileNotFoundError();
      }

      throw error;
    }

    const contentLength =
      storedStream.range === null
        ? storedStream.fileSize
        : storedStream.range.end - storedStream.range.start + 1;
    const headers: Record<string, string> = {
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=0, must-revalidate',
      'Content-Length': String(contentLength),
      'Content-Type': asset.mimeType,
      'X-Content-Type-Options': 'nosniff',
    };

    if (storedStream.range !== null) {
      headers['Content-Range'] =
        `bytes ${storedStream.range.start}-${storedStream.range.end}/${storedStream.fileSize}`;
    }

    return {
      status: storedStream.range === null ? 200 : 206,
      body: storedStream.body,
      headers,
    };
  }
}
