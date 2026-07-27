import type { Prisma, PrismaClient, Project } from '../generated/prisma/client.js';

export type ProjectStatusValue = 'DRAFT' | 'ARCHIVED';

export type CreateProjectRecordInput = {
  name: string;
  description: string | null;
  draftDocument: unknown;
};

export type ListProjectRecordsInput = {
  page: number;
  pageSize: number;
  search?: string;
  status?: ProjectStatusValue;
};

export type ProjectSummaryRecord = Pick<Project, 'id' | 'name' | 'status' | 'updatedAt'>;

export type ProjectRecordPage = {
  items: ProjectSummaryRecord[];
  total: number;
};

export type UpdateProjectDraftInput = {
  projectId: string;
  expectedDraftVersion: number;
  name?: string;
  draftDocument: unknown;
};

export interface ProjectRepository {
  create(input: CreateProjectRecordInput): Promise<Project>;
  list(input: ListProjectRecordsInput): Promise<ProjectRecordPage>;
  findById(projectId: string): Promise<Project | null>;
  updateDraft(input: UpdateProjectDraftInput): Promise<Project>;
  archive(projectId: string): Promise<Project>;
}

export class ProjectNotFoundError extends Error {
  readonly code = 'PROJECT_NOT_FOUND';
  readonly projectId: string;

  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = 'ProjectNotFoundError';
    this.projectId = projectId;
  }
}

export class ProjectVersionConflictError extends Error {
  readonly code = 'PROJECT_VERSION_CONFLICT';
  readonly projectId: string;
  readonly expectedDraftVersion: number;
  readonly actualDraftVersion: number;

  constructor(projectId: string, expectedDraftVersion: number, actualDraftVersion: number) {
    super(
      `Project ${projectId} draft version conflict: expected ${expectedDraftVersion}, current version is ${actualDraftVersion}.`,
    );
    this.name = 'ProjectVersionConflictError';
    this.projectId = projectId;
    this.expectedDraftVersion = expectedDraftVersion;
    this.actualDraftVersion = actualDraftVersion;
  }
}

function serializeJson(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError('Project document must be JSON serializable');
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export class PrismaProjectRepository implements ProjectRepository {
  readonly #database: PrismaClient;

  constructor(database: PrismaClient) {
    this.#database = database;
  }

  async create({ name, description, draftDocument }: CreateProjectRecordInput): Promise<Project> {
    return this.#database.project.create({
      data: {
        name,
        description,
        draftDocument: serializeJson(draftDocument),
      },
    });
  }

  async list({
    page,
    pageSize,
    search,
    status,
  }: ListProjectRecordsInput): Promise<ProjectRecordPage> {
    const where: Prisma.ProjectWhereInput = {
      ...(status === undefined ? {} : { status }),
      ...(search === undefined
        ? {}
        : {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                description: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            ],
          }),
    };
    const [items, total] = await this.#database.$transaction([
      this.#database.project.findMany({
        where,
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.#database.project.count({ where }),
    ]);

    return {
      items,
      total,
    };
  }

  async findById(projectId: string): Promise<Project | null> {
    return this.#database.project.findUnique({
      where: {
        id: projectId,
      },
    });
  }

  async updateDraft({
    projectId,
    expectedDraftVersion,
    name,
    draftDocument,
  }: UpdateProjectDraftInput): Promise<Project> {
    return this.#database.$transaction(async (transaction) => {
      const updateResult = await transaction.project.updateMany({
        where: {
          id: projectId,
          draftVersion: expectedDraftVersion,
        },
        data: {
          ...(name === undefined ? {} : { name }),
          draftDocument: serializeJson(draftDocument),
          draftVersion: {
            increment: 1,
          },
        },
      });

      if (updateResult.count === 0) {
        const currentProject = await transaction.project.findUnique({
          where: {
            id: projectId,
          },
          select: {
            draftVersion: true,
          },
        });

        if (currentProject === null) {
          throw new ProjectNotFoundError(projectId);
        }

        throw new ProjectVersionConflictError(
          projectId,
          expectedDraftVersion,
          currentProject.draftVersion,
        );
      }

      return transaction.project.findUniqueOrThrow({
        where: {
          id: projectId,
        },
      });
    });
  }

  async archive(projectId: string): Promise<Project> {
    return this.#database.$transaction(async (transaction) => {
      const updateResult = await transaction.project.updateMany({
        where: {
          id: projectId,
          status: 'DRAFT',
        },
        data: {
          status: 'ARCHIVED',
        },
      });

      if (updateResult.count === 0) {
        const existingProject = await transaction.project.findUnique({
          where: {
            id: projectId,
          },
        });

        if (existingProject === null) {
          throw new ProjectNotFoundError(projectId);
        }

        return existingProject;
      }

      return transaction.project.findUniqueOrThrow({
        where: {
          id: projectId,
        },
      });
    });
  }
}
