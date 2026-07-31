import { Prisma, type PrismaClient } from '@hansys/database';
import { type WorkerHeartbeatPayload, type WorkerHeartbeatWriter } from './heartbeat.js';

export function createPrismaWorkerHeartbeatWriter(database: PrismaClient): WorkerHeartbeatWriter {
  return async (heartbeat: WorkerHeartbeatPayload) => {
    const data = {
      appVersion: heartbeat.appVersion,
      remotionVersion: heartbeat.remotionVersion,
      status: heartbeat.status,
      currentJobId: heartbeat.currentJobId,
      ffmpegAvailable: heartbeat.ffmpegAvailable,
      browserAvailable: heartbeat.browserAvailable,
      storageWritable: heartbeat.storageWritable,
      details: heartbeat.details ?? Prisma.JsonNull,
    };

    await database.workerHeartbeat.upsert({
      where: {
        workerId: heartbeat.workerId,
      },
      create: {
        workerId: heartbeat.workerId,
        ...data,
      },
      update: data,
    });
  };
}
