import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export { Prisma, PrismaClient, type Project } from '../generated/prisma/client.js';
export {
  AssetNotFoundError,
  PrismaProjectRepository,
  ProjectNotFoundError,
  ProjectVersionConflictError,
  type CreateProjectRecordInput,
  type ListProjectRecordsInput,
  type ProjectRecordPage,
  type ProjectRepository,
  type ProjectAssetSynchronizationClient,
  type ProjectStatusValue,
  type ProjectSummaryRecord,
  type UpdateProjectDraftInput,
  synchronizeProjectAssetReferences,
} from './project-repository.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg(databaseUrl);

  return new PrismaClient({ adapter });
}
