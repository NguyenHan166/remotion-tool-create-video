import { lstat, readdir, rm } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { relative, sep } from 'node:path';
import {
  STORAGE_DIRECTORY_NAMES,
  safeJoin,
  type StorageDirectoryKey,
  type StoragePaths,
} from './storage.js';

export const DEFAULT_STORAGE_RETENTION_DAYS = 30;
export const DEFAULT_STORAGE_CLEANUP_INTERVAL_MS = 6 * 60 * 60_000;
export const DEFAULT_BUNDLE_LOCK_RETENTION_MS = 10 * 60_000;

export type StorageCleanupCategory = 'temp' | 'logs' | 'bundles' | 'outputs';

export type StorageCleanupCandidate = Readonly<{
  category: StorageCleanupCategory;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}>;

export type StorageCleanupFailure = Readonly<{
  candidate: StorageCleanupCandidate;
  message: string;
}>;

export type StorageCleanupResult = Readonly<{
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  scannedFiles: number;
  candidates: readonly StorageCleanupCandidate[];
  deleted: readonly StorageCleanupCandidate[];
  deletedBytes: number;
  failures: readonly StorageCleanupFailure[];
}>;

export type StorageCleanupOptions = Readonly<{
  paths: StoragePaths;
  retentionDays?: number;
  now?: Date;
  dryRun?: boolean;
  protectedRelativePaths?: Iterable<string>;
  protectedTempJobIds?: Iterable<string>;
  protectedBundleKeys?: Iterable<string>;
  bundleLockRetentionMs?: number;
}>;

type CleanupTarget = Readonly<{
  category: StorageCleanupCategory;
  directoryKey: StorageDirectoryKey;
  relativeRoot: string;
}>;

type DiscoveredFile = Readonly<{
  category: StorageCleanupCategory;
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: Date;
}>;

const CLEANUP_TARGETS: readonly CleanupTarget[] = [
  { category: 'temp', directoryKey: 'temp', relativeRoot: STORAGE_DIRECTORY_NAMES.temp },
  { category: 'logs', directoryKey: 'logs', relativeRoot: STORAGE_DIRECTORY_NAMES.logs },
  { category: 'bundles', directoryKey: 'bundles', relativeRoot: STORAGE_DIRECTORY_NAMES.bundles },
  { category: 'outputs', directoryKey: 'renders', relativeRoot: STORAGE_DIRECTORY_NAMES.renders },
  {
    category: 'outputs',
    directoryKey: 'thumbnails',
    relativeRoot: STORAGE_DIRECTORY_NAMES.thumbnails,
  },
];

function assertRetentionDays(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Storage retention days must be a non-negative safe integer.');
  }
}

function assertValidDate(value: Date, name: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError(`${name} must be a valid date.`);
  }
}

function assertDuration(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function toPortablePath(value: string): string {
  return value.split(sep).join('/');
}

function toPublicCandidate(file: DiscoveredFile): StorageCleanupCandidate {
  return {
    category: file.category,
    relativePath: file.relativePath,
    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt.toISOString(),
  };
}

function normalizeProtectedPath(paths: StoragePaths, value: string): string {
  const absolutePath = safeJoin(paths.root, value);
  const normalized = toPortablePath(relative(paths.root, absolutePath));

  if (
    normalized.length === 0 ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    throw new RangeError(`Protected storage path must stay within the data directory: ${value}`);
  }

  return normalized;
}

function isPathProtected(
  file: Pick<DiscoveredFile, 'category' | 'relativePath'>,
  protectedPaths: readonly string[],
  protectedTempJobIds: ReadonlySet<string>,
  protectedBundleKeys: ReadonlySet<string>,
): boolean {
  if (
    protectedPaths.some(
      (protectedPath) =>
        file.relativePath === protectedPath || file.relativePath.startsWith(`${protectedPath}/`),
    )
  ) {
    return true;
  }

  if (file.category === 'temp') {
    return [...protectedTempJobIds].some(
      (jobId) =>
        file.relativePath === `${STORAGE_DIRECTORY_NAMES.temp}/${jobId}` ||
        file.relativePath.startsWith(`${STORAGE_DIRECTORY_NAMES.temp}/${jobId}/`),
    );
  }

  if (file.category === 'bundles') {
    return [...protectedBundleKeys].some(
      (bundleKey) =>
        file.relativePath === `${STORAGE_DIRECTORY_NAMES.bundles}/${bundleKey}` ||
        file.relativePath.startsWith(`${STORAGE_DIRECTORY_NAMES.bundles}/${bundleKey}/`),
    );
  }

  return false;
}

async function discoverFiles(
  directory: string,
  relativeDirectory: string,
  category: StorageCleanupCategory,
  protectedPaths: readonly string[],
  protectedTempJobIds: ReadonlySet<string>,
  protectedBundleKeys: ReadonlySet<string>,
  scanned: { value: number },
): Promise<DiscoveredFile[]> {
  let entries: Dirent<string>[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }

  const files: DiscoveredFile[] = [];

  for (const entry of entries) {
    const childRelativePath = `${relativeDirectory}/${entry.name}`;
    const childAbsolutePath = safeJoin(directory, entry.name);

    if (
      isPathProtected(
        { category, relativePath: childRelativePath },
        protectedPaths,
        protectedTempJobIds,
        protectedBundleKeys,
      )
    ) {
      continue;
    }

    const childStat = await lstat(childAbsolutePath);

    if (childStat.isDirectory()) {
      files.push(
        ...(await discoverFiles(
          childAbsolutePath,
          childRelativePath,
          category,
          protectedPaths,
          protectedTempJobIds,
          protectedBundleKeys,
          scanned,
        )),
      );
      continue;
    }

    if (!childStat.isFile() && !childStat.isSymbolicLink()) {
      continue;
    }

    scanned.value += 1;
    files.push({
      category,
      absolutePath: childAbsolutePath,
      relativePath: childRelativePath,
      sizeBytes: childStat.isFile() ? childStat.size : 0,
      modifiedAt: childStat.mtime,
    });
  }

  return files;
}

async function removeEmptyDirectories(
  directory: string,
  relativeDirectory: string,
  protectedPaths: readonly string[],
  protectedTempJobIds: ReadonlySet<string>,
  protectedBundleKeys: ReadonlySet<string>,
  removeCurrent = false,
): Promise<void> {
  let entries: Dirent<string>[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childRelativePath = `${relativeDirectory}/${entry.name}`;

    if (
      isPathProtected(
        { category: 'temp', relativePath: childRelativePath },
        protectedPaths,
        protectedTempJobIds,
        protectedBundleKeys,
      ) ||
      isPathProtected(
        { category: 'logs', relativePath: childRelativePath },
        protectedPaths,
        protectedTempJobIds,
        protectedBundleKeys,
      ) ||
      isPathProtected(
        { category: 'bundles', relativePath: childRelativePath },
        protectedPaths,
        protectedTempJobIds,
        protectedBundleKeys,
      ) ||
      isPathProtected(
        { category: 'outputs', relativePath: childRelativePath },
        protectedPaths,
        protectedTempJobIds,
        protectedBundleKeys,
      )
    ) {
      continue;
    }

    await removeEmptyDirectories(
      safeJoin(directory, entry.name),
      childRelativePath,
      protectedPaths,
      protectedTempJobIds,
      protectedBundleKeys,
      true,
    );
  }

  try {
    if (removeCurrent && (await readdir(directory)).length === 0) {
      await rm(directory, { force: true, recursive: true });
    }
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
}

function isEligible(file: DiscoveredFile, cutoffMs: number, bundleLockCutoffMs: number): boolean {
  const effectiveCutoffMs =
    file.category === 'bundles' && file.relativePath.endsWith('.lock')
      ? bundleLockCutoffMs
      : cutoffMs;

  return file.modifiedAt.getTime() <= effectiveCutoffMs;
}

export async function cleanupStorage({
  paths,
  retentionDays = DEFAULT_STORAGE_RETENTION_DAYS,
  now = new Date(),
  dryRun = false,
  protectedRelativePaths = [],
  protectedTempJobIds = [],
  protectedBundleKeys = [],
  bundleLockRetentionMs = DEFAULT_BUNDLE_LOCK_RETENTION_MS,
}: StorageCleanupOptions): Promise<StorageCleanupResult> {
  assertRetentionDays(retentionDays);
  assertValidDate(now, 'Cleanup time');
  assertDuration(bundleLockRetentionMs, 'Bundle lock retention');

  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60_000;
  const bundleLockCutoffMs = now.getTime() - bundleLockRetentionMs;

  if (!Number.isFinite(cutoffMs) || !Number.isFinite(bundleLockCutoffMs)) {
    throw new RangeError('Storage cleanup cutoff must be a finite timestamp.');
  }

  const normalizedProtectedPaths = [...protectedRelativePaths].map((value) =>
    normalizeProtectedPath(paths, value),
  );
  const normalizedTempJobIds = new Set(protectedTempJobIds);
  const normalizedBundleKeys = new Set(protectedBundleKeys);
  const scanned = { value: 0 };
  const discovered: DiscoveredFile[] = [];

  for (const target of CLEANUP_TARGETS) {
    discovered.push(
      ...(await discoverFiles(
        paths[target.directoryKey],
        target.relativeRoot,
        target.category,
        normalizedProtectedPaths,
        normalizedTempJobIds,
        normalizedBundleKeys,
        scanned,
      )),
    );
  }

  const candidates = discovered.filter((file) => isEligible(file, cutoffMs, bundleLockCutoffMs));
  const publicCandidates = candidates.map(toPublicCandidate);
  const deleted: StorageCleanupCandidate[] = [];
  const failures: StorageCleanupFailure[] = [];

  if (!dryRun) {
    for (const [index, candidate] of candidates.entries()) {
      const publicCandidate = publicCandidates[index];

      if (publicCandidate === undefined) {
        continue;
      }

      try {
        await rm(candidate.absolutePath, { force: true, recursive: true });
        deleted.push(publicCandidate);
      } catch (error) {
        if (isMissingFileError(error)) {
          continue;
        }

        failures.push({
          candidate: publicCandidate,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const target of CLEANUP_TARGETS) {
      await removeEmptyDirectories(
        paths[target.directoryKey],
        target.relativeRoot,
        normalizedProtectedPaths,
        normalizedTempJobIds,
        normalizedBundleKeys,
      );
    }
  }

  return {
    dryRun,
    retentionDays,
    cutoff: new Date(cutoffMs).toISOString(),
    scannedFiles: scanned.value,
    candidates: publicCandidates,
    deleted,
    deletedBytes: deleted.reduce((total, candidate) => total + candidate.sizeBytes, 0),
    failures,
  };
}
