import { randomUUID } from 'node:crypto';
import {
  ProjectNotFoundError,
  type Project,
  type ProjectRepository,
  type ProjectRevisionRecord,
  type ProjectStatusValue,
} from '@hansys/database';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  extractProjectAssetIds,
  migrateProjectDocument,
  parseProjectDocument,
  parseSrt,
  type CaptionConfigV1,
  splitScriptIntoSceneDrafts,
  type ProjectDocumentV1,
  type ScriptSplitPreview,
  type SrtParseWarning,
} from '@hansys/project-schema';
import {
  type CreateProjectRequest,
  type ListProjectsQuery,
  type ScriptApplyRequest,
  type ScriptPreviewRequest,
  type UpdateProjectRequest,
  type UpdateCaptionsRequest,
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

export type ProjectRevisionResponse = {
  id: string;
  projectId: string;
  revisionNumber: number;
  schemaVersion: number;
  templateId: string;
  templateVersion: number;
  contentHash: string;
  createdAt: string;
};

export type ImportSrtCaptionsInput = {
  expectedDraftVersion: number;
  source: string;
};

export type ImportSrtCaptionsResponse = {
  project: ProjectResponse;
  warnings: readonly SrtParseWarning[];
};

export interface ProjectService {
  create(input: CreateProjectRequest): Promise<ProjectResponse>;
  list(input: ListProjectsQuery): Promise<ProjectPageResponse>;
  get(projectId: string): Promise<ProjectResponse>;
  update(projectId: string, input: UpdateProjectRequest): Promise<ProjectResponse>;
  archive(projectId: string): Promise<void>;
  duplicate(projectId: string): Promise<ProjectResponse>;
  createRevision(projectId: string): Promise<ProjectRevisionResponse>;
  listRevisions(projectId: string): Promise<ProjectRevisionResponse[]>;
  previewScript(projectId: string, input: ScriptPreviewRequest): Promise<ScriptSplitPreview>;
  applyScript(projectId: string, input: ScriptApplyRequest): Promise<ProjectResponse>;
  updateCaptions(projectId: string, input: UpdateCaptionsRequest): Promise<ProjectResponse>;
  importSrtCaptions(
    projectId: string,
    input: ImportSrtCaptionsInput,
  ): Promise<ImportSrtCaptionsResponse>;
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

function toProjectRevisionResponse(revision: ProjectRevisionRecord): ProjectRevisionResponse {
  return {
    id: revision.id,
    projectId: revision.projectId,
    revisionNumber: revision.revisionNumber,
    schemaVersion: revision.schemaVersion,
    templateId: revision.templateId,
    templateVersion: revision.templateVersion,
    contentHash: revision.contentHash,
    createdAt: revision.createdAt.toISOString(),
  };
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

  async duplicate(projectId: string): Promise<ProjectResponse> {
    return toProjectResponse(await this.#repository.duplicate(projectId));
  }

  async createRevision(projectId: string): Promise<ProjectRevisionResponse> {
    return toProjectRevisionResponse(await this.#repository.createRevision(projectId));
  }

  async listRevisions(projectId: string): Promise<ProjectRevisionResponse[]> {
    const revisions = await this.#repository.listRevisions(projectId);

    return revisions.map(toProjectRevisionResponse);
  }

  async previewScript(projectId: string, input: ScriptPreviewRequest): Promise<ScriptSplitPreview> {
    if ((await this.#repository.findById(projectId)) === null) {
      throw new ProjectNotFoundError(projectId);
    }

    return splitScriptIntoSceneDrafts(input);
  }

  async applyScript(projectId: string, input: ScriptApplyRequest): Promise<ProjectResponse> {
    const project = await this.#repository.findById(projectId);

    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const currentDocument = migrateProjectDocument(project.draftDocument);
    const document = parseProjectDocument({
      ...currentDocument,
      scenes: input.scenes.map((scene) => ({
        id: this.#createId(),
        type: scene.type,
        name: scene.name,
        durationInFrames: scene.durationInFrames,
        text: {
          body: scene.body,
        },
      })),
    });
    const updatedProject = await this.#repository.updateDraft({
      projectId,
      expectedDraftVersion: input.expectedDraftVersion,
      draftDocument: document,
      assetIds: extractProjectAssetIds(document),
    });

    return toProjectResponse(updatedProject);
  }

  async updateCaptions(projectId: string, input: UpdateCaptionsRequest): Promise<ProjectResponse> {
    const project = await this.#repository.findById(projectId);

    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    return toProjectResponse(
      await this.#updateCaptionDocument(project, input.expectedDraftVersion, input.captions),
    );
  }

  async importSrtCaptions(
    projectId: string,
    input: ImportSrtCaptionsInput,
  ): Promise<ImportSrtCaptionsResponse> {
    const project = await this.#repository.findById(projectId);

    if (project === null) {
      throw new ProjectNotFoundError(projectId);
    }

    const parsed = parseSrt(input.source);
    const currentDocument = migrateProjectDocument(project.draftDocument);
    const captions: CaptionConfigV1 = {
      ...currentDocument.captions,
      enabled: true,
      source: 'srt',
      entries: parsed.cues.map((cue) => ({
        id: this.#createId(),
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
      })),
    };
    const updated = await this.#updateCaptionDocument(
      project,
      input.expectedDraftVersion,
      captions,
    );

    return {
      project: toProjectResponse(updated),
      warnings: parsed.warnings,
    };
  }

  async #updateCaptionDocument(
    project: Project,
    expectedDraftVersion: number,
    captions: CaptionConfigV1,
  ): Promise<Project> {
    const currentDocument = migrateProjectDocument(project.draftDocument);
    const document = parseProjectDocument({
      ...currentDocument,
      captions,
    });

    return this.#repository.updateDraft({
      projectId: project.id,
      expectedDraftVersion,
      draftDocument: document,
      assetIds: extractProjectAssetIds(document),
    });
  }
}
