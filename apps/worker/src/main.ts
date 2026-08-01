import { workerLifecycle, workerLogger } from './runtime.js';

let shutdownRequested = false;

function requestShutdown(signal: NodeJS.Signals): void {
  if (shutdownRequested) {
    return;
  }

  shutdownRequested = true;
  workerLogger.info('worker.shutdown_requested', { signal });
  void workerLifecycle.shutdown().catch((error: unknown) => {
    workerLogger.error('worker.graceful_shutdown_failed', {}, error);
    process.exitCode = 1;
  });
}

const onSigint = () => requestShutdown('SIGINT');
const onSigterm = () => requestShutdown('SIGTERM');

process.once('SIGINT', onSigint);
process.once('SIGTERM', onSigterm);

try {
  await workerLifecycle.start();
  workerLogger.info('worker.started');
  await workerLifecycle.waitUntilStopped();
} catch (error) {
  workerLogger.error('worker.startup_failed', {}, error);
  process.exitCode = 1;
} finally {
  process.off('SIGINT', onSigint);
  process.off('SIGTERM', onSigterm);
}
