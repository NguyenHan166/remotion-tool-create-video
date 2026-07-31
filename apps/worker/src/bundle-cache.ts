import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export const BUNDLE_CACHE_MANIFEST_FILE = '.hansys-bundle-cache.json';
export const BUNDLE_CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_BUNDLE_LOCK_POLL_INTERVAL_MS = 100;
export const DEFAULT_BUNDLE_LOCK_STALE_AFTER_MS = 10 * 60_000;

const BUNDLE_KEY_SOURCE_DIRECTORIES = [
  'packages/video/src',
  'packages/project-schema/src',
  'packages/template-registry/src',
] as const;
const BUNDLE_KEY_FILES = ['pnpm-lock.yaml', 'packages/video/remotion.config.ts'] as const;
const BUNDLE_KEY_PATTERN = /^[0-9a-f]{64}$/;

export type RemotionBundleKeyInput = {
  workspaceRoot: string;
  remotionVersion: string;
  buildMode: string;
};

export type PersistentRemotionBundleCacheOptions = {
  cacheDirectory: string;
  buildBundle: (outputDirectory: string) => Promise<void>;
  lockPollIntervalMs?: number;
  lockStaleAfterMs?: number;
};

type BundleCacheManifest = {
  schemaVersion: number;
  bundleKey: string;
  completedAt: string;
};

type BuildLock = {
  token: string;
  stopHeartbeat: () => void;
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertBundleKey(bundleKey: string): void {
  if (!BUNDLE_KEY_PATTERN.test(bundleKey)) {
    throw new RangeError('Bundle key must be a lowercase SHA-256 digest.');
  }
}

function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${name} must not be empty.`);
  }
}

function toPortablePath(path: string): string {
  return path.split(sep).join('/');
}

function updateHashField(hash: ReturnType<typeof createHash>, name: string, value: string): void {
  hash.update(`${name.length}:${name}${value.length}:`);
  hash.update(value);
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  entries.sort(({ name: left }, { name: right }) => (left < right ? -1 : left > right ? 1 : 0));

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
      continue;
    }

    throw new Error(`Unsupported source tree entry: ${entryPath}`);
  }

  return files;
}

async function addFileToHash(
  hash: ReturnType<typeof createHash>,
  workspaceRoot: string,
  filePath: string,
): Promise<void> {
  const relativePath = toPortablePath(relative(workspaceRoot, filePath));
  const contents = await readFile(filePath);
  updateHashField(hash, 'file', relativePath);
  hash.update(`${contents.byteLength}:`);
  hash.update(contents);
}

export async function computeRemotionBundleKey({
  workspaceRoot,
  remotionVersion,
  buildMode,
}: RemotionBundleKeyInput): Promise<string> {
  assertNonEmpty(workspaceRoot, 'Workspace root');
  assertNonEmpty(remotionVersion, 'Remotion version');
  assertNonEmpty(buildMode, 'Bundle build mode');

  const resolvedWorkspaceRoot = resolve(workspaceRoot);
  const hash = createHash('sha256');
  updateHashField(hash, 'cache-schema', String(BUNDLE_CACHE_SCHEMA_VERSION));
  updateHashField(hash, 'remotion-version', remotionVersion);
  updateHashField(hash, 'build-mode', buildMode);

  for (const relativeDirectory of BUNDLE_KEY_SOURCE_DIRECTORIES) {
    const files = await listSourceFiles(resolve(resolvedWorkspaceRoot, relativeDirectory));

    for (const filePath of files) {
      await addFileToHash(hash, resolvedWorkspaceRoot, filePath);
    }
  }

  for (const relativeFile of BUNDLE_KEY_FILES) {
    await addFileToHash(hash, resolvedWorkspaceRoot, resolve(resolvedWorkspaceRoot, relativeFile));
  }

  return hash.digest('hex');
}

function isFileSystemError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveWait) => setTimeout(resolveWait, milliseconds));
}

export class PersistentRemotionBundleCache {
  readonly #cacheDirectory: string;
  readonly #buildBundle: (outputDirectory: string) => Promise<void>;
  readonly #lockPollIntervalMs: number;
  readonly #lockStaleAfterMs: number;

  constructor({
    cacheDirectory,
    buildBundle,
    lockPollIntervalMs = DEFAULT_BUNDLE_LOCK_POLL_INTERVAL_MS,
    lockStaleAfterMs = DEFAULT_BUNDLE_LOCK_STALE_AFTER_MS,
  }: PersistentRemotionBundleCacheOptions) {
    assertNonEmpty(cacheDirectory, 'Bundle cache directory');
    assertPositiveInteger(lockPollIntervalMs, 'Bundle lock poll interval');
    assertPositiveInteger(lockStaleAfterMs, 'Bundle lock stale interval');

    this.#cacheDirectory = resolve(cacheDirectory);
    this.#buildBundle = buildBundle;
    this.#lockPollIntervalMs = lockPollIntervalMs;
    this.#lockStaleAfterMs = lockStaleAfterMs;
  }

  async getOrCreate(bundleKey: string): Promise<string> {
    assertBundleKey(bundleKey);
    await mkdir(this.#cacheDirectory, { recursive: true });
    const finalDirectory = resolve(this.#cacheDirectory, bundleKey);

    for (;;) {
      if (await this.#isComplete(finalDirectory, bundleKey)) {
        return finalDirectory;
      }

      const lock = await this.#tryAcquireLock(bundleKey);

      if (lock === null) {
        await this.#removeStaleLock(bundleKey);
        await wait(this.#lockPollIntervalMs);
        continue;
      }

      try {
        if (await this.#isComplete(finalDirectory, bundleKey)) {
          return finalDirectory;
        }

        await rm(finalDirectory, { force: true, recursive: true });
        return await this.#buildAndPublish(bundleKey, finalDirectory);
      } finally {
        await this.#releaseLock(bundleKey, lock);
      }
    }
  }

  async #buildAndPublish(bundleKey: string, finalDirectory: string): Promise<string> {
    const temporaryDirectory = resolve(
      this.#cacheDirectory,
      `${bundleKey}.tmp-${process.pid}-${randomUUID()}`,
    );
    let published = false;

    try {
      await mkdir(temporaryDirectory, { recursive: false });
      await this.#buildBundle(temporaryDirectory);
      await access(resolve(temporaryDirectory, 'index.html'));
      const manifest: BundleCacheManifest = {
        schemaVersion: BUNDLE_CACHE_SCHEMA_VERSION,
        bundleKey,
        completedAt: new Date().toISOString(),
      };
      await writeFile(
        resolve(temporaryDirectory, BUNDLE_CACHE_MANIFEST_FILE),
        `${JSON.stringify(manifest)}\n`,
        'utf8',
      );
      await rename(temporaryDirectory, finalDirectory);
      published = true;
      return finalDirectory;
    } catch (error) {
      if (await this.#isComplete(finalDirectory, bundleKey)) {
        return finalDirectory;
      }

      throw error;
    } finally {
      if (!published) {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    }
  }

  async #isComplete(directory: string, bundleKey: string): Promise<boolean> {
    try {
      const manifest = JSON.parse(
        await readFile(resolve(directory, BUNDLE_CACHE_MANIFEST_FILE), 'utf8'),
      ) as Partial<BundleCacheManifest>;
      await access(resolve(directory, 'index.html'));

      return (
        manifest.schemaVersion === BUNDLE_CACHE_SCHEMA_VERSION && manifest.bundleKey === bundleKey
      );
    } catch {
      return false;
    }
  }

  async #tryAcquireLock(bundleKey: string): Promise<BuildLock | null> {
    const lockPath = resolve(this.#cacheDirectory, `${bundleKey}.lock`);
    const token = randomUUID();
    let lockFile: Awaited<ReturnType<typeof open>>;

    try {
      lockFile = await open(lockPath, 'wx');
    } catch (error) {
      if (isFileSystemError(error, 'EEXIST')) {
        return null;
      }

      throw error;
    }

    try {
      await lockFile.writeFile(`${token}\n`, 'utf8');
    } catch (error) {
      await lockFile.close();
      await rm(lockPath, { force: true });
      throw error;
    }

    await lockFile.close();
    const heartbeatIntervalMs = Math.max(1, Math.floor(this.#lockStaleAfterMs / 3));
    const heartbeat = setInterval(() => {
      const now = new Date();
      void utimes(lockPath, now, now).catch(() => undefined);
    }, heartbeatIntervalMs);
    heartbeat.unref();

    return {
      token,
      stopHeartbeat: () => clearInterval(heartbeat),
    };
  }

  async #removeStaleLock(bundleKey: string): Promise<void> {
    const lockPath = resolve(this.#cacheDirectory, `${bundleKey}.lock`);

    try {
      const lockStat = await stat(lockPath);

      if (Date.now() - lockStat.mtimeMs < this.#lockStaleAfterMs) {
        return;
      }

      await unlink(lockPath);
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error;
      }
    }
  }

  async #releaseLock(bundleKey: string, lock: BuildLock): Promise<void> {
    lock.stopHeartbeat();
    const lockPath = resolve(this.#cacheDirectory, `${bundleKey}.lock`);

    try {
      const currentToken = (await readFile(lockPath, 'utf8')).trim();

      if (currentToken === lock.token) {
        await unlink(lockPath);
      }
    } catch (error) {
      if (!isFileSystemError(error, 'ENOENT')) {
        throw error;
      }
    }
  }
}
