import {
  type OutputKind,
  type RenderJobRecord,
  type RenderJobRepository,
  type RenderStatus,
} from '@hansys/database';
import { type ListRendersQuery } from './contracts.js';

export type RenderOutputResponse = {
  id: string;
  kind: OutputKind;
  relativePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  metadata: unknown;
  createdAt: string;
};

export type RenderJobResponse = {
  id: string;
  projectId: string;
  revisionId: string;
  status: RenderStatus;
  preset: string;
  priority: number;
  progress: number;
  renderedFrames: number | null;
  encodedFrames: number | null;
  totalFrames: number | null;
  stageMessage: string | null;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  availableAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  outputs: RenderOutputResponse[];
};

export type RenderJobPageResponse = {
  items: RenderJobResponse[];
  page: number;
  pageSize: number;
  total: number;
};

export interface RenderService {
  list(input: ListRendersQuery): Promise<RenderJobPageResponse>;
  get(renderJobId: string): Promise<RenderJobResponse>;
}

export class RenderRecordNotFoundError extends Error {
  readonly code = 'RENDER_NOT_FOUND';

  constructor() {
    super('Render job not found.');
    this.name = 'RenderRecordNotFoundError';
  }
}

function toSafeNumber(value: bigint): number {
  const numberValue = Number(value);

  if (!Number.isSafeInteger(numberValue)) {
    throw new RangeError('Render output metadata exceeds the JSON safe integer range.');
  }

  return numberValue;
}

function toNullableSafeNumber(value: bigint | null): number | null {
  return value === null ? null : toSafeNumber(value);
}

export function toRenderJobResponse(job: RenderJobRecord): RenderJobResponse {
  return {
    id: job.id,
    projectId: job.projectId,
    revisionId: job.revisionId,
    status: job.status,
    preset: job.preset,
    priority: job.priority,
    progress: job.progress,
    renderedFrames: job.renderedFrames,
    encodedFrames: job.encodedFrames,
    totalFrames: job.totalFrames,
    stageMessage: job.stageMessage,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    availableAt: job.availableAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    outputs: job.outputs.map((output) => ({
      id: output.id,
      kind: output.kind,
      relativePath: output.relativePath,
      fileName: output.fileName,
      mimeType: output.mimeType,
      sizeBytes: toSafeNumber(output.sizeBytes),
      width: output.width,
      height: output.height,
      durationMs: toNullableSafeNumber(output.durationMs),
      metadata: output.metadata,
      createdAt: output.createdAt.toISOString(),
    })),
  };
}

export class DefaultRenderService implements RenderService {
  readonly #repository: RenderJobRepository;

  constructor(repository: RenderJobRepository) {
    this.#repository = repository;
  }

  async list(input: ListRendersQuery): Promise<RenderJobPageResponse> {
    const page = await this.#repository.list({
      page: input.page,
      pageSize: input.pageSize,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.status === undefined ? {} : { status: input.status }),
    });

    return {
      items: page.items.map(toRenderJobResponse),
      page: input.page,
      pageSize: input.pageSize,
      total: page.total,
    };
  }

  async get(renderJobId: string): Promise<RenderJobResponse> {
    const renderJob = await this.#repository.findById(renderJobId);

    if (renderJob === null) {
      throw new RenderRecordNotFoundError();
    }

    return toRenderJobResponse(renderJob);
  }
}
