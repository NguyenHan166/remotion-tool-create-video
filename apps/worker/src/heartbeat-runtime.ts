import { hostname } from 'node:os';
import { createRequire } from 'node:module';
import { Prisma } from '@hansys/database';
import { database } from './database.js';
import { workerServerEnvironment } from './environment.js';
import { WorkerHeartbeatLoop, type WorkerHeartbeatPayload } from './heartbeat.js';
import './storage.js';

const require = createRequire(import.meta.url);
const rendererManifest = require('@remotion/renderer/package.json') as { version: string };

function createHeartbeatPayload(): WorkerHeartbeatPayload {
  return {
    workerId: `${hostname()}:${process.pid}`,
    appVersion: workerServerEnvironment.APP_VERSION,
    remotionVersion: rendererManifest.version,
    status: 'IDLE',
    currentJobId: null,
    ffmpegAvailable: false,
    browserAvailable: false,
    storageWritable: true,
    details: {
      capabilityChecks: 'pending-environment-doctor',
    },
  };
}

export const workerHeartbeatLoop = new WorkerHeartbeatLoop({
  createPayload: createHeartbeatPayload,
  writeHeartbeat: async (heartbeat) => {
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
  },
  onError: (error) => {
    console.error('Failed to publish worker heartbeat', error);
  },
});

await workerHeartbeatLoop.start();
