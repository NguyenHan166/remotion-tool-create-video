import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureBrowser } from '@remotion/renderer';

const execFileAsync = promisify(execFile);

export type WorkerDoctorCapability = 'database' | 'storage' | 'ffmpeg' | 'ffprobe' | 'browser';

export type WorkerDoctorChecks = Record<WorkerDoctorCapability, () => Promise<void>>;

export type WorkerDoctorReport = {
  healthy: boolean;
  checkedAt: Date;
  databaseAvailable: boolean;
  storageWritable: boolean;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  browserAvailable: boolean;
  errors: Partial<Record<WorkerDoctorCapability, string>>;
};

export class WorkerDoctorError extends Error {
  readonly report: WorkerDoctorReport;

  constructor(report: WorkerDoctorReport) {
    const failedCapabilities = Object.keys(report.errors).join(', ');

    super(`Worker environment doctor failed: ${failedCapabilities}.`);
    this.name = 'WorkerDoctorError';
    this.report = report;
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Capability check failed.';
}

export async function checkCommandAvailable(command: 'ffmpeg' | 'ffprobe'): Promise<void> {
  await execFileAsync(command, ['-version'], {
    timeout: 5_000,
    windowsHide: true,
  });
}

export async function checkRemotionBrowser(): Promise<void> {
  const status = await ensureBrowser({ logLevel: 'error' });

  if (status.type === 'no-browser') {
    throw new Error('Remotion browser is unavailable.');
  }

  if (status.type === 'version-mismatch') {
    throw new Error(
      `Remotion browser version mismatch${
        status.actualVersion === null ? '' : `: ${status.actualVersion}`
      }.`,
    );
  }
}

export async function runWorkerDoctor(checks: WorkerDoctorChecks): Promise<WorkerDoctorReport> {
  const capabilities = Object.keys(checks) as WorkerDoctorCapability[];
  const settledChecks = await Promise.allSettled(
    capabilities.map(async (capability) => {
      await checks[capability]();
      return capability;
    }),
  );
  const availability = new Map<WorkerDoctorCapability, boolean>();
  const errors: Partial<Record<WorkerDoctorCapability, string>> = {};

  settledChecks.forEach((result, index) => {
    const capability = capabilities[index]!;
    const available = result.status === 'fulfilled';
    availability.set(capability, available);

    if (!available) {
      errors[capability] = safeErrorMessage(result.reason);
    }
  });

  return {
    healthy: settledChecks.every((result) => result.status === 'fulfilled'),
    checkedAt: new Date(),
    databaseAvailable: availability.get('database') ?? false,
    storageWritable: availability.get('storage') ?? false,
    ffmpegAvailable: availability.get('ffmpeg') ?? false,
    ffprobeAvailable: availability.get('ffprobe') ?? false,
    browserAvailable: availability.get('browser') ?? false,
    errors,
  };
}

export function assertWorkerDoctorHealthy(report: WorkerDoctorReport): void {
  if (!report.healthy) {
    throw new WorkerDoctorError(report);
  }
}
