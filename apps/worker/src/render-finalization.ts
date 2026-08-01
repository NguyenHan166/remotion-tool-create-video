import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { BrowserLog, renderStill } from '@remotion/renderer';
import { RenderPipelineError } from './render-errors.js';
import type { RenderInputProps, SelectedComposition } from './render-composition.js';

const FFPROBE_TIMEOUT_MS = 30_000;
const FFPROBE_MAX_OUTPUT_BYTES = 1024 * 1024;

type JsonObject = Record<string, unknown>;

export type RenderedVideoProbe = Readonly<{
  sizeBytes: bigint;
  width: number;
  height: number;
  durationMs: bigint;
  metadata: Record<string, string | number | boolean>;
}>;

export type RenderedThumbnail = Readonly<{
  sizeBytes: bigint;
  width: number;
  height: number;
  frame: number;
}>;

export type FfprobeRunner = (filePath: string) => Promise<string>;
export type RenderStill = typeof renderStill;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = positiveNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseDocument(output: string): JsonObject {
  try {
    const document: unknown = JSON.parse(output);

    if (!isObject(document)) {
      throw new TypeError('ffprobe output is not an object.');
    }

    return document;
  } catch (cause) {
    throw new RenderPipelineError('OUTPUT_PROBE_FAILED', 'ffprobe returned invalid JSON.', {
      cause,
    });
  }
}

export function parseRenderedVideoProbe(
  output: string,
  expected: Pick<SelectedComposition, 'width' | 'height'>,
  sizeBytes: bigint,
): RenderedVideoProbe {
  const document = parseDocument(output);
  const streams = Array.isArray(document.streams) ? document.streams.filter(isObject) : [];
  const format = isObject(document.format) ? document.format : null;
  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const formatName = nonEmptyString(format?.format_name);
  const width = positiveInteger(video?.width);
  const height = positiveInteger(video?.height);
  const codec = nonEmptyString(video?.codec_name);
  const durationSeconds = positiveNumber(format?.duration) ?? positiveNumber(video?.duration);

  if (video === undefined || width === null || height === null || durationSeconds === null) {
    throw new RenderPipelineError(
      'OUTPUT_PROBE_FAILED',
      'Rendered media is missing a valid video stream, dimensions, or duration.',
    );
  }

  if (codec !== 'h264') {
    throw new RenderPipelineError(
      'OUTPUT_PROBE_FAILED',
      `Rendered video codec must be h264, received ${codec ?? 'unknown'}.`,
    );
  }

  if (width !== expected.width || height !== expected.height) {
    throw new RenderPipelineError(
      'OUTPUT_PROBE_FAILED',
      `Rendered video dimensions ${width}x${height} do not match ${expected.width}x${expected.height}.`,
    );
  }

  const durationMs = Math.round(durationSeconds * 1000);

  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new RenderPipelineError('OUTPUT_PROBE_FAILED', 'Rendered duration is invalid.');
  }

  return {
    sizeBytes,
    width,
    height,
    durationMs: BigInt(durationMs),
    metadata: {
      videoCodec: codec,
      hasAudio: audio !== undefined,
      streamCount: streams.length,
      ...(formatName === null ? {} : { formatName }),
    },
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
        'format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,duration',
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
          reject(
            new RenderPipelineError(
              'OUTPUT_PROBE_FAILED',
              'ffprobe could not verify the rendered media.',
              { cause: error },
            ),
          );
          return;
        }

        resolve(stdout);
      },
    );
  });

async function requireNonEmptyFile(filePath: string, label: string): Promise<bigint> {
  let file: Awaited<ReturnType<typeof stat>>;

  try {
    file = await stat(filePath);
  } catch (cause) {
    throw new RenderPipelineError('OUTPUT_PROBE_FAILED', `${label} could not be read.`, { cause });
  }

  if (!file.isFile() || file.size <= 0) {
    throw new RenderPipelineError('OUTPUT_PROBE_FAILED', `${label} is missing or empty.`);
  }

  return BigInt(file.size);
}

export async function probeRenderedVideo(
  filePath: string,
  composition: Pick<SelectedComposition, 'width' | 'height'>,
  probe: FfprobeRunner = runFfprobe,
): Promise<RenderedVideoProbe> {
  const sizeBytes = await requireNonEmptyFile(filePath, 'Rendered video');
  const output = await probe(filePath);

  return parseRenderedVideoProbe(output, composition, sizeBytes);
}

export async function renderThumbnail({
  outputLocation,
  serveUrl,
  composition,
  inputProps,
  cancelSignal,
  render,
  onBrowserLog,
}: {
  outputLocation: string;
  serveUrl: string;
  composition: SelectedComposition;
  inputProps: RenderInputProps;
  cancelSignal: NonNullable<Parameters<RenderStill>[0]['cancelSignal']>;
  render: RenderStill;
  onBrowserLog?: (log: BrowserLog) => void;
}): Promise<RenderedThumbnail> {
  const frame = Math.floor((composition.durationInFrames - 1) / 2);

  await render({
    serveUrl,
    composition,
    inputProps,
    output: outputLocation,
    frame,
    imageFormat: 'jpeg',
    jpegQuality: 85,
    overwrite: false,
    cancelSignal,
    ...(onBrowserLog === undefined ? {} : { onBrowserLog }),
  });

  return {
    sizeBytes: await requireNonEmptyFile(outputLocation, 'Rendered thumbnail'),
    width: composition.width,
    height: composition.height,
    frame,
  };
}
