import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupStorage,
  initializeStorage,
  type StoragePaths,
} from '../packages/storage/src/index.js';

const DAY_MS = 24 * 60 * 60_000;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createFile(path: string, modifiedAt: Date, contents = 'fixture'): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, contents, 'utf8');
  await utimes(path, modifiedAt, modifiedAt);
}

async function setupStorage(): Promise<{ paths: StoragePaths; now: Date; old: Date }> {
  const parent = await mkdtemp(join(tmpdir(), 'hansys-retention-'));
  temporaryDirectories.push(parent);
  const paths = await initializeStorage(join(parent, 'data'));
  const now = new Date('2026-08-01T08:00:00.000Z');
  const old = new Date(now.getTime() - 8 * DAY_MS);

  await createFile(join(paths.assets, 'referenced-asset.bin'), old, 'keep me');
  await createFile(join(paths.temp, 'old-job', 'video.mp4'), old);
  await createFile(join(paths.temp, 'active-job', 'video.mp4'), old);
  await createFile(join(paths.temp, 'recent-job', 'video.mp4'), new Date(now.getTime() - DAY_MS));
  await createFile(join(paths.logs, 'old-job', 'attempt-1.jsonl'), old);
  await createFile(
    join(paths.logs, 'recent-job', 'attempt-1.jsonl'),
    new Date(now.getTime() - DAY_MS),
  );
  await createFile(join(paths.bundles, 'old-bundle', 'index.html'), old);
  await createFile(join(paths.bundles, 'old-bundle', '.hansys-bundle-cache.json'), old);
  await createFile(join(paths.bundles, 'old-bundle.lock'), new Date(now.getTime() - 20 * 60_000));
  await createFile(join(paths.renders, 'old-job', 'video.mp4'), old);
  await createFile(join(paths.renders, 'protected-job', 'video.mp4'), old);
  await createFile(join(paths.thumbnails, 'old-job.jpg'), old);

  return { paths, now, old };
}

describe('storage retention cleanup', () => {
  it('supports a dry run and never scans or deletes assets', async () => {
    const { paths, now } = await setupStorage();

    const result = await cleanupStorage({
      paths,
      retentionDays: 7,
      now,
      dryRun: true,
      protectedTempJobIds: ['active-job'],
      protectedRelativePaths: ['renders/protected-job/video.mp4'],
    });

    expect(result.dryRun).toBe(true);
    expect(result.deleted).toHaveLength(0);
    expect(result.candidates.map(({ relativePath }) => relativePath)).toEqual(
      expect.arrayContaining([
        'temp/old-job/video.mp4',
        'logs/old-job/attempt-1.jsonl',
        'bundles/old-bundle/index.html',
        'bundles/old-bundle/.hansys-bundle-cache.json',
        'bundles/old-bundle.lock',
        'renders/old-job/video.mp4',
        'thumbnails/old-job.jpg',
      ]),
    );
    expect(result.candidates.map(({ relativePath }) => relativePath)).not.toContain(
      'temp/active-job/video.mp4',
    );
    expect(result.candidates.map(({ relativePath }) => relativePath)).not.toContain(
      'renders/protected-job/video.mp4',
    );
    expect(existsSync(join(paths.assets, 'referenced-asset.bin'))).toBe(true);
  });

  it('deletes expired temp, log, bundle and output files while retaining recent and protected data', async () => {
    const { paths, now } = await setupStorage();

    const result = await cleanupStorage({
      paths,
      retentionDays: 7,
      now,
      protectedTempJobIds: ['active-job'],
      protectedRelativePaths: ['renders/protected-job/video.mp4'],
    });

    expect(result.deleted.length).toBeGreaterThan(0);
    expect(result.failures).toHaveLength(0);
    expect(existsSync(join(paths.assets, 'referenced-asset.bin'))).toBe(true);
    expect(existsSync(join(paths.temp, 'old-job'))).toBe(false);
    expect(existsSync(join(paths.temp, 'active-job', 'video.mp4'))).toBe(true);
    expect(existsSync(join(paths.temp, 'recent-job', 'video.mp4'))).toBe(true);
    expect(existsSync(join(paths.logs, 'old-job'))).toBe(false);
    expect(existsSync(join(paths.logs, 'recent-job', 'attempt-1.jsonl'))).toBe(true);
    expect(existsSync(join(paths.bundles, 'old-bundle'))).toBe(false);
    expect(existsSync(join(paths.bundles, 'old-bundle.lock'))).toBe(false);
    expect(existsSync(join(paths.renders, 'old-job'))).toBe(false);
    expect(existsSync(join(paths.renders, 'protected-job', 'video.mp4'))).toBe(true);
    expect(existsSync(join(paths.thumbnails, 'old-job.jpg'))).toBe(false);
    await expect(readFile(join(paths.temp, 'recent-job', 'video.mp4'), 'utf8')).resolves.toBe(
      'fixture',
    );
  });
});
