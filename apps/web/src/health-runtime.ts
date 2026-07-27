import { assertStorageWritable } from '@hansys/storage';
import { database } from './database.js';
import { webServerEnvironment } from './environment.js';
import { createHealthReport, type HealthResult } from './health.js';
import { storagePaths } from './storage.js';

export async function getHealth(): Promise<HealthResult> {
  return createHealthReport({
    appVersion: webServerEnvironment.APP_VERSION,
    checkDatabase: async () => {
      await database.$queryRaw`SELECT 1`;
    },
    checkStorage: async () => {
      await assertStorageWritable(storagePaths);
    },
    getLatestWorkerHeartbeat: async () =>
      database.workerHeartbeat.findFirst({
        orderBy: {
          lastSeenAt: 'desc',
        },
        select: {
          workerId: true,
          appVersion: true,
          remotionVersion: true,
          status: true,
          currentJobId: true,
          ffmpegAvailable: true,
          browserAvailable: true,
          storageWritable: true,
          startedAt: true,
          lastSeenAt: true,
        },
      }),
  });
}
