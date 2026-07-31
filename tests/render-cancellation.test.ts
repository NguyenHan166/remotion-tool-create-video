import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RenderCancellationMonitor,
  RenderCancellationRequestedError,
  runRenderAttemptWithCancellation,
} from '../apps/worker/src/render-cancellation.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('render cancellation monitor', () => {
  it('polls at the configured interval and cancels Remotion once', async () => {
    vi.useFakeTimers();
    let cancellationRequested = false;
    const pollCancellation = vi.fn(async () => cancellationRequested);
    const cancelRender = vi.fn();
    const monitor = new RenderCancellationMonitor({
      pollCancellation,
      cancelRender,
      pollIntervalMs: 1_000,
    });

    monitor.start();
    await monitor.check();
    expect(pollCancellation).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(999);
    expect(pollCancellation).toHaveBeenCalledOnce();

    cancellationRequested = true;
    await vi.advanceTimersByTimeAsync(1);
    expect(pollCancellation).toHaveBeenCalledTimes(2);
    expect(cancelRender).toHaveBeenCalledOnce();
    await expect(monitor.check()).rejects.toBeInstanceOf(RenderCancellationRequestedError);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(pollCancellation).toHaveBeenCalledTimes(2);
    expect(cancelRender).toHaveBeenCalledOnce();
    await monitor.stop();
  });

  it('bridges an external abort signal without inventing a persisted request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const cancelRender = vi.fn();
    const monitor = new RenderCancellationMonitor({
      pollCancellation: async () => false,
      cancelRender,
      externalSignal: controller.signal,
    });

    monitor.start();
    controller.abort();
    controller.abort();

    expect(cancelRender).toHaveBeenCalledOnce();
    await expect(monitor.check()).resolves.toBeUndefined();
    await monitor.stop();
  });

  it('cancels rendering and surfaces cancellation polling failures', async () => {
    const databaseError = new Error('database unavailable');
    const cancelRender = vi.fn();
    const monitor = new RenderCancellationMonitor({
      pollCancellation: async () => {
        throw databaseError;
      },
      cancelRender,
    });

    monitor.start();
    await expect(monitor.check()).rejects.toBe(databaseError);
    expect(cancelRender).toHaveBeenCalledOnce();
    await monitor.stop();
  });

  it('cleans the running attempt before marking it cancelled', async () => {
    vi.useFakeTimers();
    let cancellationRequested = false;
    let rejectExecution: ((error: Error) => void) | undefined;
    let executionStarted = false;
    const events: string[] = [];
    const monitor = new RenderCancellationMonitor({
      pollCancellation: async () => cancellationRequested,
      cancelRender: () => rejectExecution?.(new Error('Remotion render cancelled')),
      pollIntervalMs: 1_000,
    });
    const attempt = runRenderAttemptWithCancellation({
      monitor,
      execute: async () => {
        executionStarted = true;
        await new Promise<void>((_resolve, reject) => {
          rejectExecution = reject;
        });
      },
      cleanup: async () => {
        events.push('cleanup');
      },
      completeCancellation: async () => {
        events.push('complete');
      },
    });

    for (let index = 0; index < 10 && !executionStarted; index += 1) {
      await Promise.resolve();
    }
    expect(executionStarted).toBe(true);

    cancellationRequested = true;
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(attempt).resolves.toBe('CANCELLED');
    expect(events).toEqual(['cleanup', 'complete']);
  });

  it('cleans a failed attempt without completing cancellation', async () => {
    const renderError = new Error('render failed');
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const completeCancellation = vi.fn().mockResolvedValue(undefined);
    const monitor = new RenderCancellationMonitor({
      pollCancellation: async () => false,
      cancelRender: vi.fn(),
    });

    await expect(
      runRenderAttemptWithCancellation({
        monitor,
        execute: async () => {
          throw renderError;
        },
        cleanup,
        completeCancellation,
      }),
    ).rejects.toBe(renderError);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(completeCancellation).not.toHaveBeenCalled();
  });
});
