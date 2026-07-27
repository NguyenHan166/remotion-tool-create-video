import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerHeartbeatLoop, type WorkerHeartbeatPayload } from '../apps/worker/src/heartbeat.js';

function createPayload(): WorkerHeartbeatPayload {
  return {
    workerId: 'worker-1',
    appVersion: '0.1.0',
    remotionVersion: '4.0.499',
    status: 'IDLE',
    currentJobId: null,
    ffmpegAvailable: true,
    browserAvailable: true,
    storageWritable: true,
    details: null,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('worker heartbeat loop', () => {
  it('publishes immediately and then at the configured interval', async () => {
    vi.useFakeTimers();
    const writeHeartbeat = vi.fn().mockResolvedValue(undefined);
    const loop = new WorkerHeartbeatLoop({
      createPayload,
      writeHeartbeat,
      intervalMs: 1_000,
    });

    await loop.start();

    expect(loop.running).toBe(true);
    expect(writeHeartbeat).toHaveBeenCalledTimes(1);
    expect(writeHeartbeat).toHaveBeenLastCalledWith(createPayload());

    await vi.advanceTimersByTimeAsync(2_000);

    expect(writeHeartbeat).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('fails startup when the initial heartbeat cannot be persisted', async () => {
    vi.useFakeTimers();
    const writeHeartbeat = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const loop = new WorkerHeartbeatLoop({
      createPayload,
      writeHeartbeat,
    });

    await expect(loop.start()).rejects.toThrow('database unavailable');
    await vi.advanceTimersByTimeAsync(10_000);

    expect(loop.running).toBe(false);
    expect(writeHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('reports a scheduled failure and continues publishing', async () => {
    vi.useFakeTimers();
    const failure = new Error('temporary failure');
    const onError = vi.fn();
    const writeHeartbeat = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const loop = new WorkerHeartbeatLoop({
      createPayload,
      writeHeartbeat,
      intervalMs: 1_000,
      onError,
    });

    await loop.start();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(onError).toHaveBeenCalledWith(failure);
    expect(writeHeartbeat).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('stops future heartbeats', async () => {
    vi.useFakeTimers();
    const writeHeartbeat = vi.fn().mockResolvedValue(undefined);
    const loop = new WorkerHeartbeatLoop({
      createPayload,
      writeHeartbeat,
      intervalMs: 1_000,
    });

    await loop.start();
    loop.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(loop.running).toBe(false);
    expect(writeHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid heartbeat intervals', () => {
    expect(
      () =>
        new WorkerHeartbeatLoop({
          createPayload,
          writeHeartbeat: vi.fn(),
          intervalMs: 0,
        }),
    ).toThrowError('Heartbeat interval must be a positive integer');
  });
});
