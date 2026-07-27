import { describe, expect, it } from 'vitest';
import {
  AssetNotFoundError,
  ProjectNotFoundError,
  ProjectVersionConflictError,
  type CreateProjectRecordInput,
  type ListProjectRecordsInput,
  type Project,
  type ProjectRecordPage,
  type ProjectRepository,
  type UpdateProjectDraftInput,
} from '../packages/database/src/index.js';
import {
  createProjectCollectionHandlers,
  createProjectResourceHandlers,
} from '../apps/web/src/projects/handlers.js';
import { DefaultProjectService } from '../apps/web/src/projects/service.js';

const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sceneId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

class InMemoryProjectRepository implements ProjectRepository {
  readonly #projects = new Map<string, Project>();
  #clock = 0;

  async create(input: CreateProjectRecordInput): Promise<Project> {
    const timestamp = this.#nextTimestamp();
    const project: Project = {
      id: projectId,
      name: input.name,
      description: input.description,
      status: 'DRAFT',
      draftVersion: 1,
      draftDocument: structuredClone(input.draftDocument) as Project['draftDocument'],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.#projects.set(project.id, project);

    return structuredClone(project);
  }

  async list(input: ListProjectRecordsInput): Promise<ProjectRecordPage> {
    const search = input.search?.toLocaleLowerCase();
    const filtered = [...this.#projects.values()]
      .filter((project) => input.status === undefined || project.status === input.status)
      .filter(
        (project) =>
          search === undefined ||
          project.name.toLocaleLowerCase().includes(search) ||
          project.description?.toLocaleLowerCase().includes(search) === true,
      )
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    const start = (input.page - 1) * input.pageSize;

    return {
      items: structuredClone(filtered.slice(start, start + input.pageSize)),
      total: filtered.length,
    };
  }

  async findById(id: string): Promise<Project | null> {
    const project = this.#projects.get(id);

    return project === undefined ? null : structuredClone(project);
  }

  async updateDraft(input: UpdateProjectDraftInput): Promise<Project> {
    const project = this.#projects.get(input.projectId);

    if (project === undefined) {
      throw new ProjectNotFoundError(input.projectId);
    }

    if (project.draftVersion !== input.expectedDraftVersion) {
      throw new ProjectVersionConflictError(
        input.projectId,
        input.expectedDraftVersion,
        project.draftVersion,
      );
    }

    const updatedProject: Project = {
      ...project,
      ...(input.name === undefined ? {} : { name: input.name }),
      draftVersion: project.draftVersion + 1,
      draftDocument: structuredClone(input.draftDocument) as Project['draftDocument'],
      updatedAt: this.#nextTimestamp(),
    };
    this.#projects.set(project.id, updatedProject);

    return structuredClone(updatedProject);
  }

  async archive(id: string): Promise<Project> {
    const project = this.#projects.get(id);

    if (project === undefined) {
      throw new ProjectNotFoundError(id);
    }

    const archivedProject: Project = {
      ...project,
      status: 'ARCHIVED',
      updatedAt: this.#nextTimestamp(),
    };
    this.#projects.set(id, archivedProject);

    return structuredClone(archivedProject);
  }

  #nextTimestamp(): Date {
    this.#clock += 1;

    return new Date(Date.UTC(2026, 6, 27, 8, 0, this.#clock));
  }
}

class MissingAssetProjectRepository extends InMemoryProjectRepository {
  override async updateDraft(input: UpdateProjectDraftInput): Promise<Project> {
    throw new AssetNotFoundError(input.assetIds);
  }
}

function createJsonRequest(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': 'request-1',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function createTestHandlers(repository: ProjectRepository = new InMemoryProjectRepository()) {
  const service = new DefaultProjectService(repository, () => sceneId);

  return {
    collection: createProjectCollectionHandlers(service),
    resource: createProjectResourceHandlers(service),
  };
}

describe('project CRUD API', () => {
  it('creates, lists, reads, updates and archives a project', async () => {
    const handlers = createTestHandlers();
    const createResponse = await handlers.collection.POST(
      createJsonRequest('POST', 'http://localhost/api/v1/projects', {
        name: 'Security warning',
        description: 'A short vertical video',
        templateId: 'warning-dark-v1',
        width: 1080,
        height: 1920,
        fps: 30,
      }),
    );
    const created = (await createResponse.json()) as {
      id: string;
      name: string;
      draftVersion: number;
      document: Record<string, unknown>;
    };

    expect(createResponse.status).toBe(201);
    expect(created).toMatchObject({
      id: projectId,
      name: 'Security warning',
      draftVersion: 1,
      document: {
        schemaVersion: 1,
        composition: {
          width: 1080,
          height: 1920,
          fps: 30,
          backgroundColor: '#090B10',
        },
        template: {
          id: 'warning-dark-v1',
          version: 1,
        },
        scenes: [
          {
            id: sceneId,
            enabled: true,
          },
        ],
      },
    });

    const listResponse = await handlers.collection.GET(
      new Request('http://localhost/api/v1/projects?page=1&pageSize=10&search=warning'),
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      items: [
        {
          id: projectId,
          name: 'Security warning',
          status: 'DRAFT',
        },
      ],
      page: 1,
      pageSize: 10,
      total: 1,
    });

    const context = {
      params: Promise.resolve({ projectId }),
    };
    const getResponse = await handlers.resource.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}`),
      context,
    );
    const readProject = (await getResponse.json()) as {
      document: Record<string, unknown>;
    };

    expect(getResponse.status).toBe(200);

    const updateResponse = await handlers.resource.PATCH(
      createJsonRequest('PATCH', `http://localhost/api/v1/projects/${projectId}`, {
        expectedDraftVersion: 1,
        name: 'Updated warning',
        document: readProject.document,
      }),
      context,
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      id: projectId,
      name: 'Updated warning',
      draftVersion: 2,
    });

    const deleteResponse = await handlers.resource.DELETE(
      new Request(`http://localhost/api/v1/projects/${projectId}`, {
        method: 'DELETE',
      }),
      context,
    );
    const archivedResponse = await handlers.resource.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}`),
      context,
    );

    expect(deleteResponse.status).toBe(204);
    await expect(archivedResponse.json()).resolves.toMatchObject({
      status: 'ARCHIVED',
    });
  });

  it('returns 409 when PATCH uses a stale draftVersion', async () => {
    const handlers = createTestHandlers();
    const createResponse = await handlers.collection.POST(
      createJsonRequest('POST', 'http://localhost/api/v1/projects', {
        name: 'Conflict test',
        templateId: 'warning-dark-v1',
        width: 1080,
        height: 1920,
        fps: 30,
      }),
    );
    const created = (await createResponse.json()) as {
      document: Record<string, unknown>;
    };
    const context = { params: { projectId } };
    const updateBody = {
      expectedDraftVersion: 1,
      document: created.document,
    };

    const firstUpdate = await handlers.resource.PATCH(
      createJsonRequest('PATCH', `http://localhost/api/v1/projects/${projectId}`, updateBody),
      context,
    );
    const staleUpdate = await handlers.resource.PATCH(
      createJsonRequest('PATCH', `http://localhost/api/v1/projects/${projectId}`, updateBody),
      context,
    );

    expect(firstUpdate.status).toBe(200);
    expect(staleUpdate.status).toBe(409);
    await expect(staleUpdate.json()).resolves.toEqual({
      error: {
        code: 'PROJECT_VERSION_CONFLICT',
        message: 'Project draft version conflict.',
        details: [
          {
            path: 'expectedDraftVersion',
            message: 'Expected version 1; current version is 2.',
          },
        ],
        requestId: 'request-1',
      },
    });
  });

  it('returns field paths for invalid requests and invalid project documents', async () => {
    const handlers = createTestHandlers();
    const invalidCreate = await handlers.collection.POST(
      createJsonRequest('POST', 'http://localhost/api/v1/projects', {
        name: '',
      }),
    );
    const invalidDocument = await handlers.resource.PATCH(
      createJsonRequest('PATCH', `http://localhost/api/v1/projects/${projectId}`, {
        expectedDraftVersion: 1,
        document: {
          schemaVersion: 99,
        },
      }),
      { params: { projectId } },
    );

    expect(invalidCreate.status).toBe(400);
    await expect(invalidCreate.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'name',
          }),
        ]),
      },
    });
    expect(invalidDocument.status).toBe(400);
    await expect(invalidDocument.json()).resolves.toMatchObject({
      error: {
        code: 'PROJECT_VALIDATION_FAILED',
        details: [
          expect.objectContaining({
            path: 'document.schemaVersion',
          }),
        ],
      },
    });
  });

  it('returns 404 for an unknown project', async () => {
    const handlers = createTestHandlers();
    const response = await handlers.resource.GET(
      new Request(`http://localhost/api/v1/projects/${projectId}`),
      { params: { projectId } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'PROJECT_NOT_FOUND',
      },
    });
  });

  it('returns ASSET_NOT_FOUND when a draft references a missing asset', async () => {
    const handlers = createTestHandlers(new MissingAssetProjectRepository());
    const missingAssetId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const response = await handlers.resource.PATCH(
      createJsonRequest('PATCH', `http://localhost/api/v1/projects/${projectId}`, {
        expectedDraftVersion: 1,
        document: {
          schemaVersion: 1,
          metadata: {
            title: 'Missing asset',
          },
          template: {
            id: 'warning-dark-v1',
          },
          theme: {
            logoAssetId: missingAssetId,
          },
          scenes: [
            {
              id: sceneId,
              type: 'hook',
              name: 'Opening',
            },
          ],
        },
      }),
      { params: { projectId } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'ASSET_NOT_FOUND',
        message: 'One or more referenced assets were not found.',
        details: [
          {
            path: 'document',
            message: `Referenced asset not found: ${missingAssetId}`,
          },
        ],
        requestId: 'request-1',
      },
    });
  });
});
