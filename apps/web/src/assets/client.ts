export type AssetKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FONT' | 'LOGO' | 'SUBTITLE';
export type AssetStatus = 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';

export type AssetDto = {
  id: string;
  kind: AssetKind;
  status: AssetStatus;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  hasAudio: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssetPageDto = {
  items: AssetDto[];
  page: number;
  pageSize: number;
  total: number;
};

export type AssetFilters = {
  page: number;
  pageSize: number;
  search: string;
  kind: '' | AssetKind;
  status: '' | Exclude<AssetStatus, 'DELETED'>;
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

export class AssetApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: string[];

  constructor(status: number, code: string, message: string, details: string[] = []) {
    super(message);
    this.name = 'AssetApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function toApiError(response: Response): Promise<AssetApiError> {
  let envelope: ErrorEnvelope = {};

  try {
    envelope = (await response.json()) as ErrorEnvelope;
  } catch {
    // A proxy or interrupted response may not contain the standard JSON envelope.
  }

  return new AssetApiError(
    response.status,
    envelope.error?.code ?? 'REQUEST_FAILED',
    envelope.error?.message ?? `Request failed with status ${response.status}.`,
    envelope.error?.details
      ?.map((detail) => detail.message)
      .filter((message): message is string => message !== undefined) ?? [],
  );
}

export async function fetchAssets(
  filters: AssetFilters,
  signal?: AbortSignal,
): Promise<AssetPageDto> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });

  if (filters.search.trim().length > 0) {
    query.set('search', filters.search.trim());
  }

  if (filters.kind !== '') {
    query.set('kind', filters.kind);
  }

  if (filters.status !== '') {
    query.set('status', filters.status);
  }

  const response = await fetch(`/api/v1/assets?${query.toString()}`, {
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as AssetPageDto;
}

export async function uploadAsset(file: File): Promise<AssetDto> {
  const body = new FormData();
  body.set('file', file);
  const response = await fetch('/api/v1/assets', {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return (await response.json()) as AssetDto;
}

export async function deleteAsset(assetId: string): Promise<void> {
  const response = await fetch(`/api/v1/assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw await toApiError(response);
  }
}

export function getAssetFileUrl(assetId: string): string {
  return `/api/v1/assets/${encodeURIComponent(assetId)}/file`;
}
