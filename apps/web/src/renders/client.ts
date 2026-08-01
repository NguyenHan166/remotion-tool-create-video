export type RenderStatus =
  | 'QUEUED'
  | 'PREPARING'
  | 'BUNDLING'
  | 'RENDERING'
  | 'ENCODING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';

export type RenderPreset = 'draft' | 'vertical-h264' | 'vertical-high';
export type RenderOutputKind = 'VIDEO' | 'THUMBNAIL' | 'LOG';

export type RenderOutputDto = {
  id: string;
  kind: RenderOutputKind;
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

export type RenderJobDto = {
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
  outputs: RenderOutputDto[];
};

export type RenderJobPageDto = {
  items: RenderJobDto[];
  page: number;
  pageSize: number;
  total: number;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{
      path?: string;
      message?: string;
    }>;
  };
};

export class RenderApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, code: string, message: string, details: string[] = []) {
    super(message);
    this.name = 'RenderApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function toApiError(response: Response): Promise<RenderApiError> {
  let envelope: ErrorEnvelope = {};

  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // Interrupted and proxy responses may not contain the standard JSON envelope.
  }

  return new RenderApiError(
    response.status,
    envelope.error?.code ?? 'REQUEST_FAILED',
    envelope.error?.message ?? `Request failed with status ${response.status}.`,
    envelope.error?.details
      ?.map((detail) => detail.message)
      .filter((message): message is string => message !== undefined) ?? [],
  );
}

async function readRenderResponse(response: Response): Promise<RenderJobDto> {
  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as RenderJobDto;
}

export async function fetchRenders(
  {
    projectId,
    page = 1,
    pageSize = 10,
  }: {
    projectId: string;
    page?: number;
    pageSize?: number;
  },
  signal?: AbortSignal,
): Promise<RenderJobPageDto> {
  const query = new URLSearchParams({
    projectId,
    page: String(page),
    pageSize: String(pageSize),
  });
  const response = await fetch(`/api/v1/renders?${query.toString()}`, {
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as RenderJobPageDto;
}

export function createRender(projectId: string, preset: RenderPreset): Promise<RenderJobDto> {
  return fetch('/api/v1/renders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ projectId, preset }),
  }).then(readRenderResponse);
}

export function cancelRender(renderId: string): Promise<RenderJobDto> {
  return fetch(`/api/v1/renders/${encodeURIComponent(renderId)}/cancel`, {
    method: 'POST',
  }).then(readRenderResponse);
}

export function retryRender(renderId: string): Promise<RenderJobDto> {
  return fetch(`/api/v1/renders/${encodeURIComponent(renderId)}/retry`, {
    method: 'POST',
  }).then(readRenderResponse);
}

export function getRenderDownloadUrl(renderId: string): string {
  return `/api/v1/renders/${encodeURIComponent(renderId)}/download`;
}

export function getRenderThumbnailUrl(renderId: string): string {
  return `/api/v1/renders/${encodeURIComponent(renderId)}/thumbnail`;
}

export function isActiveRenderStatus(status: RenderStatus): boolean {
  return ['QUEUED', 'PREPARING', 'BUNDLING', 'RENDERING', 'ENCODING', 'CANCEL_REQUESTED'].includes(
    status,
  );
}

export function getRenderPollingInterval(page: RenderJobPageDto | undefined): number | false {
  return page?.items.some((job) => isActiveRenderStatus(job.status)) === true ? 1_000 : false;
}

export function getRenderProgressPercent(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
}
