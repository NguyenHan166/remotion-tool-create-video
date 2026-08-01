import type {
  RecordRenderFailureInput,
  RenderFailureDisposition,
  RenderJobRecord,
} from '@hansys/database';
import {
  classifyRenderFailure,
  getAutomaticRetryDelayMs,
  type RenderFailureClassification,
} from './render-errors.js';

export type PersistRenderFailureOptions = {
  job: Pick<RenderJobRecord, 'id' | 'attempt'>;
  workerId: string;
  error: unknown;
  diagnostic?: RecordRenderFailureInput['diagnostic'];
  recordFailure: (input: RecordRenderFailureInput) => Promise<RenderFailureDisposition>;
  now?: () => Date;
};

export type PersistedRenderFailure = Readonly<{
  failure: RenderFailureClassification;
  disposition: RenderFailureDisposition;
}>;

export async function persistRenderFailure({
  job,
  workerId,
  error,
  diagnostic,
  recordFailure,
  now = () => new Date(),
}: PersistRenderFailureOptions): Promise<PersistedRenderFailure> {
  const failure = classifyRenderFailure(error);
  const failedAt = now();
  const retryAt = new Date(failedAt.getTime() + getAutomaticRetryDelayMs(job.attempt));
  const disposition = await recordFailure({
    renderJobId: job.id,
    workerId,
    errorCode: failure.code,
    errorMessage: failure.safeMessage,
    technicalError: failure.technicalError,
    transient: failure.transient,
    ...(diagnostic === undefined ? {} : { diagnostic }),
    failedAt,
    retryAt,
  });

  return { failure, disposition };
}
