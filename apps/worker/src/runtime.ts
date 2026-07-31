import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma, PrismaRenderJobRepository } from '@hansys/database';
import { assertStorageWritable, removeRenderJobTempDirectory } from '@hansys/storage';
import { overrideVideoWebpackConfig } from '@hansys/video/bundler-config';
import { bundle } from '@remotion/bundler';
import { PersistentRemotionBundleCache, computeRemotionBundleKey } from './bundle-cache.js';
import { database } from './database.js';
import { checkCommandAvailable, checkRemotionBrowser, runWorkerDoctor } from './doctor.js';
import { workerServerEnvironment } from './environment.js';
import { createPrismaWorkerHeartbeatWriter } from './heartbeat-runtime.js';
import { WorkerLifecycle } from './lifecycle.js';
import { storagePaths } from './storage.js';

const require = createRequire(import.meta.url);
const rendererManifest = require('@remotion/renderer/package.json') as { version: string };
const renderJobRepository = new PrismaRenderJobRepository(database);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export const remotionBundleCache = new PersistentRemotionBundleCache({
  cacheDirectory: storagePaths.bundles,
  buildBundle: async (outputDirectory) => {
    await bundle({
      entryPoint: resolve(workspaceRoot, 'packages/video/src/index.ts'),
      outDir: outputDirectory,
      rootDir: resolve(workspaceRoot, 'packages/video'),
      webpackOverride: overrideVideoWebpackConfig,
    });
  },
});

export async function getOrCreateRemotionBundle(): Promise<{
  bundleKey: string;
  serveUrl: string;
}> {
  const bundleKey = await computeRemotionBundleKey({
    workspaceRoot,
    remotionVersion: rendererManifest.version,
    buildMode: 'production',
  });

  return {
    bundleKey,
    serveUrl: await remotionBundleCache.getOrCreate(bundleKey),
  };
}

export const workerId = `${hostname()}:${process.pid}`;

export const workerLifecycle = new WorkerLifecycle({
  workerId,
  appVersion: workerServerEnvironment.APP_VERSION,
  remotionVersion: rendererManifest.version,
  jobConcurrency: workerServerEnvironment.RENDER_JOB_CONCURRENCY,
  pollIntervalMs: workerServerEnvironment.RENDER_JOB_POLL_MS,
  shutdownTimeoutMs: workerServerEnvironment.WORKER_SHUTDOWN_TIMEOUT_MS,
  runDoctor: () =>
    runWorkerDoctor({
      database: async () => {
        await database.$queryRaw(Prisma.sql`SELECT 1`);
      },
      storage: () => assertStorageWritable(storagePaths),
      ffmpeg: () => checkCommandAvailable('ffmpeg'),
      ffprobe: () => checkCommandAvailable('ffprobe'),
      browser: checkRemotionBrowser,
    }),
  recoverStaleJobs: async () => {
    const staleAfterMs = workerServerEnvironment.RENDER_STALE_AFTER_MINUTES * 60_000;
    const recovery = await renderJobRepository.recoverStale({
      staleBefore: new Date(Date.now() - staleAfterMs),
      cleanupAttempt: (renderJobId) => removeRenderJobTempDirectory(storagePaths, renderJobId),
    });

    if (recovery.retriedJobIds.length > 0 || recovery.failedJobIds.length > 0) {
      console.info('Recovered stale render jobs', recovery);
    }
  },
  staleRecoveryIntervalMs: Math.max(
    60_000,
    Math.floor((workerServerEnvironment.RENDER_STALE_AFTER_MINUTES * 60_000) / 2),
  ),
  claimNext: (claimingWorkerId) => renderJobRepository.claimNext(claimingWorkerId),
  executeJob: async () => {
    throw new Error('Render execution pipeline is not available yet.');
  },
  writeHeartbeat: createPrismaWorkerHeartbeatWriter(database),
  onPollError: (error) => {
    console.error('Worker queue polling failed', error);
  },
  onJobError: async (job, error) => {
    console.error(`Render job ${job.id} failed before execution`, error);
    await renderJobRepository.transitionStatus({
      renderJobId: job.id,
      nextStatus: 'FAILED',
    });
  },
  onHeartbeatError: (error) => {
    console.error('Failed to publish worker heartbeat', error);
  },
  onShutdownTimeout: (jobIds) => {
    console.warn(`Worker shutdown timed out; cancellation requested for: ${jobIds.join(', ')}`);
  },
  cleanup: () => database.$disconnect(),
});
