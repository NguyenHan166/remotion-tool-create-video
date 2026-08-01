import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type RenderJobRecord } from '../packages/database/src/index.js';
import {
  WorkerDoctorError,
  assertWorkerDoctorHealthy,
  runWorkerDoctor,
  type WorkerDoctorReport,
} from '../apps/worker/src/doctor.js';
import { WorkerLifecycle, type WorkerLifecycleOptions } from '../apps/worker/src/lifecycle.js';
import { type WorkerHeartbeatPayload } from '../apps/worker/src/heartbeat.js';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const timestamp = new Date('2026-07-31T14:00:00.000Z');
const renderJobId = '11111111-1111-4111-8111-111111111111';

function createHealthyDoctorReport(): WorkerDoctorReport {
  return {
    healthy: true,
    checkedAt: timestamp,
    databaseAvailable: true,
    storageWritable: true,
    ffmpegAvailable: true,
    ffprobeAvailable: true,
    browserAvailable: true,
    errors: {},
  };
}

function createClaimedJob(): RenderJobRecord {
  return {
    id: renderJobId,
    projectId: '22222222-2222-4222-8222-222222222222',
    revisionId: '33333333-3333-4333-8333-333333333333',
    status: 'PREPARING',
    preset: 'vertical-h264',
    priority: 0,
    progress: 0,
    renderedFrames: null,
    encodedFrames: null,
    totalFrames: null,
    stageMessage: null,
    workerId: 'worker-test',
    attempt: 1,
    maxAttempts: 2,
    errorCode: null,
    errorMessage: null,
    technicalError: null,
    availableAt: timestamp,
    heartbeatAt: timestamp,
    startedAt: timestamp,
    finishedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    outputs: [],
  };
}

function createLifecycle(overrides: Partial<WorkerLifecycleOptions> = {}) {
  const heartbeats: WorkerHeartbeatPayload[] = [];
  const writeHeartbeat = vi.fn(async (payload: WorkerHeartbeatPayload) => {
    heartbeats.push(payload);
  });
  const cleanup = vi.fn().mockResolvedValue(undefined);
  const options: WorkerLifecycleOptions = {
    workerId: 'worker-test',
    appVersion: '0.1.0',
    remotionVersion: '4.0.499',
    jobConcurrency: 1,
    pollIntervalMs: 1_000,
    shutdownTimeoutMs: 5_000,
    heartbeatIntervalMs: 5_000,
    runDoctor: async () => createHealthyDoctorReport(),
    claimNext: vi.fn().mockResolvedValue(null),
    executeJob: vi.fn().mockResolvedValue(undefined),
    writeHeartbeat,
    cleanup,
    ...overrides,
  };

  return {
    lifecycle: new WorkerLifecycle(options),
    options,
    heartbeats,
    writeHeartbeat,
    cleanup,
  };
}

async function flushUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error('Condition did not become true after flushing microtasks.');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('worker environment doctor', () => {
  it('runs every capability check and reports a healthy worker', async () => {
    const checks = {
      database: vi.fn().mockResolvedValue(undefined),
      storage: vi.fn().mockResolvedValue(undefined),
      ffmpeg: vi.fn().mockResolvedValue(undefined),
      ffprobe: vi.fn().mockResolvedValue(undefined),
      browser: vi.fn().mockResolvedValue(undefined),
    };

    const report = await runWorkerDoctor(checks);

    expect(report).toMatchObject({
      healthy: true,
      databaseAvailable: true,
      storageWritable: true,
      ffmpegAvailable: true,
      ffprobeAvailable: true,
      browserAvailable: true,
      errors: {},
    });
    Object.values(checks).forEach((check) => expect(check).toHaveBeenCalledOnce());
    expect(() => assertWorkerDoctorHealthy(report)).not.toThrow();
  });

  it('collects all failed capabilities and raises a typed startup error', async () => {
    const report = await runWorkerDoctor({
      database: vi.fn().mockRejectedValue(new Error('database unavailable')),
      storage: vi.fn().mockResolvedValue(undefined),
      ffmpeg: vi.fn().mockRejectedValue(new Error('ffmpeg missing')),
      ffprobe: vi.fn().mockResolvedValue(undefined),
      browser: vi.fn().mockRejectedValue(new Error('browser missing')),
    });

    expect(report).toMatchObject({
      healthy: false,
      databaseAvailable: false,
      storageWritable: true,
      ffmpegAvailable: false,
      ffprobeAvailable: true,
      browserAvailable: false,
      errors: {
        database: 'database unavailable',
        ffmpeg: 'ffmpeg missing',
        browser: 'browser missing',
      },
    });
    expect(() => assertWorkerDoctorHealthy(report)).toThrowError(WorkerDoctorError);
  });
});

describe('worker lifecycle', () => {
  it('starts independently, publishes capabilities and polls the queue', async () => {
    const claimNext = vi.fn().mockResolvedValue(null);
    const recoverStaleJobs = vi.fn().mockResolvedValue(undefined);
    const { lifecycle, heartbeats, cleanup } = createLifecycle({ claimNext, recoverStaleJobs });

    await lifecycle.start();
    await flushUntil(() => claimNext.mock.calls.length > 0);

    expect(lifecycle.state).toBe('RUNNING');
    expect(recoverStaleJobs).toHaveBeenCalledOnce();
    expect(claimNext).toHaveBeenCalledWith('worker-test');
    expect(heartbeats[0]).toMatchObject({
      workerId: 'worker-test',
      status: 'IDLE',
      ffmpegAvailable: true,
      browserAvailable: true,
      storageWritable: true,
      details: {
        databaseAvailable: true,
        ffprobeAvailable: true,
        activeJobCount: 0,
      },
    });

    await lifecycle.shutdown();

    expect(lifecycle.state).toBe('STOPPED');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('recovers stale jobs after doctor checks and before heartbeat or polling', async () => {
    const events: string[] = [];
    const { lifecycle } = createLifecycle({
      runDoctor: async () => {
        events.push('doctor');
        return createHealthyDoctorReport();
      },
      recoverStaleJobs: async () => {
        events.push('recover');
      },
      writeHeartbeat: async () => {
        events.push('heartbeat');
      },
      claimNext: async () => {
        events.push('claim');
        return null;
      },
    });

    await lifecycle.start();
    await flushUntil(() => events.includes('claim'));

    expect(events.slice(0, 4)).toEqual(['doctor', 'recover', 'heartbeat', 'claim']);
    await lifecycle.shutdown();
  });

  it('runs stale recovery periodically while polling', async () => {
    vi.useFakeTimers();
    const recoverStaleJobs = vi.fn().mockResolvedValue(undefined);
    const { lifecycle } = createLifecycle({
      pollIntervalMs: 25,
      staleRecoveryIntervalMs: 100,
      recoverStaleJobs,
    });

    await lifecycle.start();
    expect(recoverStaleJobs).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(100);
    expect(recoverStaleJobs).toHaveBeenCalledTimes(2);

    await lifecycle.shutdown();
  });

  it('runs optional storage maintenance before polling and on its interval', async () => {
    vi.useFakeTimers();
    const runMaintenance = vi.fn().mockResolvedValue(undefined);
    const claimNext = vi.fn().mockResolvedValue(null);
    const { lifecycle } = createLifecycle({
      claimNext,
      pollIntervalMs: 25,
      maintenanceIntervalMs: 100,
      runMaintenance,
    });

    await lifecycle.start();
    await flushUntil(() => claimNext.mock.calls.length > 0);

    expect(runMaintenance).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(runMaintenance).toHaveBeenCalledTimes(2);

    await lifecycle.shutdown();
  });

  it('does not heartbeat or poll when startup recovery fails', async () => {
    const recoveryError = new Error('stale cleanup failed');
    const claimNext = vi.fn().mockResolvedValue(null);
    const { lifecycle, writeHeartbeat, cleanup } = createLifecycle({
      recoverStaleJobs: vi.fn().mockRejectedValue(recoveryError),
      claimNext,
    });

    await expect(lifecycle.start()).rejects.toBe(recoveryError);

    expect(lifecycle.state).toBe('STOPPED');
    expect(writeHeartbeat).not.toHaveBeenCalled();
    expect(claimNext).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('stops claiming and waits for the active job during graceful shutdown', async () => {
    let finishExecution!: () => void;
    const execution = new Promise<void>((resolve) => {
      finishExecution = resolve;
    });
    const claimNext = vi.fn().mockResolvedValueOnce(createClaimedJob()).mockResolvedValue(null);
    const executeJob = vi.fn().mockReturnValue(execution);
    const { lifecycle, heartbeats } = createLifecycle({
      claimNext,
      executeJob,
    });

    await lifecycle.start();
    await flushUntil(() => executeJob.mock.calls.length === 1);
    const claimCountAtShutdown = claimNext.mock.calls.length;
    const shutdown = lifecycle.shutdown();

    await Promise.resolve();
    expect(lifecycle.state).toBe('STOPPING');
    expect(lifecycle.activeJobIds).toEqual([renderJobId]);
    expect(claimNext).toHaveBeenCalledTimes(claimCountAtShutdown);

    finishExecution();
    await shutdown;

    expect(lifecycle.state).toBe('STOPPED');
    expect(lifecycle.activeJobIds).toEqual([]);
    expect(heartbeats.map(({ status }) => status)).toContain('BUSY');
    expect(heartbeats.at(-1)?.status).toBe('STOPPING');
  });

  it('aborts the active execution only after the shutdown grace period expires', async () => {
    vi.useFakeTimers();
    let executionSignal: AbortSignal | undefined;
    const executeJob = vi.fn(async (_job: RenderJobRecord, { signal }: { signal: AbortSignal }) => {
      executionSignal = signal;
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    });
    const claimNext = vi.fn().mockResolvedValueOnce(createClaimedJob()).mockResolvedValue(null);
    const onShutdownTimeout = vi.fn(async () => {
      expect(executionSignal?.aborted).toBe(false);
    });
    const { lifecycle } = createLifecycle({
      claimNext,
      executeJob,
      shutdownTimeoutMs: 100,
      onShutdownTimeout,
    });

    await lifecycle.start();
    await flushUntil(() => executionSignal !== undefined);
    const shutdown = lifecycle.shutdown();
    await vi.advanceTimersByTimeAsync(99);

    expect(executionSignal?.aborted).toBe(false);
    expect(onShutdownTimeout).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await shutdown;

    expect(executionSignal?.aborted).toBe(true);
    expect(onShutdownTimeout).toHaveBeenCalledWith([renderJobId]);
    expect(lifecycle.state).toBe('STOPPED');
  });

  it('does not poll when the environment doctor is unhealthy', async () => {
    const report: WorkerDoctorReport = {
      ...createHealthyDoctorReport(),
      healthy: false,
      browserAvailable: false,
      errors: {
        browser: 'browser missing',
      },
    };
    const claimNext = vi.fn().mockResolvedValue(null);
    const { lifecycle, heartbeats, cleanup } = createLifecycle({
      runDoctor: async () => report,
      claimNext,
    });

    await expect(lifecycle.start()).rejects.toThrowError(WorkerDoctorError);

    expect(lifecycle.state).toBe('STOPPED');
    expect(claimNext).not.toHaveBeenCalled();
    expect(heartbeats).toHaveLength(1);
    expect(heartbeats[0]?.status).toBe('UNHEALTHY');
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

describe('worker executable boundary', () => {
  it('imports lifecycle APIs without evaluating runtime environment or web modules', async () => {
    const workerModule = await import('../apps/worker/src/index.js');

    expect(workerModule.WorkerLifecycle).toBe(WorkerLifecycle);
    expect(workerModule.runWorkerDoctor).toBe(runWorkerDoctor);
  });

  it('provides a standalone start command without a web dependency', () => {
    const manifest = JSON.parse(
      readFileSync(join(repositoryRoot, 'apps', 'worker', 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    const mainSource = readFileSync(
      join(repositoryRoot, 'apps', 'worker', 'src', 'main.ts'),
      'utf8',
    );
    const runtimeSource = readFileSync(
      join(repositoryRoot, 'apps', 'worker', 'src', 'runtime.ts'),
      'utf8',
    );

    expect(manifest.scripts.start).toBe('tsx src/main.ts');
    expect(manifest.dependencies).toHaveProperty('tsx');
    expect(mainSource).toContain('await workerLifecycle.start()');
    expect(`${mainSource}\n${runtimeSource}`).not.toContain('@hansys/web');
  });
});
