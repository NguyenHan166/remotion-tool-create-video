import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import type {
  OutputKind,
  PrismaClient,
  RenderJob,
  RenderOutput,
  RenderStatus,
} from '../generated/prisma/client.js';

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
