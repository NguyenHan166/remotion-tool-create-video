export const DEFAULT_WORKER_OFFLINE_AFTER_MS = 15_000;

export type WorkerStatus = 'IDLE' | 'BUSY' | 'STOPPING' | 'UNHEALTHY';

export type WorkerHeartbeatSnapshot = {
  workerId: string;
  appVersion: string;
  remotionVersion: string;
  status: WorkerStatus;
  currentJobId: string | null;
  ffmpegAvailable: boolean;
  browserAvailable: boolean;
  storageWritable: boolean;
  startedAt: Date;
  lastSeenAt: Date;
};

export type WorkerHealthDetails = {
  workerId: string;
  appVersion: string;
  remotionVersion: string;
  status: WorkerStatus;
  currentJobId: string | null;
  ffmpegAvailable: boolean;
  browserAvailable: boolean;
  storageWritable: boolean;
  startedAt: string;
  lastSeenAt: string;
};

export type HealthReport = {
  status: 'ok' | 'degraded';
  appVersion: string;
  database: 'ok' | 'error';
  storage: 'ok' | 'error';
  worker: 'online' | 'offline' | 'unknown';
  workerDetails: WorkerHealthDetails | null;
  checkedAt: string;
};

export type HealthResult = {
  statusCode: 200 | 503;
  body: HealthReport;
};

export type HealthDependencies = {
  appVersion: string;
  checkDatabase: () => Promise<void>;
  checkStorage: () => Promise<void>;
  getLatestWorkerHeartbeat: () => Promise<WorkerHeartbeatSnapshot | null>;
  now?: () => Date;
  workerOfflineAfterMs?: number;
};

type DependencyResult = 'ok' | 'error';

async function checkDependency(check: () => Promise<void>): Promise<DependencyResult> {
  try {
    await check();

    return 'ok';
  } catch {
    return 'error';
  }
}

function createWorkerDetails(heartbeat: WorkerHeartbeatSnapshot): WorkerHealthDetails {
  return {
    ...heartbeat,
    startedAt: heartbeat.startedAt.toISOString(),
    lastSeenAt: heartbeat.lastSeenAt.toISOString(),
  };
}

export async function createHealthReport({
  appVersion,
  checkDatabase,
  checkStorage,
  getLatestWorkerHeartbeat,
  now = () => new Date(),
  workerOfflineAfterMs = DEFAULT_WORKER_OFFLINE_AFTER_MS,
}: HealthDependencies): Promise<HealthResult> {
  const [database, storage] = await Promise.all([
    checkDependency(checkDatabase),
    checkDependency(checkStorage),
  ]);

  let heartbeat: WorkerHeartbeatSnapshot | null = null;
  let heartbeatQuerySucceeded = database === 'ok';

  if (database === 'ok') {
    try {
      heartbeat = await getLatestWorkerHeartbeat();
    } catch {
      heartbeatQuerySucceeded = false;
    }
  }

  const databaseStatus = database === 'ok' && heartbeatQuerySucceeded ? 'ok' : 'error';
  const workerDetails = heartbeat === null ? null : createWorkerDetails(heartbeat);
  const checkedAt = now();
  const worker =
    heartbeat === null
      ? 'unknown'
      : checkedAt.getTime() - heartbeat.lastSeenAt.getTime() <= workerOfflineAfterMs
        ? 'online'
        : 'offline';
  const coreHealthy = databaseStatus === 'ok' && storage === 'ok';
  const workerHealthy =
    worker === 'online' &&
    heartbeat?.status !== 'UNHEALTHY' &&
    heartbeat?.ffmpegAvailable === true &&
    heartbeat.browserAvailable &&
    heartbeat.storageWritable;

  return {
    statusCode: coreHealthy ? 200 : 503,
    body: {
      status: coreHealthy && workerHealthy ? 'ok' : 'degraded',
      appVersion,
      database: databaseStatus,
      storage,
      worker,
      workerDetails,
      checkedAt: checkedAt.toISOString(),
    },
  };
}
