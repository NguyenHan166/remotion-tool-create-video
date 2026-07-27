import { randomUUID } from 'node:crypto';
import {
  ProjectNotFoundError,
  type Project,
  type ProjectRepository,
  type ProjectStatusValue,
} from '@hansys/database';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  extractProjectAssetIds,
  migrateProjectDocument,
  parseProjectDocument,
  type ProjectDocumentV1,
} from '@hansys/project-schema';
import {
  type CreateProjectRequest,
  type ListProjectsQuery,
  type UpdateProjectRequest,
} from './contracts.js';

export type ProjectResponse = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatusValue;
  draftVersion: number;
  document: ProjectDocumentV1;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSummaryResponse = {
  id: string;
  name: string;
  status: ProjectStatusValue;
  updatedAt: string;
};

export type ProjectPageResponse = {
  items: ProjectSummaryResponse[];
  page: number;
  pageSize: number;
  total: number;
};

export interface ProjectService {
  create(input: CreateProjectRequest): Promise<ProjectResponse>;
  list(input: ListProjectsQuery): Promise<ProjectPageResponse>;
  get(projectId: string): Promise<ProjectResponse>;
  update(projectId: string, input: UpdateProjectRequest): Promise<ProjectResponse>;
  archive(projectId: string): Promise<void>;
}

function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    draftVersion: project.draftVersion,
    document: migrateProjectDocument(project.draftDocument),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function createDefaultDocument(
  input: CreateProjectRequest,
  createId: () => string,
): ProjectDocumentV1 {
  return parseProjectDocument({
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    metadata: {
      title: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
    },
    composition: {
      width: input.width,
      height: input.height,
      fps: input.fps,
    },
    template: {
      id: input.templateId,
    },
    scenes: [
      {
        id: createId(),
        type: 'hook',
        name: 'Scene 1',
      },
    ],
  });
}

export class DefaultProjectService implements ProjectService {
  readonly #repository: ProjectRepository;
  readonly #createId: () => string;

  constructor(repository: ProjectRepository, createId: () => string = randomUUID) {
    this.#repository = repository;
    this.#createId = createId;
  }

  async create(input: CreateProjectRequest): Promise<ProjectResponse> {
    const document = createDefaultDocument(input, this.#createId);
    const project = await this.#repository.create({
      name: input.name,
      description: input.description ?? null,
      draftDocument: document,
      assetIds: extractProjectAssetIds(document),
    });

    return toProjectResponse(project);
  }

  async list(input: ListProjectsQuery): Promise<ProjectPageResponse> {
    const page = await this.#repository.list({
      page: input.page,
      pageSize: input.pageSize,
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
    });

    return {
      items: page.items.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        updatedAt: project.updatedAt.toISOString(),
      })),
      page: input.page,
      pageSize: input.pageSize,
      total: page.total,
    };
  }

  async get(projectId: string): Promise<ProjectResponse> {
    const project = await this.#repository.findById(projectId);

    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    return toProjectResponse(project);
  }

  async update(projectId: string, input: UpdateProjectRequest): Promise<ProjectResponse> {
    const document = migrateProjectDocument(input.document);
    const project = await this.#repository.updateDraft({
      projectId,
      expectedDraftVersion: input.expectedDraftVersion,
      ...(input.name === undefined ? {} : { name: input.name }),
      draftDocument: document,
      assetIds: extractProjectAssetIds(document),
    });

    return toProjectResponse(project);
  }

  async archive(projectId: string): Promise<void> {
    await this.#repository.archive(projectId);
  }
}
