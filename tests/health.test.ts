import { describe, expect, it, vi } from 'vitest';
import {
  createHealthReport,
  type HealthDependencies,
  type HealthResult,
  type WorkerHeartbeatSnapshot,
} from '../apps/web/src/health.js';
import { createHealthHandler } from '../apps/web/src/health-handler.js';

const now = new Date('2026-07-27T08:00:00.000Z');

function createHeartbeat(
  overrides: Partial<WorkerHeartbeatSnapshot> = {},
): WorkerHeartbeatSnapshot {
  return {
    workerId: 'worker-1',
    appVersion: '0.1.0',
    remotionVersion: '4.0.499',
    status: 'IDLE',
    currentJobId: null,
    ffmpegAvailable: true,
    browserAvailable: true,
    storageWritable: true,
    startedAt: new Date('2026-07-27T07:00:00.000Z'),
    lastSeenAt: new Date('2026-07-27T07:59:55.000Z'),
    ...overrides,
  };
}

function createDependencies(overrides: Partial<HealthDependencies> = {}): HealthDependencies {
  return {
    appVersion: '0.1.0',
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    checkStorage: vi.fn().mockResolvedValue(undefined),
    getLatestWorkerHeartbeat: vi.fn().mockResolvedValue(createHeartbeat()),
    now: () => now,
    ...overrides,
  };
}

describe('web health reporting', () => {
  it('reports healthy core dependencies and a recent capable worker', async () => {
    const result = await createHealthReport(createDependencies());

    expect(result).toEqual({
      statusCode: 200,
      body: {
        status: 'ok',
        appVersion: '0.1.0',
        database: 'ok',
        storage: 'ok',
        worker: 'online',
        workerDetails: {
          workerId: 'worker-1',
          appVersion: '0.1.0',
          remotionVersion: '4.0.499',
          status: 'IDLE',
          currentJobId: null,
          ffmpegAvailable: true,
          browserAvailable: true,
          storageWritable: true,
          startedAt: '2026-07-27T07:00:00.000Z',
          lastSeenAt: '2026-07-27T07:59:55.000Z',
        },
        checkedAt: '2026-07-27T08:00:00.000Z',
      },
    });
  });

  it('returns 503 and an unknown worker when the database is unavailable', async () => {
    const getLatestWorkerHeartbeat = vi.fn().mockResolvedValue(createHeartbeat());
    const result = await createHealthReport(
      createDependencies({
        checkDatabase: vi.fn().mockRejectedValue(new Error('connection refused')),
        getLatestWorkerHeartbeat,
      }),
    );

    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      status: 'degraded',
      database: 'error',
      storage: 'ok',
      worker: 'unknown',
      workerDetails: null,
    });
    expect(getLatestWorkerHeartbeat).not.toHaveBeenCalled();
  });

  it('returns 503 when storage is not writable', async () => {
    const result = await createHealthReport(
      createDependencies({
        checkStorage: vi.fn().mockRejectedValue(new Error('read only')),
      }),
    );

    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      status: 'degraded',
      database: 'ok',
      storage: 'error',
      worker: 'online',
    });
  });

  it('reports a stale heartbeat as offline without failing core web health', async () => {
    const result = await createHealthReport(
      createDependencies({
        getLatestWorkerHeartbeat: vi
          .fn()
          .mockResolvedValue(createHeartbeat({ lastSeenAt: new Date('2026-07-27T07:59:30.000Z') })),
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      status: 'degraded',
      database: 'ok',
      storage: 'ok',
      worker: 'offline',
    });
  });

  it('reports missing and unhealthy worker capabilities as degraded', async () => {
    const noWorker = await createHealthReport(
      createDependencies({
        getLatestWorkerHeartbeat: vi.fn().mockResolvedValue(null),
      }),
    );
    const incapableWorker = await createHealthReport(
      createDependencies({
        getLatestWorkerHeartbeat: vi
          .fn()
          .mockResolvedValue(createHeartbeat({ browserAvailable: false })),
      }),
    );

    expect(noWorker.statusCode).toBe(200);
    expect(noWorker.body).toMatchObject({
      status: 'degraded',
      worker: 'unknown',
      workerDetails: null,
    });
    expect(incapableWorker.statusCode).toBe(200);
    expect(incapableWorker.body).toMatchObject({
      status: 'degraded',
      worker: 'online',
      workerDetails: {
        ffmpegAvailable: true,
        browserAvailable: false,
      },
    });
  });

  it('treats a failed heartbeat query as a database failure', async () => {
    const result = await createHealthReport(
      createDependencies({
        getLatestWorkerHeartbeat: vi.fn().mockRejectedValue(new Error('query failed')),
      }),
    );

    expect(result.statusCode).toBe(503);
    expect(result.body).toMatchObject({
      status: 'degraded',
      database: 'error',
      worker: 'unknown',
    });
  });
});

describe('health endpoint handler', () => {
  it('returns the report body, status code and no-store policy', async () => {
    const healthResult: HealthResult = {
      statusCode: 503,
      body: {
        status: 'degraded',
        appVersion: '0.1.0',
        database: 'error',
        storage: 'ok',
        worker: 'unknown',
        workerDetails: null,
        checkedAt: '2026-07-27T08:00:00.000Z',
      },
    };
    const handler = createHealthHandler(vi.fn().mockResolvedValue(healthResult));

    const response = await handler();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(healthResult.body);
  });
});
