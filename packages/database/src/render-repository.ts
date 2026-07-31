import { randomUUID } from 'node:crypto';
import { extractProjectAssetIds, migrateProjectDocument } from '@hansys/project-schema';
import { Prisma } from '../generated/prisma/client.js';
import type {
  AssetStatus,
  OutputKind,
  PrismaClient,
  RenderJob,
  RenderOutput,
  RenderStatus,
} from '../generated/prisma/client.js';
import { computeProjectContentHash } from './project-content-hash.js';
import { AssetNotFoundError, ProjectNotFoundError } from './project-repository.js';

export type RenderJobRecord = RenderJob & {
  outputs: RenderOutput[];
};

export type ListRenderJobsInput = {
  page: number;
  pageSize: number;
  projectId?: string;
  status?: RenderStatus;
};

export type RenderJobRecordPage = {
  items: RenderJobRecord[];
  total: number;
};

export type TransitionRenderJobInput = {
  renderJobId: string;
  nextStatus: RenderStatus;
};

export type EnqueueRenderJobInput = {
  projectId: string;
  preset: string;
  validateDraft: (document: ReturnType<typeof migrateProjectDocument>) => void;
};

export type RenderAssetState = {
  id: string;
  status: AssetStatus;
};

export type CreateRenderOutputInput = {
  id?: string;
  renderJobId: string;
  kind: OutputKind;
  relativePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  width?: number;
  height?: number;
  durationMs?: bigint;
  metadata?: Prisma.InputJsonValue;
};

const renderStatusTransitions = {
  QUEUED: ['PREPARING', 'CANCEL_REQUESTED'],
  PREPARING: ['BUNDLING', 'FAILED', 'CANCEL_REQUESTED'],
  BUNDLING: ['RENDERING', 'FAILED', 'CANCEL_REQUESTED'],
  RENDERING: ['ENCODING', 'FAILED', 'CANCEL_REQUESTED'],
  ENCODING: ['COMPLETED', 'FAILED', 'CANCEL_REQUESTED'],
  COMPLETED: [],
  FAILED: ['QUEUED'],
  CANCEL_REQUESTED: ['CANCELLED'],
  CANCELLED: ['QUEUED'],
} as const satisfies Record<RenderStatus, readonly RenderStatus[]>;

export class RenderJobNotFoundError extends Error {
  readonly code = 'RENDER_NOT_FOUND';
  readonly renderJobId: string;

  constructor(renderJobId: string) {
    super('Render job not found.');
    this.name = 'RenderJobNotFoundError';
    this.renderJobId = renderJobId;
  }
}

export class InvalidRenderStatusTransitionError extends Error {
  readonly code = 'RENDER_INVALID_STATE';
  readonly renderJobId: string;
  readonly currentStatus: RenderStatus;
  readonly nextStatus: RenderStatus;

  constructor(renderJobId: string, currentStatus: RenderStatus, nextStatus: RenderStatus) {
    super(`Render job cannot transition from ${currentStatus} to ${nextStatus}.`);
    this.name = 'InvalidRenderStatusTransitionError';
    this.renderJobId = renderJobId;
    this.currentStatus = currentStatus;
    this.nextStatus = nextStatus;
  }
}

export class RenderAssetNotReadyError extends Error {
  readonly code = 'ASSET_NOT_READY';
  readonly assetIds: readonly string[];

  constructor(assetIds: readonly string[]) {
    super(`Referenced assets are not ready: ${assetIds.join(', ')}`);
    this.name = 'RenderAssetNotReadyError';
    this.assetIds = assetIds;
  }
}

export class ProjectNotRenderableError extends Error {
  readonly code = 'RENDER_INVALID_STATE';
  readonly projectId: string;

  constructor(projectId: string) {
    super('Archived projects cannot create render jobs.');
    this.name = 'ProjectNotRenderableError';
    this.projectId = projectId;
  }
}

export function assertRenderAssetsReady(
  assetIds: readonly string[],
  assets: readonly RenderAssetState[],
): void {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const missingAssetIds = assetIds.filter((assetId) => {
    const asset = assetsById.get(assetId);

    return asset === undefined || asset.status === 'DELETED';
  });

  if (missingAssetIds.length > 0) {
    throw new AssetNotFoundError(missingAssetIds);
  }

  const notReadyAssetIds = assetIds.filter(
    (assetId) => assetsById.get(assetId)?.status !== 'READY',
  );

  if (notReadyAssetIds.length > 0) {
    throw new RenderAssetNotReadyError(notReadyAssetIds);
  }
}

export function canTransitionRenderStatus(
  currentStatus: RenderStatus,
  nextStatus: RenderStatus,
): boolean {
  return (renderStatusTransitions[currentStatus] as readonly RenderStatus[]).includes(nextStatus);
}

export function assertRenderStatusTransition(
  renderJobId: string,
  currentStatus: RenderStatus,
  nextStatus: RenderStatus,
): void {
  if (!canTransitionRenderStatus(currentStatus, nextStatus)) {
    throw new InvalidRenderStatusTransitionError(renderJobId, currentStatus, nextStatus);
  }
}

export interface RenderJobRepository {
  enqueue(input: EnqueueRenderJobInput): Promise<RenderJobRecord>;
  findById(renderJobId: string): Promise<RenderJobRecord | null>;
  list(input: ListRenderJobsInput): Promise<RenderJobRecordPage>;
  transitionStatus(input: TransitionRenderJobInput): Promise<RenderJobRecord>;
}

export interface RenderOutputRepository {
  create(input: CreateRenderOutputInput): Promise<RenderOutput>;
  findById(renderOutputId: string): Promise<RenderOutput | null>;
  listByRenderJobId(renderJobId: string): Promise<RenderOutput[]>;
}

const renderJobWithOutputs = {
  outputs: {
    orderBy: {
      createdAt: 'asc',
    },
  },
} as const;

export class PrismaRenderJobRepository implements RenderJobRepository {
  readonly #database: PrismaClient;

  constructor(database: PrismaClient) {
    this.#database = database;
  }

  async enqueue({
    projectId,
    preset,
    validateDraft,
  }: EnqueueRenderJobInput): Promise<RenderJobRecord> {
    return this.#database.$transaction(async (transaction) => {
      const lockedProjects = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "Project"
          WHERE "id" = ${projectId}::uuid
          FOR UPDATE
        `,
      );

      if (lockedProjects.length === 0) {
        throw new ProjectNotFoundError(projectId);
      }

      const project = await transaction.project.findUniqueOrThrow({
        where: {
          id: projectId,
        },
      });

      if (project.status !== 'DRAFT') {
        throw new ProjectNotRenderableError(projectId);
      }

      const document = migrateProjectDocument(project.draftDocument);
      validateDraft(document);

      const assetIds = [...new Set(extractProjectAssetIds(document))];
      const assets =
        assetIds.length === 0
          ? []
          : await transaction.asset.findMany({
              where: {
                id: {
                  in: assetIds,
                },
              },
              select: {
                id: true,
                status: true,
              },
            });
      assertRenderAssetsReady(assetIds, assets);

      const latestRevision = await transaction.projectRevision.findFirst({
        where: {
          projectId,
        },
        orderBy: {
          revisionNumber: 'desc',
        },
        select: {
          revisionNumber: true,
        },
      });
      const revision = await transaction.projectRevision.create({
        data: {
          projectId,
          revisionNumber: (latestRevision?.revisionNumber ?? 0) + 1,
          schemaVersion: document.schemaVersion,
          templateId: document.template.id,
          templateVersion: document.template.version,
          contentHash: computeProjectContentHash(document),
          document: JSON.parse(JSON.stringify(document)) as Prisma.InputJsonValue,
        },
      });

      if (assetIds.length > 0) {
        await transaction.revisionAsset.createMany({
          data: assetIds.map((assetId) => ({
            revisionId: revision.id,
            assetId,
          })),
        });
      }

      return transaction.renderJob.create({
        data: {
          projectId,
          revisionId: revision.id,
          preset,
        },
        include: renderJobWithOutputs,
      });
    });
  }

  async findById(renderJobId: string): Promise<RenderJobRecord | null> {
    return this.#database.renderJob.findUnique({
      where: {
        id: renderJobId,
      },
      include: renderJobWithOutputs,
    });
  }

  async list({
    page,
    pageSize,
    projectId,
    status,
  }: ListRenderJobsInput): Promise<RenderJobRecordPage> {
    const where: Prisma.RenderJobWhereInput = {
      ...(projectId === undefined ? {} : { projectId }),
      ...(status === undefined ? {} : { status }),
    };
    const [items, total] = await this.#database.$transaction([
      this.#database.renderJob.findMany({
        where,
        include: renderJobWithOutputs,
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.#database.renderJob.count({ where }),
    ]);

    return {
      items,
      total,
    };
  }

  async transitionStatus({
    renderJobId,
    nextStatus,
  }: TransitionRenderJobInput): Promise<RenderJobRecord> {
    return this.#database.$transaction(async (transaction) => {
      const jobs = await transaction.$queryRaw<Array<{ status: RenderStatus }>>(
        Prisma.sql`
          SELECT status
          FROM "RenderJob"
          WHERE id = ${renderJobId}::uuid
          FOR UPDATE
        `,
      );
      const currentStatus = jobs[0]?.status;

      if (currentStatus === undefined) {
        throw new RenderJobNotFoundError(renderJobId);
      }

      assertRenderStatusTransition(renderJobId, currentStatus, nextStatus);

      return transaction.renderJob.update({
        where: {
          id: renderJobId,
        },
        data: {
          status: nextStatus,
        },
        include: renderJobWithOutputs,
      });
    });
  }
}

export class PrismaRenderOutputRepository implements RenderOutputRepository {
  readonly #database: PrismaClient;
  readonly #createId: () => string;

  constructor(database: PrismaClient, createId: () => string = randomUUID) {
    this.#database = database;
    this.#createId = createId;
  }

  async create(input: CreateRenderOutputInput): Promise<RenderOutput> {
    return this.#database.renderOutput.create({
      data: {
        id: input.id ?? this.#createId(),
        renderJobId: input.renderJobId,
        kind: input.kind,
        relativePath: input.relativePath,
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        ...(input.width === undefined ? {} : { width: input.width }),
        ...(input.height === undefined ? {} : { height: input.height }),
        ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
      },
    });
  }

  async findById(renderOutputId: string): Promise<RenderOutput | null> {
    return this.#database.renderOutput.findUnique({
      where: {
        id: renderOutputId,
      },
    });
  }

  async listByRenderJobId(renderJobId: string): Promise<RenderOutput[]> {
    return this.#database.renderOutput.findMany({
      where: {
        renderJobId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }
}
