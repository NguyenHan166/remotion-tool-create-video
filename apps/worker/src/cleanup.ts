import {
  cleanupStorage,
  type StorageCleanupOptions,
  type StorageCleanupResult,
  type StoragePaths,
} from '@hansys/storage';
import { createStructuredLogger, type StructuredLogger } from '@hansys/shared/observability';

export const DEFAULT_CLEANUP_RETENTION_DAYS = 30;

export type StorageRetentionServiceOptions = Readonly<{
  paths: StoragePaths;
  retentionDays?: number;
  now?: () => Date;
  bundleLockRetentionMs?: number;
  protectedRelativePaths?: Iterable<string>;
  protectedBundleKeys?: Iterable<string>;
  logger?: StructuredLogger;
}>;

export type StorageRetentionRunOptions = Readonly<{
  dryRun?: boolean;
  protectedTempJobIds?: Iterable<string>;
  protectedRelativePaths?: Iterable<string>;
  protectedBundleKeys?: Iterable<string>;
}>;

export class StorageRetentionService {
  readonly #paths: StoragePaths;
  readonly #retentionDays: number;
  readonly #now: () => Date;
  readonly #bundleLockRetentionMs: number | undefined;
  readonly #protectedRelativePaths: Iterable<string>;
  readonly #protectedBundleKeys: Iterable<string>;
  readonly #logger: StructuredLogger;

  constructor({
    paths,
    retentionDays = DEFAULT_CLEANUP_RETENTION_DAYS,
    now = () => new Date(),
    bundleLockRetentionMs,
    protectedRelativePaths = [],
    protectedBundleKeys = [],
    logger = createStructuredLogger({ context: { service: 'storage-retention' } }),
  }: StorageRetentionServiceOptions) {
    this.#paths = paths;
    this.#retentionDays = retentionDays;
    this.#now = now;
    this.#bundleLockRetentionMs = bundleLockRetentionMs;
    this.#protectedRelativePaths = [...protectedRelativePaths];
    this.#protectedBundleKeys = [...protectedBundleKeys];
    this.#logger = logger;
  }

  async run({
    dryRun = false,
    protectedTempJobIds = [],
    protectedRelativePaths = [],
    protectedBundleKeys = [],
  }: StorageRetentionRunOptions = {}): Promise<StorageCleanupResult> {
    const options: StorageCleanupOptions = {
      paths: this.#paths,
      retentionDays: this.#retentionDays,
      now: this.#now(),
      dryRun,
      protectedRelativePaths: [...this.#protectedRelativePaths, ...protectedRelativePaths],
      protectedTempJobIds,
      protectedBundleKeys: [...this.#protectedBundleKeys, ...protectedBundleKeys],
      ...(this.#bundleLockRetentionMs === undefined
        ? {}
        : { bundleLockRetentionMs: this.#bundleLockRetentionMs }),
    };
    const result = await cleanupStorage(options);

    this.#logger.info('storage.cleanup_completed', {
      dryRun: result.dryRun,
      retentionDays: result.retentionDays,
      scannedFiles: result.scannedFiles,
      candidateCount: result.candidates.length,
      deletedCount: result.deleted.length,
      deletedBytes: result.deletedBytes,
      failureCount: result.failures.length,
    });

    if (result.failures.length > 0) {
      this.#logger.warn('storage.cleanup_partial_failure', {
        failureCount: result.failures.length,
      });
    }

    return result;
  }
}

export async function runStorageCleanup(
  options: StorageRetentionServiceOptions & StorageRetentionRunOptions,
): Promise<StorageCleanupResult> {
  const {
    dryRun,
    protectedTempJobIds,
    protectedRelativePaths,
    protectedBundleKeys,
    ...serviceOptions
  } = options;
  const runOptions: StorageRetentionRunOptions = {
    ...(dryRun === undefined ? {} : { dryRun }),
    ...(protectedTempJobIds === undefined ? {} : { protectedTempJobIds }),
    ...(protectedRelativePaths === undefined ? {} : { protectedRelativePaths }),
    ...(protectedBundleKeys === undefined ? {} : { protectedBundleKeys }),
  };

  return new StorageRetentionService(serviceOptions).run(runOptions);
}
