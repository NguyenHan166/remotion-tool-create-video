import { constants } from 'node:fs';
import { access, mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { randomUUID } from 'node:crypto';

export const STORAGE_DIRECTORY_NAMES = {
  assets: 'assets',
  renders: 'renders',
  thumbnails: 'thumbnails',
  bundles: 'bundles',
  temp: 'temp',
  logs: 'logs',
} as const;

export type StorageDirectoryKey = keyof typeof STORAGE_DIRECTORY_NAMES;

export type StoragePaths = Readonly<
  {
    root: string;
  } & Record<StorageDirectoryKey, string>
>;

export class StoragePathError extends Error {
  readonly code = 'STORAGE_PATH_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'StoragePathError';
  }
}

export class StorageInitializationError extends Error {
  readonly code = 'STORAGE_NOT_WRITABLE';
  readonly directory: string;

  constructor(directory: string, cause: unknown) {
    super(`Storage directory is not writable: ${directory}`, { cause });
    this.name = 'StorageInitializationError';
    this.directory = directory;
  }
}

function assertValidRoot(root: string): void {
  if (root.trim().length === 0) {
    throw new StoragePathError('Storage root must not be empty');
  }

  if (root.includes('\0')) {
    throw new StoragePathError('Storage root must not contain NUL bytes');
  }
}

function getSafeComponents(pathSegment: string): string[] {
  if (pathSegment.includes('\0')) {
    throw new StoragePathError('Storage path must not contain NUL bytes');
  }

  if (isAbsolute(pathSegment) || win32.isAbsolute(pathSegment) || /^[a-zA-Z]:/.test(pathSegment)) {
    throw new StoragePathError(`Absolute storage paths are not allowed: ${pathSegment}`);
  }

  const components = pathSegment.split(/[\\/]+/).filter((component) => component.length > 0);

  for (const component of components) {
    if (component === '..') {
      throw new StoragePathError(`Storage path traversal is not allowed: ${pathSegment}`);
    }

    if (component === '.') {
      throw new StoragePathError(`Non-canonical storage paths are not allowed: ${pathSegment}`);
    }

    if (component.includes(':')) {
      throw new StoragePathError(`Storage path components must not contain colons: ${pathSegment}`);
    }
  }

  return components;
}

export function safeJoin(root: string, ...relativeSegments: string[]): string {
  assertValidRoot(root);

  const resolvedRoot = resolve(root);
  const components = relativeSegments.flatMap(getSafeComponents);
  const candidate = resolve(resolvedRoot, ...components);
  const pathFromRoot = relative(resolvedRoot, candidate);

  if (pathFromRoot === '..' || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new StoragePathError('Resolved storage path escapes the configured root');
  }

  return candidate;
}

export function createStoragePaths(dataDirectory: string): StoragePaths {
  assertValidRoot(dataDirectory);

  const root = resolve(dataDirectory);

  return Object.freeze({
    root,
    assets: safeJoin(root, STORAGE_DIRECTORY_NAMES.assets),
    renders: safeJoin(root, STORAGE_DIRECTORY_NAMES.renders),
    thumbnails: safeJoin(root, STORAGE_DIRECTORY_NAMES.thumbnails),
    bundles: safeJoin(root, STORAGE_DIRECTORY_NAMES.bundles),
    temp: safeJoin(root, STORAGE_DIRECTORY_NAMES.temp),
    logs: safeJoin(root, STORAGE_DIRECTORY_NAMES.logs),
  });
}

async function assertDirectoryWritable(directory: string): Promise<void> {
  const probePath = safeJoin(directory, `.storage-write-check-${process.pid}-${randomUUID()}`);
  let probeFile: Awaited<ReturnType<typeof open>> | undefined;
  let failure: unknown;
  let failed = false;

  try {
    await access(directory, constants.W_OK);
    probeFile = await open(probePath, 'wx');
    await probeFile.writeFile('writable');
  } catch (cause) {
    failure = cause;
    failed = true;
  } finally {
    try {
      await probeFile?.close();
    } catch (cause) {
      if (!failed) {
        failure = cause;
        failed = true;
      }
    }

    try {
      await unlink(probePath);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

      if (code !== 'ENOENT' && !failed) {
        failure = error;
        failed = true;
      }
    }
  }

  if (failed) {
    throw new StorageInitializationError(directory, failure);
  }
}

export async function assertStorageWritable(paths: StoragePaths): Promise<void> {
  await Promise.all(
    [
      paths.root,
      ...Object.keys(STORAGE_DIRECTORY_NAMES).map((key) => paths[key as StorageDirectoryKey]),
    ].map(assertDirectoryWritable),
  );
}

export async function initializeStorage(dataDirectory: string): Promise<StoragePaths> {
  const paths = createStoragePaths(dataDirectory);

  try {
    await mkdir(paths.root, { recursive: true });
    await Promise.all(
      Object.keys(STORAGE_DIRECTORY_NAMES).map((key) =>
        mkdir(paths[key as StorageDirectoryKey], { recursive: true }),
      ),
    );
  } catch (cause) {
    throw new StorageInitializationError(paths.root, cause);
  }

  await assertStorageWritable(paths);

  return paths;
}
