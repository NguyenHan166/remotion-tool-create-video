import { execFile } from 'node:child_process';
import { type SupportedAssetKind } from '@hansys/storage';

const FFPROBE_TIMEOUT_MS = 30_000;
const FFPROBE_MAX_OUTPUT_BYTES = 1024 * 1024;

export type MediaMetadataSummary = Record<string, string | number | boolean>;

export type ExtractedMediaMetadata = Readonly<{
  width: number | null;
  height: number | null;
  durationMs: bigint | null;
  hasAudio: boolean;
  metadata: MediaMetadataSummary;
}>;

export type ExtractMediaMetadataInput = Readonly<{
  kind: SupportedAssetKind;
  filePath: string;
}>;

export interface MediaMetadataExtractor {
  extract(input: ExtractMediaMetadataInput): Promise<ExtractedMediaMetadata>;
}

export type FfprobeRunner = (filePath: string) => Promise<string>;

type JsonObject = Record<string, unknown>;

type NormalizedStream = Readonly<{
  index: number | null;
  codecType: string | null;
  codecName: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}>;

export class FfprobeUnavailableError extends Error {
  readonly code = 'FFPROBE_UNAVAILABLE';

  constructor(cause: unknown) {
    super('ffprobe is unavailable.', { cause });
    this.name = 'FfprobeUnavailableError';
  }
}

export class MediaMetadataExtractionError extends Error {
  readonly code = 'MEDIA_METADATA_EXTRACTION_FAILED';

  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'MediaMetadataExtractionError';
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function readPositiveInteger(value: unknown): number | null {
  const numberValue = readPositiveNumber(value);

  return numberValue !== null && Number.isSafeInteger(numberValue) && numberValue <= 2_147_483_647
    ? numberValue
    : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeStream(value: unknown): NormalizedStream | null {
  if (!isJsonObject(value)) {
    return null;
  }

  return {
    index: readNonNegativeInteger(value.index),
    codecType: readString(value.codec_type),
    codecName: readString(value.codec_name),
    width: readPositiveInteger(value.width),
    height: readPositiveInteger(value.height),
    durationSeconds: readPositiveNumber(value.duration),
  };
}

function parseFfprobeDocument(output: string | JsonObject): JsonObject {
  if (typeof output !== 'string') {
    return output;
  }

  try {
    const parsed: unknown = JSON.parse(output);

    if (!isJsonObject(parsed)) {
      throw new TypeError('ffprobe output must be a JSON object.');
    }

    return parsed;
  } catch (error) {
    if (error instanceof MediaMetadataExtractionError) {
      throw error;
    }

    throw new MediaMetadataExtractionError('ffprobe returned invalid JSON.', error);
  }
}

function requireDurationMs(
  format: JsonObject | null,
  streams: readonly NormalizedStream[],
): bigint {
  const formatDuration = readPositiveNumber(format?.duration);
  const streamDurations = streams
    .map((stream) => stream.durationSeconds)
    .filter((duration): duration is number => duration !== null);
  const durationSeconds =
    formatDuration ?? (streamDurations.length === 0 ? null : Math.max(...streamDurations));

  if (durationSeconds === null) {
    throw new MediaMetadataExtractionError('Media duration is missing or invalid.');
  }

  const durationMs = Math.round(durationSeconds * 1000);

  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new MediaMetadataExtractionError('Media duration is outside the supported range.');
  }

  return BigInt(durationMs);
}

function createMetadataSummary(
  format: JsonObject | null,
  streams: readonly NormalizedStream[],
): MediaMetadataSummary {
  const videoStream = streams.find((stream) => stream.codecType === 'video');
  const audioStream = streams.find((stream) => stream.codecType === 'audio');
  const formatName = readString(format?.format_name);

  return {
    streamCount: streams.length,
    ...(formatName === null ? {} : { formatName }),
    ...(videoStream?.codecName === null || videoStream?.codecName === undefined
      ? {}
      : { videoCodec: videoStream.codecName }),
    ...(audioStream?.codecName === null || audioStream?.codecName === undefined
      ? {}
      : { audioCodec: audioStream.codecName }),
  };
}

export function parseFfprobeMediaMetadata(
  kind: Exclude<SupportedAssetKind, 'SUBTITLE'>,
  output: string | JsonObject,
): ExtractedMediaMetadata {
  const document = parseFfprobeDocument(output);
  const streams = Array.isArray(document.streams)
    ? document.streams
        .map(normalizeStream)
        .filter((stream): stream is NormalizedStream => stream !== null)
    : [];
  const format = isJsonObject(document.format) ? document.format : null;
  const videoStream = streams.find((stream) => stream.codecType === 'video');
  const audioStream = streams.find((stream) => stream.codecType === 'audio');
  const metadata = createMetadataSummary(format, streams);

  if (kind === 'IMAGE') {
    if (videoStream?.width === null || videoStream?.width === undefined) {
      throw new MediaMetadataExtractionError('Image width is missing or invalid.');
    }

    if (videoStream.height === null) {
      throw new MediaMetadataExtractionError('Image height is missing or invalid.');
    }

    return {
      width: videoStream.width,
      height: videoStream.height,
      durationMs: null,
      hasAudio: false,
      metadata,
    };
  }

  if (kind === 'VIDEO') {
    if (videoStream?.width === null || videoStream?.width === undefined) {
      throw new MediaMetadataExtractionError('Video width is missing or invalid.');
    }

    if (videoStream.height === null) {
      throw new MediaMetadataExtractionError('Video height is missing or invalid.');
    }

    return {
      width: videoStream.width,
      height: videoStream.height,
      durationMs: requireDurationMs(format, streams),
      hasAudio: audioStream !== undefined,
      metadata,
    };
  }

  if (audioStream === undefined) {
    throw new MediaMetadataExtractionError('Audio stream is missing.');
  }

  return {
    width: null,
    height: null,
    durationMs: requireDurationMs(format, streams),
    hasAudio: true,
    metadata,
  };
}

export const runFfprobe: FfprobeRunner = (filePath) =>
  new Promise((resolve, reject) => {
    execFile(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=format_name,duration:stream=index,codec_type,codec_name,width,height,duration',
        '-of',
        'json',
        filePath,
      ],
      {
        encoding: 'utf8',
        maxBuffer: FFPROBE_MAX_OUTPUT_BYTES,
        timeout: FFPROBE_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error !== null) {
          const errorCode =
            typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

          if (errorCode === 'ENOENT') {
            reject(new FfprobeUnavailableError(error));
            return;
          }

          reject(new MediaMetadataExtractionError('ffprobe could not read the media file.', error));
          return;
        }

        resolve(stdout);
      },
    );
  });

export class FfprobeMediaMetadataExtractor implements MediaMetadataExtractor {
  readonly #runFfprobe: FfprobeRunner;

  constructor(run: FfprobeRunner = runFfprobe) {
    this.#runFfprobe = run;
  }

  async extract({ kind, filePath }: ExtractMediaMetadataInput): Promise<ExtractedMediaMetadata> {
    if (kind === 'SUBTITLE') {
      return {
        width: null,
        height: null,
        durationMs: null,
        hasAudio: false,
        metadata: {
          formatName: 'subrip',
          streamCount: 1,
        },
      };
    }

    const output = await this.#runFfprobe(filePath);

    return parseFfprobeMediaMetadata(kind, output);
  }
}
