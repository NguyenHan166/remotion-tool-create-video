export const DEFAULT_RENDER_CANCELLATION_POLL_MS = 1_000;

export class RenderCancellationRequestedError extends Error {
  readonly code = 'RENDER_CANCELLED';

  constructor() {
    super('Render cancellation was requested.');
    this.name = 'RenderCancellationRequestedError';
  }
}

export type RenderCancellationMonitorOptions = {
  pollCancellation: () => Promise<boolean>;
  cancelRender: () => void;
  externalSignal?: AbortSignal;
  pollIntervalMs?: number;
};

export type RunRenderAttemptWithCancellationOptions = {
  monitor: RenderCancellationMonitor;
  execute: () => Promise<void>;
  cleanup: () => Promise<void>;
  completeCancellation: () => Promise<void>;
};

export class RenderCancellationMonitor {
  readonly #pollCancellation: () => Promise<boolean>;
  readonly #cancelRender: () => void;
  readonly #externalSignal: AbortSignal | undefined;
  readonly #pollIntervalMs: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #checkPromise: Promise<void> | undefined;
  #failure: unknown;
  #requested = false;
  #renderCancelled = false;
  #started = false;
  #stopped = false;

  constructor({
    pollCancellation,
    cancelRender,
    externalSignal,
    pollIntervalMs = DEFAULT_RENDER_CANCELLATION_POLL_MS,
  }: RenderCancellationMonitorOptions) {
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
      throw new RangeError('Cancellation poll interval must be a positive safe integer.');
    }

    this.#pollCancellation = pollCancellation;
    this.#cancelRender = cancelRender;
    this.#externalSignal = externalSignal;
    this.#pollIntervalMs = pollIntervalMs;
  }

  start(): void {
    if (this.#started) {
      throw new Error('Render cancellation monitor has already started.');
    }

    this.#started = true;
    this.#externalSignal?.addEventListener('abort', this.#handleExternalAbort, { once: true });

    if (this.#externalSignal?.aborted === true) {
      this.#cancelOnce();
    }

    this.#scheduleNextCheck();
  }

  async check(): Promise<void> {
    await this.#runCheck();
    this.#throwIfStoppedByCancellation();
  }

  async stop(): Promise<void> {
    this.#stopped = true;

    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }

    this.#externalSignal?.removeEventListener('abort', this.#handleExternalAbort);
    await this.#checkPromise;
  }

  readonly #handleExternalAbort = (): void => {
    this.#cancelOnce();
  };

  #scheduleNextCheck(): void {
    if (this.#stopped || this.#requested || this.#failure !== undefined) {
      return;
    }

    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.#runCheck().then(() => this.#scheduleNextCheck());
    }, this.#pollIntervalMs);
    this.#timer.unref?.();
  }

  async #runCheck(): Promise<void> {
    if (this.#requested || this.#failure !== undefined || this.#stopped) {
      return;
    }

    if (this.#checkPromise === undefined) {
      const check = (async () => {
        try {
          if (await this.#pollCancellation()) {
            this.#requested = true;
            this.#cancelOnce();
          }
        } catch (error) {
          this.#failure = error;
          this.#cancelOnce();
        }
      })();
      const trackedCheck = check.finally(() => {
        if (this.#checkPromise === trackedCheck) {
          this.#checkPromise = undefined;
        }
      });
      this.#checkPromise = trackedCheck;
    }

    await this.#checkPromise;
  }

  #cancelOnce(): void {
    if (this.#renderCancelled) {
      return;
    }

    this.#renderCancelled = true;

    try {
      this.#cancelRender();
    } catch (error) {
      this.#failure ??= error;
    }
  }

  #throwIfStoppedByCancellation(): void {
    if (this.#failure !== undefined) {
      throw this.#failure;
    }

    if (this.#requested) {
      throw new RenderCancellationRequestedError();
    }
  }
}

export async function runRenderAttemptWithCancellation({
  monitor,
  execute,
  cleanup,
  completeCancellation,
}: RunRenderAttemptWithCancellationOptions): Promise<'COMPLETED' | 'CANCELLED'> {
  let executionError: unknown;

  monitor.start();

  try {
    await monitor.check();
    await execute();
    await monitor.check();
  } catch (error) {
    executionError = error;

    try {
      await monitor.check();
    } catch (cancellationError) {
      executionError = cancellationError;
    }
  } finally {
    try {
      await monitor.stop();
    } finally {
      await cleanup();
    }
  }

  if (executionError instanceof RenderCancellationRequestedError) {
    await completeCancellation();
    return 'CANCELLED';
  }

  if (executionError !== undefined) {
    throw executionError;
  }

  return 'COMPLETED';
}
