export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;

export type WorkerHeartbeatStatus = 'IDLE' | 'BUSY' | 'STOPPING' | 'UNHEALTHY';

export type WorkerHeartbeatPayload = {
  workerId: string;
  appVersion: string;
  remotionVersion: string;
  status: WorkerHeartbeatStatus;
  currentJobId: string | null;
  ffmpegAvailable: boolean;
  browserAvailable: boolean;
  storageWritable: boolean;
  details: Record<string, boolean | number | string | null> | null;
};

export type WorkerHeartbeatWriter = (payload: WorkerHeartbeatPayload) => Promise<void>;

export type WorkerHeartbeatLoopOptions = {
  createPayload: () => WorkerHeartbeatPayload;
  writeHeartbeat: WorkerHeartbeatWriter;
  intervalMs?: number;
  onError?: (error: unknown) => void;
};

export class WorkerHeartbeatLoop {
  readonly #createPayload: () => WorkerHeartbeatPayload;
  readonly #writeHeartbeat: WorkerHeartbeatWriter;
  readonly #intervalMs: number;
  readonly #onError: (error: unknown) => void;
  #running = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor({
    createPayload,
    writeHeartbeat,
    intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    onError = () => undefined,
  }: WorkerHeartbeatLoopOptions) {
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new RangeError('Heartbeat interval must be a positive integer');
    }

    this.#createPayload = createPayload;
    this.#writeHeartbeat = writeHeartbeat;
    this.#intervalMs = intervalMs;
    this.#onError = onError;
  }

  get running(): boolean {
    return this.#running;
  }

  async start(): Promise<void> {
    if (this.#running) {
      return;
    }

    this.#running = true;

    try {
      await this.publishNow();
    } catch (error) {
      this.#running = false;
      throw error;
    }

    this.#scheduleNextHeartbeat();
  }

  async publishNow(): Promise<void> {
    await this.#writeHeartbeat(this.#createPayload());
  }

  stop(): void {
    this.#running = false;

    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  #scheduleNextHeartbeat(): void {
    if (!this.#running) {
      return;
    }

    this.#timer = setTimeout(() => {
      void this.#runScheduledHeartbeat();
    }, this.#intervalMs);
  }

  async #runScheduledHeartbeat(): Promise<void> {
    this.#timer = undefined;

    try {
      await this.#writeHeartbeat(this.#createPayload());
    } catch (error) {
      this.#onError(error);
    } finally {
      this.#scheduleNextHeartbeat();
    }
  }
}
