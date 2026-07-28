import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { resolveStoredAssetPath } from './media-upload.js';
import { type StoragePaths } from './storage.js';

export type ByteRange = Readonly<{
  start: number;
  end: number;
}>;

export type StoredAssetStream = Readonly<{
  body: ReadableStream<Uint8Array>;
  fileSize: number;
  range: ByteRange | null;
}>;

export class InvalidByteRangeError extends Error {
  readonly code = 'RANGE_NOT_SATISFIABLE';
  readonly fileSize: number;

  constructor(fileSize: number) {
    super('The requested byte range is invalid or not satisfiable.');
    this.name = 'InvalidByteRangeError';
    this.fileSize = fileSize;
  }
}

export class StoredAssetFileNotFoundError extends Error {
  readonly code = 'ASSET_FILE_NOT_FOUND';

  constructor(cause?: unknown) {
    super('The stored asset file was not found.', cause === undefined ? undefined : { cause });
    this.name = 'StoredAssetFileNotFoundError';
  }
}

function isMissingFileError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === 'ENOENT' || error.code === 'ENOTDIR';
}

function parseUnsignedInteger(value: string): bigint | null {
  return /^\d+$/u.test(value) ? BigInt(value) : null;
}

export function parseByteRangeHeader(rangeHeader: string, fileSize: number): ByteRange {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
    throw new TypeError('File size must be a non-negative safe integer.');
  }

  const match = /^bytes=(\d*)-(\d*)$/iu.exec(rangeHeader.trim());

  if (match === null || fileSize === 0) {
    throw new InvalidByteRangeError(fileSize);
  }

  const startValue = match[1] ?? '';
  const endValue = match[2] ?? '';

  if (startValue.length === 0 && endValue.length === 0) {
    throw new InvalidByteRangeError(fileSize);
  }

  const fileSizeBigInt = BigInt(fileSize);

  if (startValue.length === 0) {
    const suffixLength = parseUnsignedInteger(endValue);

    if (suffixLength === null || suffixLength === 0n) {
      throw new InvalidByteRangeError(fileSize);
    }

    const length = suffixLength > fileSizeBigInt ? fileSizeBigInt : suffixLength;

    return {
      start: Number(fileSizeBigInt - length),
      end: fileSize - 1,
    };
  }

  const start = parseUnsignedInteger(startValue);
  const requestedEnd = endValue.length === 0 ? fileSizeBigInt - 1n : parseUnsignedInteger(endValue);

  if (start === null || requestedEnd === null || start >= fileSizeBigInt || requestedEnd < start) {
    throw new InvalidByteRangeError(fileSize);
  }

  const end = requestedEnd >= fileSizeBigInt ? fileSizeBigInt - 1n : requestedEnd;

  return {
    start: Number(start),
    end: Number(end),
  };
}

export async function createStoredAssetStream(
  paths: StoragePaths,
  relativePath: string,
  rangeHeader?: string,
): Promise<StoredAssetStream> {
  const assetPath = resolveStoredAssetPath(paths, relativePath);
  let fileStat: Awaited<ReturnType<typeof stat>>;

  try {
    fileStat = await stat(assetPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new StoredAssetFileNotFoundError(error);
    }

    throw error;
  }

  if (!fileStat.isFile()) {
    throw new StoredAssetFileNotFoundError();
  }

  if (!Number.isSafeInteger(fileStat.size) || fileStat.size < 0) {
    throw new RangeError('Stored asset size is outside the supported range.');
  }

  const range = rangeHeader === undefined ? null : parseByteRangeHeader(rangeHeader, fileStat.size);
  const nodeStream =
    range === null
      ? createReadStream(assetPath)
      : createReadStream(assetPath, {
          start: range.start,
          end: range.end,
        });

  return {
    body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
    fileSize: fileStat.size,
    range,
  };
}
