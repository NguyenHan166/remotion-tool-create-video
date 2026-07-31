import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export {
  type Asset,
  type AssetKind,
  type AssetStatus,
  Prisma,
  PrismaClient,
  type Project,
  type ProjectRevision,
  type RenderJob,
  type RenderOutput,
  type RenderStatus,
  type OutputKind,
} from '../generated/prisma/client.js';
export {
  AssetInUseError,
  PrismaAssetRepository,
  type AssetRecordPage,
  type AssetRepository,
  type CreateAssetRecordInput,
  type ListAssetRecordsInput,
  type MarkAssetFailedInput,
  type MarkAssetReadyInput,
} from './asset-repository.js';
export { computeProjectContentHash } from './project-content-hash.js';
export {
  PrismaRenderRevisionRepository,
  type RenderRevisionAssetRecord,
  type RenderRevisionRepository,
  type RenderRevisionSnapshotRecord,
} from './render-revision-repository.js';
export {
  AssetNotFoundError,
  PrismaProjectRepository,
  ProjectNotFoundError,
  ProjectVersionConflictError,
  type CreateProjectRecordInput,
  type ListProjectRecordsInput,
  type ProjectRecordPage,
  type ProjectRepository,
  type ProjectRevisionRecord,
  type ProjectAssetSynchronizationClient,
  type ProjectStatusValue,
  type ProjectSummaryRecord,
  type UpdateProjectDraftInput,
  synchronizeProjectAssetReferences,
} from './project-repository.js';
export {
  InvalidRenderStatusTransitionError,
  PrismaRenderJobRepository,
  PrismaRenderOutputRepository,
  ProjectNotRenderableError,
  RenderAssetNotReadyError,
  RenderJobCancellationRejectedError,
  RenderJobFailureRejectedError,
  RenderJobProgressRejectedError,
  RenderJobNotFoundError,
  assertRenderAssetsReady,
  assertRenderWorkerId,
  assertRenderStatusTransition,
  canTransitionRenderStatus,
  type CreateRenderOutputInput,
  type EnqueueRenderJobInput,
  type CompleteRenderCancellationInput,
  type ListRenderJobsInput,
  type RecoverStaleRenderJobsInput,
  type RecordRenderFailureInput,
  type RenderAssetState,
  type RenderJobRecord,
  type RenderJobRecordPage,
  type RenderJobRepository,
  type RenderFailureDisposition,
  type RenderCancellationCheckInput,
  type RenderProgressStatus,
  type RenderOutputRepository,
  type StaleRenderRecoveryResult,
  type TransitionRenderJobInput,
  type UpdateRenderJobProgressInput,
} from './render-repository.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg(databaseUrl);

  return new PrismaClient({ adapter });
}
