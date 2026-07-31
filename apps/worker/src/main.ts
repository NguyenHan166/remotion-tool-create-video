import { workerLifecycle, workerId } from './runtime.js';

let shutdownRequested = false;

function requestShutdown(signal: NodeJS.Signals): void {
  if (shutdownRequested) {
    return;
  }

  shutdownRequested = true;
  console.info(`Worker ${workerId} received ${signal}; stopping gracefully.`);
  void workerLifecycle.shutdown().catch((error: unknown) => {
    console.error('Worker graceful shutdown failed', error);
    process.exitCode = 1;
  });
}

const onSigint = () => requestShutdown('SIGINT');
const onSigterm = () => requestShutdown('SIGTERM');

process.once('SIGINT', onSigint);
process.once('SIGTERM', onSigterm);

try {
  await workerLifecycle.start();
  console.info(`Worker ${workerId} started.`);
  await workerLifecycle.waitUntilStopped();
} catch (error) {
  console.error('Worker startup failed', error);
  process.exitCode = 1;
} finally {
  process.off('SIGINT', onSigint);
  process.off('SIGTERM', onSigterm);
}
