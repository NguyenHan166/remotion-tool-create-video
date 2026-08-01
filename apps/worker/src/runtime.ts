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
import { createStructuredLogger } from '@hansys/shared/observability';
import { overrideVideoWebpackConfig } from '@hansys/video/bundler-config';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import type { BrowserLog } from '@remotion/renderer';
import { WorkerAssetServer } from './asset-server.js';
import { PersistentRemotionBundleCache, computeRemotionBundleKey } from './bundle-cache.js';
import { StorageRetentionService } from './cleanup.js';
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
import { persistRenderDiagnostics, RenderDiagnostics } from './render-diagnostics.js';
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
export const workerLogger = createStructuredLogger({
  context: {
    service: 'render-worker',
    workerId,
    appVersion: workerServerEnvironment.APP_VERSION,
    remotionVersion: rendererManifest.version,
  },
});
const diagnosticsByJob = new Map<string, RenderDiagnostics>();
const storageRetentionService = new StorageRetentionService({
  paths: storagePaths,
  retentionDays: workerServerEnvironment.STORAGE_RETENTION_DAYS,
  logger: workerLogger.child({ service: 'storage-retention' }),
});

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
      workerLogger.info('render.stale_jobs_recovered', recovery);
    }
  },
  staleRecoveryIntervalMs: Math.max(
    60_000,
    Math.floor((workerServerEnvironment.RENDER_STALE_AFTER_MINUTES * 60_000) / 2),
  ),
  maintenanceIntervalMs: workerServerEnvironment.STORAGE_CLEANUP_INTERVAL_MS,
  runMaintenance: async (activeJobIds) => {
    const [activeJobs, referencedOutputs] = await Promise.all([
      database.renderJob.findMany({
        where: {
          status: {
            in: ['PREPARING', 'BUNDLING', 'RENDERING', 'ENCODING', 'CANCEL_REQUESTED'],
          },
        },
        select: {
          id: true,
        },
      }),
      database.renderOutput.findMany({
        select: {
          relativePath: true,
        },
      }),
    ]);
    await storageRetentionService.run({
      protectedTempJobIds: [...new Set([...activeJobIds, ...activeJobs.map(({ id }) => id)])],
      protectedRelativePaths: referencedOutputs.map(({ relativePath }) => relativePath),
    });
  },
  claimNext: (claimingWorkerId) => renderJobRepository.claimNext(claimingWorkerId),
  executeJob: async (job, { signal }) => {
    const diagnostics = new RenderDiagnostics({
      renderJobId: job.id,
      workerId,
      attempt: job.attempt,
    });
    diagnosticsByJob.set(job.id, diagnostics);
    const jobLogger = workerLogger.child({
      jobId: job.id,
      projectId: job.projectId,
      revisionId: job.revisionId,
      attempt: job.attempt,
    });
    const captureBrowserLog = (log: BrowserLog): void => {
      jobLogger.warn('remotion.browser_log', {
        browser: {
          type: log.type,
          text: log.text,
          stackTrace: log.stackTrace,
        },
      });
      diagnostics.captureBrowserLog(log);
    };
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
              return await selectComposition({ ...options, onBrowserLog: captureBrowserLog });
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
            diagnostics.capture(jobLogger.info('render.stage', { stage }));
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

        diagnostics.capture(
          jobLogger.info('render.composition_selected', {
            compositionId: prepared.composition.id,
            width: prepared.composition.width,
            height: prepared.composition.height,
            durationInFrames: prepared.composition.durationInFrames,
          }),
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
          onBrowserLog: captureBrowserLog,
          writeProgress: (progress) =>
            renderJobRepository.updateProgress({
              renderJobId: job.id,
              workerId,
              ...progress,
            }),
        });
        diagnostics.capture(
          jobLogger.info('render.media_rendered', {
            codec: 'h264',
            output: 'temporary-video',
          }),
        );

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
          onBrowserLog: captureBrowserLog,
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

        diagnostics.capture(jobLogger.info('render.outputs_finalized'));
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

          diagnostics.capture(jobLogger.warn('render.cleanup_incomplete', {}, cleanupError));
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
      diagnostics.capture(jobLogger.info('render.cancelled'));
    }

    diagnosticsByJob.delete(job.id);
  },
  writeHeartbeat: createPrismaWorkerHeartbeatWriter(database),
  onPollError: (error) => {
    workerLogger.error('worker.poll_failed', {}, error);
  },
  onJobError: async (job, error) => {
    const diagnostics = diagnosticsByJob.get(job.id);
    const jobLogger = workerLogger.child({
      jobId: job.id,
      projectId: job.projectId,
      revisionId: job.revisionId,
      attempt: job.attempt,
    });

    try {
      diagnostics?.captureFailure(error);
      let diagnostic;

      if (diagnostics !== undefined) {
        try {
          diagnostic = await persistRenderDiagnostics(
            storagePaths,
            { renderJobId: job.id, workerId, attempt: job.attempt },
            diagnostics,
          );
        } catch (diagnosticError) {
          jobLogger.error('render.diagnostic_write_failed', {}, diagnosticError);
        }
      }

      const { failure, disposition } = await persistRenderFailure({
        job,
        workerId,
        error,
        ...(diagnostic === undefined ? {} : { diagnostic }),
        recordFailure: (input) => renderJobRepository.recordFailure(input),
      });
      jobLogger.error(
        'render.job_failed',
        {
          failureCode: failure.code,
          disposition: disposition.action,
          diagnosticPath: diagnostic?.relativePath,
        },
        error,
      );
    } finally {
      diagnosticsByJob.delete(job.id);
    }
  },
  onHeartbeatError: (error) => {
    workerLogger.error('worker.heartbeat_failed', {}, error);
  },
  onShutdownTimeout: async (jobIds) => {
    workerLogger.warn('worker.shutdown_timeout', { activeJobIds: jobIds });
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
