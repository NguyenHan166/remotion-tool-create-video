import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Prisma,
  PrismaRenderJobRepository,
  PrismaRenderRevisionRepository,
} from '@hansys/database';
import {
  assertStorageWritable,
  finalizeRenderJobAttempt,
  initializeRenderJobAttempt,
  removeRenderJobOutputs,
  removeRenderJobTempDirectory,
  resolveStoredAssetPath,
} from '@hansys/storage';
import { overrideVideoWebpackConfig } from '@hansys/video/bundler-config';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { WorkerAssetServer } from './asset-server.js';
import { PersistentRemotionBundleCache, computeRemotionBundleKey } from './bundle-cache.js';
import { database } from './database.js';
import { checkCommandAvailable, checkRemotionBrowser, runWorkerDoctor } from './doctor.js';
import { workerServerEnvironment } from './environment.js';
import { createPrismaWorkerHeartbeatWriter } from './heartbeat-runtime.js';
import { WorkerLifecycle } from './lifecycle.js';
import {
  RenderCancellationMonitor,
  runRenderAttemptWithCancellation,
} from './render-cancellation.js';
import { selectCompositionFromRevision } from './render-composition.js';
import { RenderPipelineError, classifyRenderFailure } from './render-errors.js';
import { persistRenderFailure } from './render-failure-runtime.js';
import { renderH264Media } from './render-media.js';
import { probeRenderedVideo, renderThumbnail } from './render-finalization.js';
import { storagePaths } from './storage.js';

const require = createRequire(import.meta.url);
const rendererManifest = require('@remotion/renderer/package.json') as { version: string };
const renderJobRepository = new PrismaRenderJobRepository(database);
const renderRevisionRepository = new PrismaRenderRevisionRepository(database);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workerAssetServer = new WorkerAssetServer(storagePaths);

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
  executeJob: async (job, { signal }) => {
    const attemptPaths = await initializeRenderJobAttempt(storagePaths, job.id);
    const remotionCancellation = makeCancelSignal();
    const cancellationMonitor = new RenderCancellationMonitor({
      pollCancellation: () =>
        renderJobRepository.isCancellationRequested({
          renderJobId: job.id,
          workerId,
        }),
      cancelRender: remotionCancellation.cancel,
      externalSignal: signal,
    });
    let prepared: Awaited<ReturnType<typeof selectCompositionFromRevision>> | undefined;
    let completed = false;

    const outcome = await runRenderAttemptWithCancellation({
      monitor: cancellationMonitor,
      execute: async () => {
        prepared = await selectCompositionFromRevision({
          job,
          loadRevision: (revisionId) => renderRevisionRepository.findById(revisionId),
          verifyAsset: async (asset) => {
            let file: Awaited<ReturnType<typeof stat>>;

            try {
              file = await stat(resolveStoredAssetPath(storagePaths, asset.relativePath));
            } catch (cause) {
              throw new RenderPipelineError(
                'ASSET_FILE_MISSING',
                `Render asset ${asset.id} could not be read.`,
                { cause },
              );
            }

            if (!file.isFile() || file.size <= 0) {
              throw new RenderPipelineError(
                'ASSET_FILE_MISSING',
                `Render asset ${asset.id} is missing or empty.`,
              );
            }
          },
          createAssetScope: (assets) => workerAssetServer.createScope(assets),
          getBundle: async () => {
            try {
              return await getOrCreateRemotionBundle();
            } catch (cause) {
              const failure = classifyRenderFailure(cause);

              if (failure.transient || failure.code === 'STORAGE_FULL') {
                throw new RenderPipelineError(failure.code, failure.technicalError, {
                  cause,
                  transient: failure.transient,
                });
              }

              throw new RenderPipelineError(
                'BUNDLE_FAILED',
                'The Remotion bundle could not be built or loaded.',
                { cause },
              );
            }
          },
          select: async (options) => {
            try {
              return await selectComposition(options);
            } catch (cause) {
              const failure = classifyRenderFailure(cause);

              if (failure.code === 'BROWSER_CRASHED') {
                throw new RenderPipelineError(failure.code, failure.technicalError, {
                  cause,
                  transient: true,
                });
              }

              throw new RenderPipelineError(
                'COMPOSITION_SELECT_FAILED',
                'Remotion could not select the project composition.',
                { cause },
              );
            }
          },
          onStage: async (stage) => {
            await cancellationMonitor.check();
            await renderJobRepository.updateProgress({
              renderJobId: job.id,
              workerId,
              status: stage,
              progress: stage === 'BUNDLING' ? 0.03 : 0.1,
              stageMessage:
                stage === 'BUNDLING'
                  ? 'Building or loading Remotion bundle.'
                  : 'Selecting Remotion composition.',
            });
          },
        });

        console.info(
          `Selected ${prepared.composition.id} for render job ${job.id} ` +
            `(${prepared.composition.width}x${prepared.composition.height}, ` +
            `${prepared.composition.durationInFrames} frames).`,
        );
        await renderH264Media({
          preset: job.preset,
          outputLocation: attemptPaths.video,
          serveUrl: prepared.serveUrl,
          composition: prepared.composition,
          inputProps: prepared.inputProps,
          frameConcurrency: workerServerEnvironment.RENDER_FRAME_CONCURRENCY,
          muted: prepared.inputProps.project.export.muted,
          cancelSignal: remotionCancellation.cancelSignal,
          render: renderMedia,
          writeProgress: (progress) =>
            renderJobRepository.updateProgress({
              renderJobId: job.id,
              workerId,
              ...progress,
            }),
        });
        console.info(`Rendered H.264 media for render job ${job.id} to ${attemptPaths.video}.`);

        await cancellationMonitor.check();
        await renderJobRepository.updateProgress({
          renderJobId: job.id,
          workerId,
          status: 'ENCODING',
          progress: 0.98,
          stageMessage: 'Verifying rendered media.',
        });
        const video = await probeRenderedVideo(attemptPaths.video, prepared.composition);

        await cancellationMonitor.check();
        await renderJobRepository.updateProgress({
          renderJobId: job.id,
          workerId,
          status: 'ENCODING',
          progress: 0.99,
          stageMessage: 'Rendering thumbnail.',
        });
        const thumbnail = await renderThumbnail({
          outputLocation: attemptPaths.thumbnail,
          serveUrl: prepared.serveUrl,
          composition: prepared.composition,
          inputProps: prepared.inputProps,
          cancelSignal: remotionCancellation.cancelSignal,
          render: renderStill,
        });

        await cancellationMonitor.check();
        await renderJobRepository.updateProgress({
          renderJobId: job.id,
          workerId,
          status: 'ENCODING',
          progress: 0.995,
          stageMessage: 'Finalizing render outputs.',
        });
        const outputPaths = await finalizeRenderJobAttempt(storagePaths, job.id);

        try {
          await renderJobRepository.complete({
            renderJobId: job.id,
            workerId,
            outputs: [
              {
                kind: 'VIDEO',
                relativePath: outputPaths.videoRelativePath,
                fileName: prepared.inputProps.project.export.fileName ?? 'video.mp4',
                mimeType: 'video/mp4',
                sizeBytes: video.sizeBytes,
                width: video.width,
                height: video.height,
                durationMs: video.durationMs,
                metadata: video.metadata,
              },
              {
                kind: 'THUMBNAIL',
                relativePath: outputPaths.thumbnailRelativePath,
                fileName: 'thumbnail.jpg',
                mimeType: 'image/jpeg',
                sizeBytes: thumbnail.sizeBytes,
                width: thumbnail.width,
                height: thumbnail.height,
                metadata: { frame: thumbnail.frame },
              },
            ],
          });
          completed = true;
        } catch (error) {
          await removeRenderJobOutputs(storagePaths, job.id);
          throw error;
        }

        console.info(`Finalized video and thumbnail outputs for render job ${job.id}.`);
      },
      cleanup: async () => {
        let cleanupError: unknown;

        try {
          await prepared?.close();
        } catch (error) {
          cleanupError = error;
        }

        try {
          await removeRenderJobTempDirectory(storagePaths, job.id);
        } catch (error) {
          cleanupError ??= error;
        }

        if (cleanupError !== undefined) {
          if (!completed) {
            throw cleanupError;
          }

          console.warn(`Could not fully clean up completed render job ${job.id}.`, cleanupError);
        }
      },
      completeCancellation: async () => {
        await renderJobRepository.completeCancellation({
          renderJobId: job.id,
          workerId,
        });
      },
    });

    if (outcome === 'CANCELLED') {
      console.info(`Cancelled render job ${job.id}.`);
    }
  },
  writeHeartbeat: createPrismaWorkerHeartbeatWriter(database),
  onPollError: (error) => {
    console.error('Worker queue polling failed', error);
  },
  onJobError: async (job, error) => {
    const { failure, disposition } = await persistRenderFailure({
      job,
      workerId,
      error,
      recordFailure: (input) => renderJobRepository.recordFailure(input),
    });
    console.error(
      `Render job ${job.id} ${disposition.action === 'RETRY_QUEUED' ? 'will retry' : 'failed'} ` +
        `with ${failure.code}.`,
      error,
    );
  },
  onHeartbeatError: (error) => {
    console.error('Failed to publish worker heartbeat', error);
  },
  onShutdownTimeout: async (jobIds) => {
    console.warn(`Worker shutdown timed out; cancellation requested for: ${jobIds.join(', ')}`);
    await Promise.all(
      jobIds.map((renderJobId) => renderJobRepository.requestCancellation(renderJobId)),
    );
  },
  cleanup: async () => {
    try {
      await workerAssetServer.closeAll();
    } finally {
      await database.$disconnect();
    }
  },
});
