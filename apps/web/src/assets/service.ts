import { randomUUID } from 'node:crypto';
import { type Asset, type AssetRepository } from '@hansys/database';
import {
  assertUploadSize,
  createAssetStorageLocation,
  removeStoredAssetFile,
  safeJoin,
  storeAssetFileAtomically,
  validateMediaUpload,
  type StoragePaths,
} from '@hansys/storage';
import {
  FfprobeMediaMetadataExtractor,
  FfprobeUnavailableError,
  type MediaMetadataExtractor,
} from './media-metadata.js';
import { type ListAssetsQuery } from './contracts.js';

export type AssetResponse = {
  id: string;
  kind: Asset['kind'];
  status: Asset['status'];
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasAudio: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MultipartUploadFile = Readonly<{
  name: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

export type UploadAssetInput = Readonly<{
  file: MultipartUploadFile;
  projectId?: string;
}>;

export type AssetPageResponse = {
  items: AssetResponse[];
  page: number;
  pageSize: number;
  total: number;
};

export interface AssetService {
  upload(input: UploadAssetInput): Promise<AssetResponse>;
  list(input: ListAssetsQuery): Promise<AssetPageResponse>;
  get(assetId: string): Promise<AssetResponse>;
  delete(assetId: string): Promise<void>;
}

export type AssetUploadService = Pick<AssetService, 'upload'>;

export class AssetRecordNotFoundError extends Error {
  readonly code = 'ASSET_NOT_FOUND';

  constructor() {
    super('Asset not found.');
    this.name = 'AssetRecordNotFoundError';
  }
}

export class AssetMetadataProcessingError extends Error {
  readonly responseCode: 'INTERNAL_ERROR' | 'UNSUPPORTED_MEDIA_TYPE';
  readonly responseStatus: 415 | 500;

  constructor(unavailable: boolean, cause: unknown) {
    super('Asset metadata extraction failed.', { cause });
    this.name = 'AssetMetadataProcessingError';
    this.responseCode = unavailable ? 'INTERNAL_ERROR' : 'UNSUPPORTED_MEDIA_TYPE';
    this.responseStatus = unavailable ? 500 : 415;
  }
}

function toSafeNumber(value: bigint): number {
  const numberValue = Number(value);

  if (!Number.isSafeInteger(numberValue)) {
    throw new RangeError('Asset byte metadata exceeds the JSON safe integer range.');
  }

  return numberValue;
}

function toNullableSafeNumber(value: bigint | null): number | null {
  return value === null ? null : toSafeNumber(value);
}

export function toAssetResponse(asset: Asset): AssetResponse {
  return {
    id: asset.id,
    kind: asset.kind,
    status: asset.status,
    originalName: asset.originalName,
    storedName: asset.storedName,
    relativePath: asset.relativePath,
    mimeType: asset.mimeType,
    sizeBytes: toSafeNumber(asset.sizeBytes),
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    durationMs: toNullableSafeNumber(asset.durationMs),
    hasAudio: asset.hasAudio,
    errorCode: asset.errorCode,
    errorMessage: asset.errorMessage,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export class DefaultAssetUploadService implements AssetService {
  readonly #repository: AssetRepository;
  readonly #storagePaths: StoragePaths;
  readonly #maxUploadBytes: number;
  readonly #createId: () => string;
  readonly #metadataExtractor: MediaMetadataExtractor;

  constructor(
    repository: AssetRepository,
    storagePaths: StoragePaths,
    maxUploadBytes: number,
    createId: () => string = randomUUID,
    metadataExtractor: MediaMetadataExtractor = new FfprobeMediaMetadataExtractor(),
  ) {
    assertUploadSize(0, maxUploadBytes);
    this.#repository = repository;
    this.#storagePaths = storagePaths;
    this.#maxUploadBytes = maxUploadBytes;
    this.#createId = createId;
    this.#metadataExtractor = metadataExtractor;
  }

  async upload({ file, projectId }: UploadAssetInput): Promise<AssetResponse> {
    // Reject an oversized upload before allocating another in-memory copy.
    assertUploadSize(file.size, this.#maxUploadBytes);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const validatedUpload = validateMediaUpload(file.name, bytes, this.#maxUploadBytes);
    const assetId = this.#createId();
    const storageLocation = createAssetStorageLocation(assetId, validatedUpload.fileExtension);

    await storeAssetFileAtomically(this.#storagePaths, storageLocation.relativePath, bytes);

    try {
      await this.#repository.create({
        id: assetId,
        kind: validatedUpload.kind,
        originalName: file.name,
        fileExtension: validatedUpload.fileExtension,
        mimeType: validatedUpload.mimeType,
        sizeBytes: validatedUpload.sizeBytes,
        sha256: validatedUpload.sha256,
        ...(projectId === undefined ? {} : { projectId }),
      });
    } catch (error) {
      await removeStoredAssetFile(this.#storagePaths, storageLocation.relativePath).catch(
        () => undefined,
      );
      throw error;
    }

    let metadata: Awaited<ReturnType<MediaMetadataExtractor['extract']>>;

    try {
      metadata = await this.#metadataExtractor.extract({
        kind: validatedUpload.kind,
        filePath: safeJoin(this.#storagePaths.root, storageLocation.relativePath),
      });
    } catch (error) {
      const unavailable = error instanceof FfprobeUnavailableError;

      await this.#repository.markFailed({
        assetId,
        errorCode: unavailable ? 'FFPROBE_UNAVAILABLE' : 'MEDIA_METADATA_EXTRACTION_FAILED',
        errorMessage: unavailable
          ? 'ffprobe is unavailable.'
          : 'Media metadata could not be extracted.',
      });

      throw new AssetMetadataProcessingError(unavailable, error);
    }

    const readyAsset = await this.#repository.markReady({
      assetId,
      width: metadata.width,
      height: metadata.height,
      durationMs: metadata.durationMs,
      hasAudio: metadata.hasAudio,
      metadata: metadata.metadata,
    });

    return toAssetResponse(readyAsset);
  }

  async list(input: ListAssetsQuery): Promise<AssetPageResponse> {
    const page = await this.#repository.list({
      page: input.page,
      pageSize: input.pageSize,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.search === undefined ? {} : { search: input.search }),
    });

    return {
      items: page.items.map(toAssetResponse),
      page: input.page,
      pageSize: input.pageSize,
      total: page.total,
    };
  }

  async get(assetId: string): Promise<AssetResponse> {
    const asset = await this.#repository.findById(assetId);

    if (asset === null || asset.status === 'DELETED') {
      throw new AssetRecordNotFoundError();
    }

    return toAssetResponse(asset);
  }

  async delete(assetId: string): Promise<void> {
    const asset = await this.#repository.markDeleted(assetId);

    if (asset === null) {
      throw new AssetRecordNotFoundError();
    }

    await removeStoredAssetFile(this.#storagePaths, asset.relativePath);
  }
}
