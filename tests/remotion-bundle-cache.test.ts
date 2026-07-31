import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BUNDLE_CACHE_MANIFEST_FILE,
  PersistentRemotionBundleCache,
  computeRemotionBundleKey,
} from '../apps/worker/src/bundle-cache.js';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createKeyWorkspace(): string {
  const workspaceRoot = createTemporaryDirectory('hansys-bundle-key-');
  const files: Record<string, string> = {
    'packages/video/src/index.ts': 'registerRoot(Root);',
    'packages/project-schema/src/index.ts': 'export const schemaVersion = 1;',
    'packages/template-registry/src/templates/news-clean-v1.ts':
      "export const template = 'news-clean-v1';",
    'packages/video/remotion.config.ts': "export const bundler = 'webpack';",
    'pnpm-lock.yaml': 'lockfileVersion: 9.0\n',
  };

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(workspaceRoot, relativePath);
    mkdirSync(join(filePath, '..'), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return workspaceRoot;
}

async function computeKey(workspaceRoot: string): Promise<string> {
  return computeRemotionBundleKey({
    workspaceRoot,
    remotionVersion: '4.0.499',
    buildMode: 'production',
  });
}

function writeSuccessfulBundle(outputDirectory: string, contents = 'bundle'): void {
  writeFileSync(join(outputDirectory, 'index.html'), `<html>${contents}</html>`);
  writeFileSync(join(outputDirectory, 'bundle.js'), contents);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Remotion bundle cache key', () => {
  it('changes when template source changes', async () => {
    const workspaceRoot = createKeyWorkspace();
    const originalKey = await computeKey(workspaceRoot);
    writeFileSync(
      join(workspaceRoot, 'packages/template-registry/src/templates/news-clean-v1.ts'),
      "export const template = 'news-clean-v2';",
    );

    await expect(computeKey(workspaceRoot)).resolves.not.toBe(originalKey);
  });

  it('changes when pnpm-lock.yaml changes', async () => {
    const workspaceRoot = createKeyWorkspace();
    const originalKey = await computeKey(workspaceRoot);
    writeFileSync(join(workspaceRoot, 'pnpm-lock.yaml'), 'lockfileVersion: 9.1\n');

    await expect(computeKey(workspaceRoot)).resolves.not.toBe(originalKey);
  });

  it('is stable for unchanged sources and build settings', async () => {
    const workspaceRoot = createKeyWorkspace();

    await expect(computeKey(workspaceRoot)).resolves.toBe(await computeKey(workspaceRoot));
  });
});

describe('persistent Remotion bundle cache', () => {
  it('reuses one persistent bundle for different project props', async () => {
    const workspaceRoot = createKeyWorkspace();
    const cacheDirectory = createTemporaryDirectory('hansys-bundle-cache-');
    const bundleKey = await computeKey(workspaceRoot);
    const buildBundle = vi.fn(async (outputDirectory: string) => {
      writeSuccessfulBundle(outputDirectory);
    });
    const firstCache = new PersistentRemotionBundleCache({ cacheDirectory, buildBundle });
    const getBundleForProject = async (
      cache: PersistentRemotionBundleCache,
      projectProps: { title: string },
    ) => {
      expect(projectProps.title).toBeTruthy();
      return cache.getOrCreate(bundleKey);
    };

    const firstServeUrl = await getBundleForProject(firstCache, { title: 'Project A' });
    const unexpectedRebuild = vi.fn(async () => undefined);
    const restartedCache = new PersistentRemotionBundleCache({
      cacheDirectory,
      buildBundle: unexpectedRebuild,
    });
    const secondServeUrl = await getBundleForProject(restartedCache, { title: 'Project B' });

    expect(secondServeUrl).toBe(firstServeUrl);
    expect(buildBundle).toHaveBeenCalledOnce();
    expect(unexpectedRebuild).not.toHaveBeenCalled();
    expect(existsSync(join(firstServeUrl, BUNDLE_CACHE_MANIFEST_FILE))).toBe(true);
  });

  it('allows concurrent cache instances to build a missing key only once', async () => {
    const workspaceRoot = createKeyWorkspace();
    const cacheDirectory = createTemporaryDirectory('hansys-bundle-cache-');
    const bundleKey = await computeKey(workspaceRoot);
    const buildBundle = vi.fn(async (outputDirectory: string) => {
      await new Promise<void>((resolveBuild) => setTimeout(resolveBuild, 25));
      writeSuccessfulBundle(outputDirectory);
    });
    const firstCache = new PersistentRemotionBundleCache({
      cacheDirectory,
      buildBundle,
      lockPollIntervalMs: 5,
    });
    const secondCache = new PersistentRemotionBundleCache({
      cacheDirectory,
      buildBundle,
      lockPollIntervalMs: 5,
    });

    const [firstServeUrl, secondServeUrl] = await Promise.all([
      firstCache.getOrCreate(bundleKey),
      secondCache.getOrCreate(bundleKey),
    ]);

    expect(secondServeUrl).toBe(firstServeUrl);
    expect(buildBundle).toHaveBeenCalledOnce();
    expect(readdirSync(cacheDirectory)).toEqual([bundleKey]);
  });

  it('does not publish a failed build and permits a later retry', async () => {
    const workspaceRoot = createKeyWorkspace();
    const cacheDirectory = createTemporaryDirectory('hansys-bundle-cache-');
    const bundleKey = await computeKey(workspaceRoot);
    const failedCache = new PersistentRemotionBundleCache({
      cacheDirectory,
      buildBundle: async (outputDirectory) => {
        writeSuccessfulBundle(outputDirectory, 'partial');
        throw new Error('webpack failed');
      },
    });

    await expect(failedCache.getOrCreate(bundleKey)).rejects.toThrowError('webpack failed');
    expect(existsSync(join(cacheDirectory, bundleKey))).toBe(false);
    expect(readdirSync(cacheDirectory)).toEqual([]);

    const successfulBuild = vi.fn(async (outputDirectory: string) => {
      writeSuccessfulBundle(outputDirectory, 'complete');
    });
    const retryCache = new PersistentRemotionBundleCache({
      cacheDirectory,
      buildBundle: successfulBuild,
    });

    await expect(retryCache.getOrCreate(bundleKey)).resolves.toBe(join(cacheDirectory, bundleKey));
    expect(successfulBuild).toHaveBeenCalledOnce();
  });

  it('replaces an incomplete final directory instead of serving it', async () => {
    const workspaceRoot = createKeyWorkspace();
    const cacheDirectory = createTemporaryDirectory('hansys-bundle-cache-');
    const bundleKey = await computeKey(workspaceRoot);
    const incompleteDirectory = join(cacheDirectory, bundleKey);
    mkdirSync(incompleteDirectory);
    writeFileSync(join(incompleteDirectory, 'index.html'), '<html>partial</html>');
    const buildBundle = vi.fn(async (outputDirectory: string) => {
      writeSuccessfulBundle(outputDirectory, 'complete');
    });
    const cache = new PersistentRemotionBundleCache({ cacheDirectory, buildBundle });

    await expect(cache.getOrCreate(bundleKey)).resolves.toBe(incompleteDirectory);
    expect(buildBundle).toHaveBeenCalledOnce();
    expect(existsSync(join(incompleteDirectory, BUNDLE_CACHE_MANIFEST_FILE))).toBe(true);
  });

  it('recovers a stale build lock left by a terminated worker', async () => {
    const workspaceRoot = createKeyWorkspace();
    const cacheDirectory = createTemporaryDirectory('hansys-bundle-cache-');
    const bundleKey = await computeKey(workspaceRoot);
    const lockPath = join(cacheDirectory, `${bundleKey}.lock`);
    writeFileSync(lockPath, 'terminated-worker-token\n');
    const staleTime = new Date(Date.now() - 60_000);
    utimesSync(lockPath, staleTime, staleTime);
    const buildBundle = vi.fn(async (outputDirectory: string) => {
      writeSuccessfulBundle(outputDirectory);
    });
    const cache = new PersistentRemotionBundleCache({
      cacheDirectory,
      buildBundle,
      lockPollIntervalMs: 1,
      lockStaleAfterMs: 10,
    });

    await expect(cache.getOrCreate(bundleKey)).resolves.toBe(join(cacheDirectory, bundleKey));
    expect(buildBundle).toHaveBeenCalledOnce();
    expect(readdirSync(cacheDirectory)).toEqual([bundleKey]);
  });

  it('rejects unsafe cache keys before writing to disk', async () => {
    const cacheDirectory = createTemporaryDirectory('hansys-bundle-cache-');
    const cache = new PersistentRemotionBundleCache({
      cacheDirectory,
      buildBundle: vi.fn(),
    });

    await expect(cache.getOrCreate('../outside')).rejects.toThrowError(RangeError);
    expect(readdirSync(cacheDirectory)).toEqual([]);
  });
});
