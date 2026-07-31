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

export type RenderProgressStatus = Extract<RenderStatus, 'BUNDLING' | 'RENDERING' | 'ENCODING'>;

export type UpdateRenderJobProgressInput = {
  renderJobId: string;
  workerId: string;
  status: RenderProgressStatus;
  progress: number;
  renderedFrames?: number;
  encodedFrames?: number;
  totalFrames?: number;
  stageMessage: string;
  heartbeatAt?: Date;
};

export type RenderCancellationCheckInput = {
  renderJobId: string;
  workerId: string;
};

export type CompleteRenderCancellationInput = RenderCancellationCheckInput & {
  finishedAt?: Date;
};

export type EnqueueRenderJobInput = {
  projectId: string;
  preset: string;
  validateDraft: (document: ReturnType<typeof migrateProjectDocument>) => void;
};

export type RecoverStaleRenderJobsInput = {
  staleBefore: Date;
  recoveredAt?: Date;
  cleanupAttempt?: (renderJobId: string) => Promise<void>;
};

export type StaleRenderRecoveryResult = {
  retriedJobIds: string[];
  failedJobIds: string[];
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

export class RenderJobProgressRejectedError extends Error {
  readonly code = 'RENDER_PROGRESS_REJECTED';
  readonly renderJobId: string;

  constructor(renderJobId: string) {
    super('Render progress was rejected because the job owner or state changed.');
    this.name = 'RenderJobProgressRejectedError';
    this.renderJobId = renderJobId;
  }
}

export class RenderJobCancellationRejectedError extends Error {
  readonly code = 'RENDER_CANCELLATION_REJECTED';
  readonly renderJobId: string;

  constructor(renderJobId: string) {
    super('Render cancellation was rejected because the job owner or state changed.');
    this.name = 'RenderJobCancellationRejectedError';
    this.renderJobId = renderJobId;
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

export function assertRenderWorkerId(workerId: string): void {
  if (workerId.trim().length === 0 || workerId.length > 200) {
    throw new RangeError('Worker ID must contain 1 to 200 characters.');
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
  claimNext(workerId: string): Promise<RenderJobRecord | null>;
  recoverStale(input: RecoverStaleRenderJobsInput): Promise<StaleRenderRecoveryResult>;
  requestCancellation(renderJobId: string): Promise<RenderJobRecord>;
  isCancellationRequested(input: RenderCancellationCheckInput): Promise<boolean>;
  completeCancellation(input: CompleteRenderCancellationInput): Promise<RenderJobRecord>;
  updateProgress(input: UpdateRenderJobProgressInput): Promise<void>;
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

  async claimNext(workerId: string): Promise<RenderJobRecord | null> {
    assertRenderWorkerId(workerId);

    return this.#database.$transaction(async (transaction) => {
      const claimedJobs = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          WITH "claimableJob" AS (
            SELECT "id"
            FROM "RenderJob"
            WHERE "status" = 'QUEUED'::"RenderStatus"
              AND "availableAt" <= NOW()
              AND "attempt" < "maxAttempts"
            ORDER BY "priority" DESC, "createdAt" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE "RenderJob" AS job
          SET
            "status" = 'PREPARING'::"RenderStatus",
            "workerId" = ${workerId},
            "attempt" = job."attempt" + 1,
            "startedAt" = COALESCE(job."startedAt", NOW()),
            "heartbeatAt" = NOW(),
            "updatedAt" = NOW()
          FROM "claimableJob"
          WHERE job."id" = "claimableJob"."id"
          RETURNING job."id"
        `,
      );
      const claimedJobId = claimedJobs[0]?.id;

      if (claimedJobId === undefined) {
        return null;
      }

      return transaction.renderJob.findUniqueOrThrow({
        where: {
          id: claimedJobId,
        },
        include: renderJobWithOutputs,
      });
    });
  }

  async recoverStale({
    staleBefore,
    recoveredAt = new Date(),
    cleanupAttempt = async () => undefined,
  }: RecoverStaleRenderJobsInput): Promise<StaleRenderRecoveryResult> {
    if (Number.isNaN(staleBefore.getTime()) || Number.isNaN(recoveredAt.getTime())) {
      throw new RangeError('Stale recovery timestamps must be valid dates.');
    }

    return this.#database.$transaction(async (transaction) => {
      const staleJobs = await transaction.$queryRaw<
        Array<{
          id: string;
          attempt: number;
          maxAttempts: number;
          workerId: string | null;
        }>
      >(
        Prisma.sql`
          SELECT "id", "attempt", "maxAttempts", "workerId"
          FROM "RenderJob"
          WHERE "status" IN (
            'PREPARING'::"RenderStatus",
            'BUNDLING'::"RenderStatus",
            'RENDERING'::"RenderStatus",
            'ENCODING'::"RenderStatus"
          )
            AND "heartbeatAt" < ${staleBefore}
          ORDER BY "heartbeatAt" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
        `,
      );

      await Promise.all(staleJobs.map(({ id }) => cleanupAttempt(id)));

      const retriedJobIds: string[] = [];
      const failedJobIds: string[] = [];

      for (const job of staleJobs) {
        if (job.attempt < job.maxAttempts) {
          await transaction.renderJob.update({
            where: {
              id: job.id,
            },
            data: {
              status: 'QUEUED',
              progress: 0,
              renderedFrames: null,
              encodedFrames: null,
              totalFrames: null,
              stageMessage: 'Recovered after worker heartbeat expired.',
              workerId: null,
              errorCode: null,
              errorMessage: null,
              technicalError: null,
              availableAt: recoveredAt,
              heartbeatAt: null,
              finishedAt: null,
            },
          });
          retriedJobIds.push(job.id);
          continue;
        }

        await transaction.renderJob.update({
          where: {
            id: job.id,
          },
          data: {
            status: 'FAILED',
            stageMessage: 'Worker heartbeat expired.',
            workerId: null,
            errorCode: 'WORKER_LOST',
            errorMessage: 'The render worker stopped responding.',
            technicalError:
              job.workerId === null
                ? 'The claimed worker heartbeat expired.'
                : `Worker ${job.workerId} heartbeat expired.`,
            finishedAt: recoveredAt,
          },
        });
        failedJobIds.push(job.id);
      }

      return {
        retriedJobIds,
        failedJobIds,
      };
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

  async requestCancellation(renderJobId: string): Promise<RenderJobRecord> {
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

      if (currentStatus === 'CANCEL_REQUESTED') {
        return transaction.renderJob.findUniqueOrThrow({
          where: { id: renderJobId },
          include: renderJobWithOutputs,
        });
      }

      assertRenderStatusTransition(renderJobId, currentStatus, 'CANCEL_REQUESTED');
      await transaction.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: 'CANCEL_REQUESTED',
          stageMessage: 'Cancellation requested.',
        },
      });

      if (currentStatus !== 'QUEUED') {
        return transaction.renderJob.findUniqueOrThrow({
          where: { id: renderJobId },
          include: renderJobWithOutputs,
        });
      }

      return transaction.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: 'CANCELLED',
          stageMessage: 'Render cancelled before execution.',
          workerId: null,
          heartbeatAt: null,
          finishedAt: new Date(),
        },
        include: renderJobWithOutputs,
      });
    });
  }

  async isCancellationRequested({
    renderJobId,
    workerId,
  }: RenderCancellationCheckInput): Promise<boolean> {
    assertRenderWorkerId(workerId);
    const job = await this.#database.renderJob.findUnique({
      where: { id: renderJobId },
      select: {
        status: true,
        workerId: true,
      },
    });

    return job?.status === 'CANCEL_REQUESTED' && job.workerId === workerId;
  }

  async completeCancellation({
    renderJobId,
    workerId,
    finishedAt = new Date(),
  }: CompleteRenderCancellationInput): Promise<RenderJobRecord> {
    assertRenderWorkerId(workerId);

    if (Number.isNaN(finishedAt.getTime())) {
      throw new RangeError('Render cancellation timestamp must be a valid date.');
    }

    const updated = await this.#database.renderJob.updateMany({
      where: {
        id: renderJobId,
        workerId,
        status: 'CANCEL_REQUESTED',
      },
      data: {
        status: 'CANCELLED',
        stageMessage: 'Render cancelled.',
        heartbeatAt: finishedAt,
        finishedAt,
      },
    });

    if (updated.count !== 1) {
      throw new RenderJobCancellationRejectedError(renderJobId);
    }

    return this.#database.renderJob.findUniqueOrThrow({
      where: { id: renderJobId },
      include: renderJobWithOutputs,
    });
  }

  async updateProgress({
    renderJobId,
    workerId,
    status,
    progress,
    renderedFrames,
    encodedFrames,
    totalFrames,
    stageMessage,
    heartbeatAt = new Date(),
  }: UpdateRenderJobProgressInput): Promise<void> {
    assertRenderWorkerId(workerId);

    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError('Render progress must be a finite number from 0 to 1.');
    }

    if (stageMessage.length > 500) {
      throw new RangeError('Render stage message must not exceed 500 characters.');
    }

    if (Number.isNaN(heartbeatAt.getTime())) {
      throw new RangeError('Render heartbeat timestamp must be a valid date.');
    }

    const frameValues = [renderedFrames, encodedFrames];

    if (
      frameValues.some(
        (value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0),
      ) ||
      (totalFrames !== undefined && (!Number.isSafeInteger(totalFrames) || totalFrames <= 0)) ||
      (totalFrames !== undefined &&
        frameValues.some((value) => value !== undefined && value > totalFrames))
    ) {
      throw new RangeError(
        'Render frame counters must be safe integers within the total frame count.',
      );
    }

    const allowedCurrentStatuses = {
      BUNDLING: ['PREPARING', 'BUNDLING'],
      RENDERING: ['BUNDLING', 'RENDERING'],
      ENCODING: ['RENDERING', 'ENCODING'],
    } as const satisfies Record<RenderProgressStatus, readonly RenderStatus[]>;
    const frameCounterGuards: Prisma.RenderJobWhereInput[] = [];

    if (renderedFrames !== undefined) {
      frameCounterGuards.push({
        OR: [{ renderedFrames: null }, { renderedFrames: { lte: renderedFrames } }],
      });
    }

    if (encodedFrames !== undefined) {
      frameCounterGuards.push({
        OR: [{ encodedFrames: null }, { encodedFrames: { lte: encodedFrames } }],
      });
    }

    if (totalFrames !== undefined) {
      frameCounterGuards.push({
        OR: [{ totalFrames: null }, { totalFrames }],
      });
    }

    const update = await this.#database.renderJob.updateMany({
      where: {
        id: renderJobId,
        workerId,
        status: {
          in: [...allowedCurrentStatuses[status]],
        },
        progress: {
          lte: progress,
        },
        ...(frameCounterGuards.length === 0 ? {} : { AND: frameCounterGuards }),
      },
      data: {
        status,
        progress,
        stageMessage,
        heartbeatAt,
        ...(renderedFrames === undefined ? {} : { renderedFrames }),
        ...(encodedFrames === undefined ? {} : { encodedFrames }),
        ...(totalFrames === undefined ? {} : { totalFrames }),
      },
    });

    if (update.count !== 1) {
      throw new RenderJobProgressRejectedError(renderJobId);
    }
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
