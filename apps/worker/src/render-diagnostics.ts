import { randomUUID } from 'node:crypto';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRenderDiagnosticOutputPath, safeJoin, type StoragePaths } from '@hansys/storage';
import {
  redactAbsolutePaths,
  sanitizeLogValue,
  type StructuredLogEntry,
} from '@hansys/shared/observability';

const MAX_DIAGNOSTIC_ENTRIES = 1_000;

export type RenderDiagnosticContext = Readonly<{
  renderJobId: string;
  workerId: string;
  attempt: number;
}>;

export type PersistedRenderDiagnostic = Readonly<{
  kind: 'LOG';
  relativePath: string;
  fileName: string;
  mimeType: 'application/x-ndjson';
  sizeBytes: bigint;
  metadata: {
    entryCount: number;
    redacted: true;
  };
}>;

export class RenderDiagnostics {
  readonly #context: RenderDiagnosticContext;
  readonly #now: () => Date;
  readonly #entries: StructuredLogEntry[] = [];
  #droppedEntries = 0;

  constructor(context: RenderDiagnosticContext, now: () => Date = () => new Date()) {
    this.#context = context;
    this.#now = now;
  }

  capture(entry: StructuredLogEntry): void {
    if (this.#entries.length >= MAX_DIAGNOSTIC_ENTRIES) {
      this.#droppedEntries += 1;
      return;
    }

    this.#entries.push(sanitizeLogValue(entry) as StructuredLogEntry);
  }

  captureBrowserLog(log: { text: string; type: string; stackTrace: readonly unknown[] }): void {
    const level = log.type === 'error' || log.type === 'assert' ? 'error' : 'warn';
    this.capture({
      timestamp: this.#now().toISOString(),
      level,
      message: 'remotion.browser_log',
      renderJobId: this.#context.renderJobId,
      workerId: this.#context.workerId,
      attempt: this.#context.attempt,
      browser: sanitizeLogValue({
        type: log.type,
        text: log.text,
        stackTrace: log.stackTrace,
      }),
    });
  }

  captureFailure(error: unknown, details: Record<string, unknown> = {}): void {
    const safeDetails = sanitizeLogValue(details);
    this.capture({
      timestamp: this.#now().toISOString(),
      level: 'error',
      message: 'render.failed',
      renderJobId: this.#context.renderJobId,
      workerId: this.#context.workerId,
      attempt: this.#context.attempt,
      ...(typeof safeDetails === 'object' && safeDetails !== null && !Array.isArray(safeDetails)
        ? safeDetails
        : {}),
      error: sanitizeLogValue(error, 'error'),
    });
  }

  toJsonLines(): string {
    const header = {
      timestamp: this.#now().toISOString(),
      level: 'info',
      message: 'render.diagnostic_started',
      renderJobId: this.#context.renderJobId,
      workerId: this.#context.workerId,
      attempt: this.#context.attempt,
      redacted: true,
    };
    const entries: Array<Record<string, unknown>> = [header, ...this.#entries];

    if (this.#droppedEntries > 0) {
      entries.push({
        timestamp: this.#now().toISOString(),
        level: 'warn',
        message: 'render.diagnostic_entries_dropped',
        renderJobId: this.#context.renderJobId,
        workerId: this.#context.workerId,
        attempt: this.#context.attempt,
        droppedEntries: this.#droppedEntries,
      });
    }

    return `${entries.map((entry) => JSON.stringify(sanitizeLogValue(entry))).join('\n')}\n`;
  }

  get entryCount(): number {
    return this.#entries.length;
  }
}

export async function persistRenderDiagnostics(
  paths: StoragePaths,
  context: RenderDiagnosticContext,
  diagnostics: RenderDiagnostics,
): Promise<PersistedRenderDiagnostic> {
  const outputPath = createRenderDiagnosticOutputPath(paths, context.renderJobId, context.attempt);
  const outputDirectory = dirname(outputPath.absolutePath);
  const temporaryPath = safeJoin(paths.logs, `.render-diagnostic-${randomUUID()}.tmp`);
  const contents = redactAbsolutePaths(diagnostics.toJsonLines());

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, outputPath.absolutePath);

  const file = await stat(outputPath.absolutePath);

  return {
    kind: 'LOG',
    relativePath: outputPath.relativePath,
    fileName: `render-${context.renderJobId.slice(0, 8)}-attempt-${context.attempt}.jsonl`,
    mimeType: 'application/x-ndjson',
    sizeBytes: BigInt(file.size),
    metadata: {
      entryCount: diagnostics.entryCount,
      redacted: true,
    },
  };
}
