export const RENDER_FAILURE_CODES = [
  'PROJECT_SCHEMA_INVALID',
  'TEMPLATE_NOT_FOUND',
  'TEMPLATE_VALIDATION_FAILED',
  'ASSET_METADATA_MISSING',
  'ASSET_FILE_MISSING',
  'BUNDLE_FAILED',
  'COMPOSITION_SELECT_FAILED',
  'BROWSER_CRASHED',
  'RENDER_TIMEOUT',
  'RENDER_CANCELLED',
  'FFMPEG_FAILED',
  'OUTPUT_PROBE_FAILED',
  'STORAGE_FULL',
  'WORKER_LOST',
  'UNKNOWN_RENDER_ERROR',
] as const;

export type RenderFailureCode = (typeof RENDER_FAILURE_CODES)[number];

export type RenderFailureClassification = Readonly<{
  code: RenderFailureCode;
  safeMessage: string;
  technicalError: string;
  transient: boolean;
}>;

const safeMessages = {
  PROJECT_SCHEMA_INVALID: 'The saved project revision is invalid.',
  TEMPLATE_NOT_FOUND: 'The project template is unavailable.',
  TEMPLATE_VALIDATION_FAILED: 'The project revision is incompatible with its template.',
  ASSET_METADATA_MISSING: 'A referenced asset is not ready for rendering.',
  ASSET_FILE_MISSING: 'A referenced asset file is missing.',
  BUNDLE_FAILED: 'The video renderer could not build the template bundle.',
  COMPOSITION_SELECT_FAILED: 'The video composition could not be prepared.',
  BROWSER_CRASHED: 'The render browser stopped unexpectedly.',
  RENDER_TIMEOUT: 'The video render timed out.',
  RENDER_CANCELLED: 'The video render was cancelled.',
  FFMPEG_FAILED: 'The video encoder failed.',
  OUTPUT_PROBE_FAILED: 'The rendered video could not be verified.',
  STORAGE_FULL: 'There is not enough storage space to render the video.',
  WORKER_LOST: 'The render worker stopped responding.',
  UNKNOWN_RENDER_ERROR: 'The video render failed unexpectedly.',
} as const satisfies Record<RenderFailureCode, string>;

export class RenderPipelineError extends Error {
  readonly code: RenderFailureCode;
  readonly safeMessage: string;
  readonly transient: boolean;

  constructor(
    code: RenderFailureCode,
    technicalMessage: string,
    options: { cause?: unknown; transient?: boolean; safeMessage?: string } = {},
  ) {
    super(technicalMessage, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'RenderPipelineError';
    this.code = code;
    this.safeMessage = options.safeMessage ?? safeMessages[code];
    this.transient = options.transient ?? false;
  }
}

function getStringProperty(value: unknown, property: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(property in value)) {
    return undefined;
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
}

function getTechnicalError(error: unknown): string {
  const entries: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 3 && current !== undefined; depth += 1) {
    if (current instanceof Error) {
      entries.push(current.stack ?? `${current.name}: ${current.message}`);
      current = current.cause;
      continue;
    }

    if (typeof current === 'string') {
      entries.push(current);
    } else {
      try {
        entries.push(JSON.stringify(current));
      } catch {
        entries.push(String(current));
      }
    }
    break;
  }

  return entries.join('\nCaused by: ').slice(0, 4_000) || 'Unknown render error';
}

function classification(
  code: RenderFailureCode,
  error: unknown,
  transient = false,
): RenderFailureClassification {
  return {
    code,
    safeMessage: safeMessages[code],
    technicalError: getTechnicalError(error),
    transient,
  };
}

function getErrorSignals(error: unknown): {
  names: string[];
  codes: string[];
  searchable: string;
} {
  const names: string[] = [];
  const codes: string[] = [];
  const messages: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 3 && current !== undefined; depth += 1) {
    const name = getStringProperty(current, 'name');
    const code = getStringProperty(current, 'code');
    const message = getStringProperty(current, 'message');

    if (name !== undefined) {
      names.push(name);
    }

    if (code !== undefined) {
      codes.push(code);
    }

    if (message !== undefined) {
      messages.push(message);
    }

    current = current instanceof Error ? current.cause : undefined;
  }

  return {
    names,
    codes,
    searchable: [...names, ...codes, ...messages].join(' ').toLowerCase(),
  };
}

export function classifyRenderFailure(error: unknown): RenderFailureClassification {
  if (error instanceof RenderPipelineError) {
    return {
      code: error.code,
      safeMessage: error.safeMessage,
      technicalError: getTechnicalError(error),
      transient: error.transient,
    };
  }

  const { names, codes, searchable } = getErrorSignals(error);

  if (names.includes('RenderRevisionTemplateError')) {
    return classification('TEMPLATE_VALIDATION_FAILED', error);
  }

  if (codes.includes('TEMPLATE_NOT_FOUND') || codes.includes('TEMPLATE_VERSION_MISMATCH')) {
    return classification('TEMPLATE_NOT_FOUND', error);
  }

  if (
    codes.some((code) => code.startsWith('PROJECT_DOCUMENT_')) ||
    codes.includes('PROJECT_VALIDATION_FAILED') ||
    codes.includes('RENDER_REVISION_INVALID') ||
    codes.includes('RENDER_REVISION_NOT_FOUND')
  ) {
    return classification('PROJECT_SCHEMA_INVALID', error);
  }

  if (codes.includes('RENDER_REVISION_ASSET_INVALID')) {
    return classification('ASSET_METADATA_MISSING', error);
  }

  if (names.includes('CompositionMetadataMismatchError')) {
    return classification('COMPOSITION_SELECT_FAILED', error);
  }

  if (codes.includes('ENOSPC') || searchable.includes('no space left on device')) {
    return classification('STORAGE_FULL', error);
  }

  if (
    codes.includes('EBUSY') ||
    codes.includes('ETXTBSY') ||
    searchable.includes('resource busy') ||
    searchable.includes('file is locked')
  ) {
    return classification('UNKNOWN_RENDER_ERROR', error, true);
  }

  if (
    searchable.includes('target closed') ||
    searchable.includes('browser has disconnected') ||
    searchable.includes('browser disconnected') ||
    searchable.includes('page crashed') ||
    searchable.includes('session closed') ||
    searchable.includes('protocol error')
  ) {
    return classification('BROWSER_CRASHED', error, true);
  }

  if (searchable.includes('timed out') || searchable.includes('timeout')) {
    return classification('RENDER_TIMEOUT', error);
  }

  if (searchable.includes('got cancelled') || codes.includes('RENDER_CANCELLED')) {
    return classification('RENDER_CANCELLED', error);
  }

  if (searchable.includes('ffmpeg') || searchable.includes('encoder')) {
    return classification('FFMPEG_FAILED', error);
  }

  return classification('UNKNOWN_RENDER_ERROR', error);
}

export function getAutomaticRetryDelayMs(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt <= 0) {
    throw new RangeError('Render attempt must be a positive safe integer.');
  }

  return Math.min(30_000, 1_000 * 2 ** (attempt - 1));
}
