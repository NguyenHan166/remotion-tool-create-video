import { createRequire } from 'node:module';
import { hostname } from 'node:os';
import { Prisma, PrismaRenderJobRepository } from '@hansys/database';
import { assertStorageWritable } from '@hansys/storage';
import { database } from './database.js';
import { checkCommandAvailable, checkRemotionBrowser, runWorkerDoctor } from './doctor.js';
import { workerServerEnvironment } from './environment.js';
import { createPrismaWorkerHeartbeatWriter } from './heartbeat-runtime.js';
import { WorkerLifecycle } from './lifecycle.js';
import { storagePaths } from './storage.js';

const require = createRequire(import.meta.url);
const rendererManifest = require('@remotion/renderer/package.json') as { version: string };
const renderJobRepository = new PrismaRenderJobRepository(database);

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
