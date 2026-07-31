import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkerAssetServer } from '../apps/worker/src/asset-server.js';
import { createStoragePaths } from '../packages/storage/src/index.js';

const temporaryDirectories: string[] = [];

function createAssetFixture() {
  const root = mkdtempSync(join(tmpdir(), 'hansys-worker-assets-'));
  temporaryDirectories.push(root);
  const paths = createStoragePaths(root);
  mkdirSync(paths.assets, { recursive: true });
  const assetId = '11111111-1111-4111-8111-111111111111';
  const relativePath = `assets/${assetId}.mp4`;
  writeFileSync(join(paths.assets, `${assetId}.mp4`), Buffer.from('0123456789'));

  return { paths, assetId, relativePath };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('worker asset server', () => {
  it('serves only revision-approved assets from a token-scoped loopback URL', async () => {
    const { paths, assetId, relativePath } = createAssetFixture();
    const scope = await new WorkerAssetServer(paths).createScope([
      { id: assetId, relativePath, mimeType: 'video/mp4' },
    ]);

    try {
      const sourceUrl = scope.sourceUrl(assetId);
      const response = await fetch(sourceUrl);

      expect(new URL(sourceUrl).hostname).toBe('127.0.0.1');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('video/mp4');
      await expect(response.text()).resolves.toBe('0123456789');
      expect(() => scope.sourceUrl('22222222-2222-4222-8222-222222222222')).toThrowError(
        RangeError,
      );

      const tamperedUrl = new URL(sourceUrl);
      tamperedUrl.pathname = tamperedUrl.pathname.replace(/^[^/]*\/[^/]+/u, '/wrong-token');
      await expect(fetch(tamperedUrl).then(({ status }) => status)).resolves.toBe(404);
    } finally {
      await scope.close();
    }
  });

  it('supports byte ranges required by browser media playback', async () => {
    const { paths, assetId, relativePath } = createAssetFixture();
    const scope = await new WorkerAssetServer(paths).createScope([
      { id: assetId, relativePath, mimeType: 'video/mp4' },
    ]);

    try {
      const response = await fetch(scope.sourceUrl(assetId), {
        headers: {
          Range: 'bytes=2-5',
        },
      });

      expect(response.status).toBe(206);
      expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
      expect(response.headers.get('content-length')).toBe('4');
      await expect(response.text()).resolves.toBe('2345');
    } finally {
      await scope.close();
    }
  });
});
