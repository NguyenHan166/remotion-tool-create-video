import { createHash, randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { safeJoin, type StoragePaths } from './storage.js';

export type SupportedAssetKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'SUBTITLE';

export type ValidatedMediaUpload = Readonly<{
  kind: SupportedAssetKind;
  fileExtension: string;
  mimeType: string;
  sizeBytes: bigint;
  sha256: string;
}>;

type MediaType = Readonly<{
  kind: SupportedAssetKind;
  mimeType: string;
}>;

const MEDIA_TYPES_BY_EXTENSION: Readonly<Record<string, MediaType>> = Object.freeze({
  png: { kind: 'IMAGE', mimeType: 'image/png' },
  jpg: { kind: 'IMAGE', mimeType: 'image/jpeg' },
  jpeg: { kind: 'IMAGE', mimeType: 'image/jpeg' },
  webp: { kind: 'IMAGE', mimeType: 'image/webp' },
  mp4: { kind: 'VIDEO', mimeType: 'video/mp4' },
  mov: { kind: 'VIDEO', mimeType: 'video/quicktime' },
  webm: { kind: 'VIDEO', mimeType: 'video/webm' },
  mp3: { kind: 'AUDIO', mimeType: 'audio/mpeg' },
  wav: { kind: 'AUDIO', mimeType: 'audio/wav' },
  m4a: { kind: 'AUDIO', mimeType: 'audio/mp4' },
  aac: { kind: 'AUDIO', mimeType: 'audio/aac' },
  srt: { kind: 'SUBTITLE', mimeType: 'application/x-subrip' },
});

export class UnsupportedMediaTypeError extends Error {
  readonly code = 'UNSUPPORTED_MEDIA_TYPE';

  constructor() {
    super('The uploaded file type is unsupported or does not match its extension.');
    this.name = 'UnsupportedMediaTypeError';
  }
}

export class UploadTooLargeError extends Error {
  readonly code = 'UPLOAD_TOO_LARGE';
  readonly sizeBytes: number;
  readonly maxBytes: number;

  constructor(sizeBytes: number, maxBytes: number) {
    super(`The uploaded file exceeds the maximum size of ${maxBytes} bytes.`);
    this.name = 'UploadTooLargeError';
    this.sizeBytes = sizeBytes;
    this.maxBytes = maxBytes;
  }
}

function hasBytes(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function detectIsoBaseMediaMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 12 || readAscii(bytes, 4, 4) !== 'ftyp') {
    return null;
  }

  const brands: string[] = [];

  for (let offset = 8; offset + 4 <= Math.min(bytes.length, 64); offset += 4) {
    brands.push(readAscii(bytes, offset, 4));
  }

  if (brands.some((brand) => brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ')) {
    return 'audio/mp4';
  }

  if (brands.includes('qt  ')) {
    return 'video/quicktime';
  }

  return 'video/mp4';
}

function isSubRip(bytes: Uint8Array): boolean {
  try {
    const detectionSample = bytes.subarray(0, 64 * 1024);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(detectionSample);

    return /(?:^|\r?\n)\s*\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}(?:\s|$)/u.test(
      text,
    );
  } catch {
    return false;
  }
}

export function detectMediaMimeType(bytes: Uint8Array): string | null {
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === 'RIFF' &&
    readAscii(bytes, 8, 4) === 'WEBP'
  ) {
    return 'image/webp';
  }

  const isoBaseMediaMimeType = detectIsoBaseMediaMimeType(bytes);

  if (isoBaseMediaMimeType !== null) {
    return isoBaseMediaMimeType;
  }

  if (hasBytes(bytes, 0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return 'video/webm';
  }

  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === 'RIFF' &&
    readAscii(bytes, 8, 4) === 'WAVE'
  ) {
    return 'audio/wav';
  }

  if (hasBytes(bytes, 0, [0x49, 0x44, 0x33])) {
    return 'audio/mpeg';
  }

  if (bytes.length >= 4 && readAscii(bytes, 0, 4) === 'ADIF') {
    return 'audio/aac';
  }

  const secondByte = bytes[1];

  if (bytes[0] === 0xff && secondByte !== undefined && (secondByte & 0xf6) === 0xf0) {
    return 'audio/aac';
  }

  if (
    bytes[0] === 0xff &&
    secondByte !== undefined &&
    (secondByte & 0xe0) === 0xe0 &&
    (secondByte & 0x18) !== 0x08 &&
    (secondByte & 0x06) !== 0
  ) {
    return 'audio/mpeg';
  }

  if (isSubRip(bytes)) {
    return 'application/x-subrip';
  }

  return null;
}

export function assertUploadSize(sizeBytes: number, maxBytes: number): void {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    throw new TypeError('Upload size must be a non-negative safe integer.');
  }

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError('Maximum upload size must be a positive safe integer.');
  }

  if (sizeBytes > maxBytes) {
    throw new UploadTooLargeError(sizeBytes, maxBytes);
  }
}

function getFileExtension(originalName: string): string {
  const finalDot = originalName.lastIndexOf('.');

  if (finalDot < 0 || finalDot === originalName.length - 1) {
    throw new UnsupportedMediaTypeError();
  }

  return originalName.slice(finalDot + 1).toLowerCase();
}

export function validateMediaUpload(
  originalName: string,
  bytes: Uint8Array,
  maxBytes: number,
): ValidatedMediaUpload {
  assertUploadSize(bytes.byteLength, maxBytes);

  const fileExtension = getFileExtension(originalName);
  const expectedMediaType = MEDIA_TYPES_BY_EXTENSION[fileExtension];
  const detectedMimeType = detectMediaMimeType(bytes);

  if (
    expectedMediaType === undefined ||
    detectedMimeType === null ||
    detectedMimeType !== expectedMediaType.mimeType
  ) {
    throw new UnsupportedMediaTypeError();
  }

  return Object.freeze({
    kind: expectedMediaType.kind,
    fileExtension,
    mimeType: detectedMimeType,
    sizeBytes: BigInt(bytes.byteLength),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

function resolveAssetPath(paths: StoragePaths, relativePath: string): string {
  const assetPath = safeJoin(paths.root, relativePath);
  const pathFromAssets = relative(paths.assets, assetPath);

  if (
    pathFromAssets.length === 0 ||
    pathFromAssets === '..' ||
    pathFromAssets.startsWith(`..${sep}`) ||
    isAbsolute(pathFromAssets)
  ) {
    throw new TypeError('Asset path must resolve inside the asset storage directory.');
  }

  return assetPath;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export async function storeAssetFileAtomically(
  paths: StoragePaths,
  relativePath: string,
  bytes: Uint8Array,
): Promise<void> {
  const assetPath = resolveAssetPath(paths, relativePath);
  const temporaryPath = safeJoin(paths.temp, `.asset-upload-${randomUUID()}.tmp`);
  let temporaryFile: Awaited<ReturnType<typeof open>> | undefined;

  try {
    temporaryFile = await open(temporaryPath, 'wx');
    await temporaryFile.writeFile(bytes);
    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = undefined;
    await rename(temporaryPath, assetPath);
  } finally {
    await temporaryFile?.close().catch(() => undefined);
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!isMissingFileError(error)) {
        throw error;
      }
    });
  }
}

export async function removeStoredAssetFile(
  paths: StoragePaths,
  relativePath: string,
): Promise<void> {
  const assetPath = resolveAssetPath(paths, relativePath);

  await unlink(assetPath).catch((error: unknown) => {
    if (!isMissingFileError(error)) {
      throw error;
    }
  });
}
