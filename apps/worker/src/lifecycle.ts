import { type RenderJobRecord } from '@hansys/database';
import {
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  WorkerHeartbeatLoop,
  type WorkerHeartbeatPayload,
  type WorkerHeartbeatWriter,
} from './heartbeat.js';
import { assertWorkerDoctorHealthy, type WorkerDoctorReport } from './doctor.js';

export const DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS = 30_000;
export const DEFAULT_STALE_RECOVERY_INTERVAL_MS = 60_000;

export type WorkerLifecycleState = 'CREATED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED';

export type WorkerExecutionContext = {
  signal: AbortSignal;
};

export type WorkerLifecycleOptions = {
  workerId: string;
  appVersion: string;
  remotionVersion: string;
  jobConcurrency: number;
  pollIntervalMs: number;
  shutdownTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  staleRecoveryIntervalMs?: number;
  runDoctor: () => Promise<WorkerDoctorReport>;
  recoverStaleJobs?: () => Promise<void>;
  claimNext: (workerId: string) => Promise<RenderJobRecord | null>;
  executeJob: (job: RenderJobRecord, context: WorkerExecutionContext) => Promise<void>;
  writeHeartbeat: WorkerHeartbeatWriter;
  onPollError?: (error: unknown) => void;
  onJobError?: (job: RenderJobRecord, error: unknown) => Promise<void> | void;
  onHeartbeatError?: (error: unknown) => void;
  onShutdownTimeout?: (jobIds: readonly string[]) => Promise<void> | void;
  cleanup?: () => Promise<void>;
};

type ActiveExecution = {
  controller: AbortController;
  promise: Promise<void>;
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

export class WorkerLifecycle {
  readonly #workerId: string;
  readonly #appVersion: string;
  readonly #remotionVersion: string;
  readonly #jobConcurrency: number;
  readonly #pollIntervalMs: number;
  readonly #shutdownTimeoutMs: number;
  readonly #staleRecoveryIntervalMs: number;
  readonly #runDoctor: () => Promise<WorkerDoctorReport>;
  readonly #recoverStaleJobs: (() => Promise<void>) | undefined;
  readonly #claimNext: (workerId: string) => Promise<RenderJobRecord | null>;
  readonly #executeJob: WorkerLifecycleOptions['executeJob'];
  readonly #writeHeartbeat: WorkerHeartbeatWriter;
  readonly #onPollError: (error: unknown) => void;
  readonly #onJobError: NonNullable<WorkerLifecycleOptions['onJobError']>;
  readonly #onHeartbeatError: (error: unknown) => void;
  readonly #onShutdownTimeout: NonNullable<WorkerLifecycleOptions['onShutdownTimeout']>;
  readonly #cleanup: () => Promise<void>;
  readonly #heartbeatLoop: WorkerHeartbeatLoop;
  readonly #activeExecutions = new Map<string, ActiveExecution>();
  #state: WorkerLifecycleState = 'CREATED';
  #doctorReport: WorkerDoctorReport | null = null;
  #acceptingJobs = false;
  #pollPromise: Promise<void> | null = null;
  #shutdownPromise: Promise<void> | null = null;
  #pollTimer: ReturnType<typeof setTimeout> | undefined;
  #nextStaleRecoveryAt = 0;
  #wakePoll: (() => void) | undefined;
  #resolveStopped!: () => void;
  readonly #stopped = new Promise<void>((resolve) => {
    this.#resolveStopped = resolve;
  });

  constructor({
    workerId,
    appVersion,
    remotionVersion,
    jobConcurrency,
    pollIntervalMs,
    shutdownTimeoutMs = DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS,
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    staleRecoveryIntervalMs = DEFAULT_STALE_RECOVERY_INTERVAL_MS,
    runDoctor,
    recoverStaleJobs,
    claimNext,
    executeJob,
    writeHeartbeat,
    onPollError = () => undefined,
    onJobError = () => undefined,
    onHeartbeatError = () => undefined,
    onShutdownTimeout = () => undefined,
    cleanup = async () => undefined,
  }: WorkerLifecycleOptions) {
    assertPositiveInteger(jobConcurrency, 'Job concurrency');
    assertPositiveInteger(pollIntervalMs, 'Poll interval');
    assertPositiveInteger(shutdownTimeoutMs, 'Shutdown timeout');
    assertPositiveInteger(heartbeatIntervalMs, 'Heartbeat interval');
    assertPositiveInteger(staleRecoveryIntervalMs, 'Stale recovery interval');

    this.#workerId = workerId;
    this.#appVersion = appVersion;
    this.#remotionVersion = remotionVersion;
    this.#jobConcurrency = jobConcurrency;
    this.#pollIntervalMs = pollIntervalMs;
    this.#shutdownTimeoutMs = shutdownTimeoutMs;
    this.#staleRecoveryIntervalMs = staleRecoveryIntervalMs;
    this.#runDoctor = runDoctor;
    this.#recoverStaleJobs = recoverStaleJobs;
    this.#claimNext = claimNext;
    this.#executeJob = executeJob;
    this.#writeHeartbeat = writeHeartbeat;
    this.#onPollError = onPollError;
    this.#onJobError = onJobError;
    this.#onHeartbeatError = onHeartbeatError;
    this.#onShutdownTimeout = onShutdownTimeout;
    this.#cleanup = cleanup;
    this.#heartbeatLoop = new WorkerHeartbeatLoop({
      createPayload: () => this.#createHeartbeatPayload(),
      writeHeartbeat,
      intervalMs: heartbeatIntervalMs,
      onError: onHeartbeatError,
    });
  }

  get state(): WorkerLifecycleState {
    return this.#state;
  }

  get activeJobIds(): readonly string[] {
    return [...this.#activeExecutions.keys()];
  }

  async start(): Promise<void> {
    if (this.#state !== 'CREATED') {
      throw new Error(`Worker cannot start from ${this.#state} state.`);
    }

    this.#state = 'STARTING';

    try {
      this.#doctorReport = await this.#runDoctor();
    } catch (error) {
      await this.#cleanupAndStop();
      throw error;
    }

    if (this.#state !== 'STARTING') {
      return;
    }

    try {
      assertWorkerDoctorHealthy(this.#doctorReport);
    } catch (error) {
      await this.#publishUnhealthyHeartbeat();
      await this.#cleanupAndStop();
      throw error;
    }

    try {
      await this.#recoverStaleJobs?.();
      this.#nextStaleRecoveryAt = Date.now() + this.#staleRecoveryIntervalMs;
    } catch (error) {
      await this.#cleanupAndStop();
      throw error;
    }

    if (this.#state !== 'STARTING') {
      return;
    }

    this.#state = 'RUNNING';
    this.#acceptingJobs = true;

    try {
      await this.#heartbeatLoop.start();
    } catch (error) {
      this.#acceptingJobs = false;
      await this.#cleanupAndStop();
      throw error;
    }

    this.#pollPromise = this.#poll();
  }

  shutdown(): Promise<void> {
    if (this.#shutdownPromise !== null) {
      return this.#shutdownPromise;
    }

    this.#shutdownPromise = this.#shutdown();
    return this.#shutdownPromise;
  }

  async waitUntilStopped(): Promise<void> {
    await this.#stopped;
  }

  async #shutdown(): Promise<void> {
    if (this.#state === 'STOPPED') {
      return;
    }

    if (this.#state === 'CREATED') {
      await this.#cleanupAndStop();
      return;
    }

    this.#state = 'STOPPING';
    this.#acceptingJobs = false;
    this.#wakePollingLoop();
    await this.#publishHeartbeatSafely();
    await this.#pollPromise;

    const activeExecutions = [...this.#activeExecutions.values()];
    const completedBeforeTimeout = await this.#waitForExecutions(activeExecutions);

    if (!completedBeforeTimeout && this.#activeExecutions.size > 0) {
      const activeJobIds = this.activeJobIds;

      try {
        await this.#onShutdownTimeout(activeJobIds);
      } catch (error) {
        this.#onJobErrorForShutdown(error);
      }

      this.#activeExecutions.forEach(({ controller }) => controller.abort());
      await this.#waitForExecutions(activeExecutions);
    }

    this.#heartbeatLoop.stop();
    await this.#publishHeartbeatSafely();
    await this.#cleanupAndStop();
  }

  async #poll(): Promise<void> {
    while (this.#acceptingJobs) {
      await this.#recoverStaleJobsIfDue();

      if (this.#activeExecutions.size >= this.#jobConcurrency) {
        await this.#waitForNextPoll();
        continue;
      }

      let job: RenderJobRecord | null;

      try {
        job = await this.#claimNext(this.#workerId);
      } catch (error) {
        this.#onPollError(error);
        await this.#waitForNextPoll();
        continue;
      }

      if (job === null) {
        await this.#waitForNextPoll();
        continue;
      }

      this.#startExecution(job);
    }
  }

  async #recoverStaleJobsIfDue(): Promise<void> {
    if (this.#recoverStaleJobs === undefined || Date.now() < this.#nextStaleRecoveryAt) {
      return;
    }

    this.#nextStaleRecoveryAt = Date.now() + this.#staleRecoveryIntervalMs;

    try {
      await this.#recoverStaleJobs();
    } catch (error) {
      this.#onPollError(error);
    }
  }

  #startExecution(job: RenderJobRecord): void {
    const controller = new AbortController();
    const execution = Promise.resolve()
      .then(() => this.#executeJob(job, { signal: controller.signal }))
      .catch(async (error: unknown) => {
        try {
          await this.#onJobError(job, error);
        } catch (handlerError) {
          this.#onPollError(handlerError);
        }
      })
      .finally(() => {
        this.#activeExecutions.delete(job.id);
        void this.#publishHeartbeatSafely();
        this.#wakePollingLoop();
      });

    this.#activeExecutions.set(job.id, {
      controller,
      promise: execution,
    });
    void this.#publishHeartbeatSafely();
  }

  async #waitForExecutions(executions: ActiveExecution[]): Promise<boolean> {
    if (executions.length === 0) {
      return true;
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const completed = Promise.allSettled(executions.map(({ promise }) => promise)).then(() => true);
    const expired = new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), this.#shutdownTimeoutMs);
    });
    const result = await Promise.race([completed, expired]);

    if (timeout !== undefined) {
      clearTimeout(timeout);
    }

    return result;
  }

  async #waitForNextPoll(): Promise<void> {
    await new Promise<void>((resolve) => {
      const finish = () => {
        if (this.#pollTimer !== undefined) {
          clearTimeout(this.#pollTimer);
          this.#pollTimer = undefined;
        }

        this.#wakePoll = undefined;
        resolve();
      };

      this.#wakePoll = finish;
      this.#pollTimer = setTimeout(finish, this.#pollIntervalMs);
    });
  }

  #wakePollingLoop(): void {
    this.#wakePoll?.();
  }

  #createHeartbeatPayload(): WorkerHeartbeatPayload {
    const report = this.#doctorReport;
    const activeJobIds = this.activeJobIds;
    const status =
      report?.healthy === false
        ? 'UNHEALTHY'
        : this.#state === 'STOPPING' || this.#state === 'STOPPED'
          ? 'STOPPING'
          : activeJobIds.length > 0
            ? 'BUSY'
            : 'IDLE';

    return {
      workerId: this.#workerId,
      appVersion: this.#appVersion,
      remotionVersion: this.#remotionVersion,
      status,
      currentJobId: activeJobIds[0] ?? null,
      ffmpegAvailable: report?.ffmpegAvailable ?? false,
      browserAvailable: report?.browserAvailable ?? false,
      storageWritable: report?.storageWritable ?? false,
      details: {
        databaseAvailable: report?.databaseAvailable ?? false,
        ffprobeAvailable: report?.ffprobeAvailable ?? false,
        activeJobCount: activeJobIds.length,
      },
    };
  }

  async #publishHeartbeatSafely(): Promise<void> {
    try {
      await this.#heartbeatLoop.publishNow();
    } catch (error) {
      this.#onHeartbeatError(error);
    }
  }

  async #publishUnhealthyHeartbeat(): Promise<void> {
    try {
      await this.#writeHeartbeat(this.#createHeartbeatPayload());
    } catch (error) {
      this.#onHeartbeatError(error);
    }
  }

  #onJobErrorForShutdown(error: unknown): void {
    this.#onPollError(error);
  }

  async #cleanupAndStop(): Promise<void> {
    try {
      await this.#cleanup();
    } finally {
      this.#state = 'STOPPED';
      this.#resolveStopped();
    }
  }
}
