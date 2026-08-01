import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  STORAGE_DIRECTORY_NAMES,
  StoragePathError,
  createRenderJobAttemptPaths,
  createRenderJobOutputPaths,
  finalizeRenderJobAttempt,
  initializeRenderJobAttempt,
  initializeStorage,
  removeRenderJobTempDirectory,
  removeRenderJobOutputs,
  safeJoin,
  type StorageInitializationError,
} from '../packages/storage/src/index.js';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'hansys-storage-'));
  temporaryDirectories.push(directory);

  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('safeJoin', () => {
  it('resolves nested relative paths inside the configured root', () => {
    const root = createTemporaryDirectory();

    expect(safeJoin(root, 'assets', 'project-id', 'file.png')).toBe(
      resolve(root, 'assets', 'project-id', 'file.png'),
    );
    expect(safeJoin(root, 'assets/project-id/file.png')).toBe(
      resolve(root, 'assets', 'project-id', 'file.png'),
    );
    expect(safeJoin(root, 'assets\\project-id\\file.png')).toBe(
      resolve(root, 'assets', 'project-id', 'file.png'),
    );
  });

  it.each([
    '../outside',
    '..\\outside',
    'assets/../../outside',
    'assets\\..\\outside',
    '/absolute/path',
    'C:\\absolute\\path',
    'C:drive-relative',
    '\\\\server\\share',
    'assets/./file.png',
    'assets/file.png:stream',
    'assets/\0file.png',
  ])('rejects unsafe path %s', (unsafePath) => {
    const root = createTemporaryDirectory();

    expect(() => safeJoin(root, unsafePath)).toThrowError(StoragePathError);
  });
});

describe('storage bootstrap', () => {
  it('creates every directory idempotently and leaves no write probes', async () => {
    const parent = createTemporaryDirectory();
    const dataDirectory = join(parent, 'data');

    expect(existsSync(dataDirectory)).toBe(false);

    const firstPaths = await initializeStorage(dataDirectory);
    const secondPaths = await initializeStorage(dataDirectory);

    expect(secondPaths).toEqual(firstPaths);

    for (const directoryName of Object.values(STORAGE_DIRECTORY_NAMES)) {
      const directory = join(dataDirectory, directoryName);

      expect(statSync(directory).isDirectory()).toBe(true);
      expect(
        readdirSync(directory).some((entry) => entry.startsWith('.storage-write-check-')),
      ).toBe(false);
    }
  });

  it('returns a clear startup error when the storage root cannot be created', async () => {
    const parent = createTemporaryDirectory();
    const filePath = join(parent, 'not-a-directory');
    writeFileSync(filePath, 'occupied');

    await expect(initializeStorage(filePath)).rejects.toMatchObject({
      name: 'StorageInitializationError',
      code: 'STORAGE_NOT_WRITABLE',
      directory: resolve(filePath),
    } satisfies Partial<StorageInitializationError>);
  });
});

describe('render attempt cleanup', () => {
  it('initializes a clean UUID-scoped H.264 output path', async () => {
    const parent = createTemporaryDirectory();
    const paths = await initializeStorage(join(parent, 'data'));
    const renderJobId = '11111111-1111-4111-8111-111111111111';
    const expectedDirectory = join(paths.temp, renderJobId);
    const staleOutput = join(expectedDirectory, 'video.mp4');
    mkdirSync(expectedDirectory, { recursive: true });
    writeFileSync(staleOutput, 'partial');

    const attemptPaths = await initializeRenderJobAttempt(paths, renderJobId);

    expect(attemptPaths).toEqual({
      directory: expectedDirectory,
      video: staleOutput,
      thumbnail: join(expectedDirectory, 'thumbnail.jpg'),
    });
    expect(statSync(attemptPaths.directory).isDirectory()).toBe(true);
    expect(existsSync(staleOutput)).toBe(false);
  });

  it('atomically promotes video and thumbnail into their final locations', async () => {
    const parent = createTemporaryDirectory();
    const paths = await initializeStorage(join(parent, 'data'));
    const renderJobId = '11111111-1111-4111-8111-111111111111';
    const attempt = await initializeRenderJobAttempt(paths, renderJobId);
    writeFileSync(attempt.video, 'video');
    writeFileSync(attempt.thumbnail, 'thumbnail');

    const outputs = await finalizeRenderJobAttempt(paths, renderJobId);

    expect(outputs).toEqual(createRenderJobOutputPaths(paths, renderJobId));
    expect(existsSync(outputs.video)).toBe(true);
    expect(existsSync(outputs.thumbnail)).toBe(true);
    expect(existsSync(attempt.video)).toBe(false);
    expect(existsSync(attempt.thumbnail)).toBe(false);

    await removeRenderJobOutputs(paths, renderJobId);
    expect(existsSync(outputs.directory)).toBe(false);
    expect(existsSync(outputs.thumbnail)).toBe(false);
  });

  it('rejects unsafe attempt paths before touching storage', async () => {
    const parent = createTemporaryDirectory();
    const paths = await initializeStorage(join(parent, 'data'));

    expect(() => createRenderJobAttemptPaths(paths, '../outside')).toThrowError(StoragePathError);
    await expect(initializeRenderJobAttempt(paths, '../outside')).rejects.toBeInstanceOf(
      StoragePathError,
    );
  });

  it('removes only the UUID-scoped temporary directory and is idempotent', async () => {
    const parent = createTemporaryDirectory();
    const paths = await initializeStorage(join(parent, 'data'));
    const renderJobId = '11111111-1111-4111-8111-111111111111';
    const attemptDirectory = join(paths.temp, renderJobId);
    const siblingDirectory = join(paths.temp, 'keep');
    mkdirSync(attemptDirectory, { recursive: true });
    mkdirSync(siblingDirectory, { recursive: true });
    writeFileSync(join(attemptDirectory, 'partial.mp4'), 'partial');

    await removeRenderJobTempDirectory(paths, renderJobId);
    await removeRenderJobTempDirectory(paths, renderJobId);

    expect(existsSync(attemptDirectory)).toBe(false);
    expect(existsSync(siblingDirectory)).toBe(true);
  });

  it('rejects an unsafe render job ID before touching storage', async () => {
    const parent = createTemporaryDirectory();
    const paths = await initializeStorage(join(parent, 'data'));
    const outsidePath = join(paths.root, 'outside.txt');
    writeFileSync(outsidePath, 'keep');

    await expect(removeRenderJobTempDirectory(paths, '../outside')).rejects.toBeInstanceOf(
      StoragePathError,
    );
    expect(existsSync(outsidePath)).toBe(true);
  });
});
