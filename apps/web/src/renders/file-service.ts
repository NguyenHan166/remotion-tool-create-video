import { type OutputKind, type RenderJobRepository } from '@hansys/database';
import {
  StoredAssetFileNotFoundError,
  createStoredFileStream,
  type StoragePaths,
} from '@hansys/storage';

export type RenderOutputFileKind = Extract<OutputKind, 'VIDEO' | 'THUMBNAIL' | 'LOG'>;

export type RenderOutputFileStreamResponse = Readonly<{
  status: 200 | 206;
  body: ReadableStream<Uint8Array>;
  headers: Readonly<Record<string, string>>;
}>;

export interface RenderOutputFileService {
  stream(
    renderJobId: string,
    kind: RenderOutputFileKind,
    rangeHeader?: string,
  ): Promise<RenderOutputFileStreamResponse>;
}

export class RenderOutputFileNotFoundError extends Error {
  readonly code = 'RENDER_OUTPUT_NOT_FOUND';

  constructor() {
    super('Render output file not found.');
    this.name = 'RenderOutputFileNotFoundError';
  }
}

export class RenderOutputNotReadyError extends Error {
  readonly code = 'RENDER_OUTPUT_NOT_READY';

  constructor() {
    super('Render output is not ready.');
    this.name = 'RenderOutputNotReadyError';
  }
}

function supportedRange(rangeHeader: string | undefined): string | undefined {
  const normalized = rangeHeader?.trim();
  return normalized !== undefined && /^bytes=/iu.test(normalized) ? normalized : undefined;
}

function contentDisposition(fileName: string, kind: RenderOutputFileKind): string {
  const fallback =
    fileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/gu, '')
      .replace(/["\\\r\n]/gu, '_')
      .trim() ||
    (kind === 'VIDEO'
      ? 'video.mp4'
      : kind === 'THUMBNAIL'
        ? 'thumbnail.jpg'
        : 'render-diagnostic.jsonl');
  const disposition = kind === 'THUMBNAIL' ? 'inline' : 'attachment';

  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export class DefaultRenderOutputFileService implements RenderOutputFileService {
  readonly #repository: RenderJobRepository;
  readonly #storagePaths: StoragePaths;

  constructor(repository: RenderJobRepository, storagePaths: StoragePaths) {
    this.#repository = repository;
    this.#storagePaths = storagePaths;
  }

  async stream(
    renderJobId: string,
    kind: RenderOutputFileKind,
    rangeHeader?: string,
  ): Promise<RenderOutputFileStreamResponse> {
    const job = await this.#repository.findById(renderJobId);

    if (job === null) {
      throw new RenderOutputFileNotFoundError();
    }

    const diagnosticAvailableStatuses = [
      'QUEUED',
      'PREPARING',
      'BUNDLING',
      'RENDERING',
      'ENCODING',
      'FAILED',
    ] as const;

    if (
      job.status !== 'COMPLETED' &&
      !(kind === 'LOG' && diagnosticAvailableStatuses.some((status) => status === job.status))
    ) {
      throw new RenderOutputNotReadyError();
    }

    const output = job.outputs.find((candidate) => candidate.kind === kind);

    if (output === undefined) {
      throw new RenderOutputFileNotFoundError();
    }

    const expectedPrefix =
      kind === 'VIDEO'
        ? `renders/${renderJobId}/`
        : kind === 'THUMBNAIL'
          ? `thumbnails/${renderJobId}.`
          : `logs/${renderJobId}/`;

    if (!output.relativePath.startsWith(expectedPrefix)) {
      throw new RenderOutputFileNotFoundError();
    }

    let storedStream: Awaited<ReturnType<typeof createStoredFileStream>>;

    try {
      storedStream = await createStoredFileStream(
        this.#storagePaths,
        output.relativePath,
        supportedRange(rangeHeader),
      );
    } catch (error) {
      if (error instanceof StoredAssetFileNotFoundError) {
        throw new RenderOutputFileNotFoundError();
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
      'Content-Disposition': contentDisposition(output.fileName, kind),
      'Content-Length': String(contentLength),
      'Content-Type': output.mimeType,
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
