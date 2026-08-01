import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ProjectNotFoundError,
  ProjectVersionConflictError,
  type Project,
  type ProjectRecordPage,
  type ProjectRepository,
  type ProjectRevisionRecord,
  type UpdateProjectDraftInput,
} from '../packages/database/src/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';
import {
  createProjectCaptionHandlers,
  createProjectSrtImportHandlers,
} from '../apps/web/src/projects/handlers.js';
import { DefaultProjectService } from '../apps/web/src/projects/service.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const timestamp = new Date('2026-08-01T08:00:00.000Z');
const context = { params: Promise.resolve({ projectId }) };

function createProject(): Project {
  return {
    id: projectId,
    name: 'Vietnamese captions',
    description: null,
    status: 'DRAFT',
    draftVersion: 1,
    draftDocument: structuredClone(STUDIO_PROJECT_FIXTURE) as Project['draftDocument'],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

class CaptionProjectRepository implements ProjectRepository {
  project: Project | null = createProject();

  async findById(id: string): Promise<Project | null> {
    return this.project?.id === id ? structuredClone(this.project) : null;
  }

  async updateDraft(input: UpdateProjectDraftInput): Promise<Project> {
    if (this.project === null || this.project.id !== input.projectId) {
      throw new ProjectNotFoundError(input.projectId);
    }

    if (this.project.draftVersion !== input.expectedDraftVersion) {
      throw new ProjectVersionConflictError(
        input.projectId,
        input.expectedDraftVersion,
        this.project.draftVersion,
      );
    }

    this.project = {
      ...this.project,
      draftVersion: this.project.draftVersion + 1,
      draftDocument: structuredClone(input.draftDocument) as Project['draftDocument'],
      updatedAt: new Date(this.project.updatedAt.getTime() + 1_000),
    };
    return structuredClone(this.project);
  }

  async create(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async list(): Promise<ProjectRecordPage> {
    return { items: [], total: 0 };
  }
  async archive(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async duplicate(): Promise<never> {
    throw new Error('Not implemented.');
  }
  async createRevision(): Promise<ProjectRevisionRecord> {
    throw new Error('Not implemented.');
  }
  async listRevisions(): Promise<ProjectRevisionRecord[]> {
    return [];
  }
}

function createService(repository: CaptionProjectRepository): DefaultProjectService {
  const ids = [
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
  ];

  return new DefaultProjectService(repository, () => ids.shift() ?? crypto.randomUUID());
}

function importRequest(source: string, version = 1, name = 'phu-de.srt'): Request {
  const body = new FormData();
  body.set('file', new File([source], name, { type: 'application/x-subrip' }));
  body.set('expectedDraftVersion', String(version));

  return new Request(`http://localhost/api/v1/projects/${projectId}/captions/import-srt`, {
    method: 'POST',
    body,
  });
}

describe('caption import API', () => {
  it('imports the Vietnamese fixture atomically and advances draftVersion', async () => {
    const source = readFileSync(resolve('tests/fixtures/captions/vi.srt'), 'utf8');
    const repository = new CaptionProjectRepository();
    const handlers = createProjectSrtImportHandlers(createService(repository));
    const response = await handlers.POST(importRequest(source), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      project: {
        id: projectId,
        draftVersion: 2,
        document: {
          captions: {
            enabled: true,
            source: 'srt',
            style: STUDIO_PROJECT_FIXTURE.captions.style,
            options: STUDIO_PROJECT_FIXTURE.captions.options,
            entries: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                startMs: 500,
                endMs: 2_800,
                text: 'Xin chào! Đây là bản tin hôm nay.',
              },
              {
                id: '33333333-3333-4333-8333-333333333333',
                text: 'Các điểm đáng chú ý\nsẽ được cập nhật liên tục.',
              },
              {
                id: '44444444-4444-4444-8444-444444444444',
                text: 'Cảm ơn bạn đã theo dõi.',
              },
            ],
          },
        },
      },
      warnings: [],
    });
    expect(repository.project?.draftVersion).toBe(2);
  });

  it('returns safe overlap warnings while accepting the import', async () => {
    const repository = new CaptionProjectRepository();
    const handlers = createProjectSrtImportHandlers(createService(repository));
    const response = await handlers.POST(
      importRequest(`1
00:00:00,000 --> 00:00:02,000
Câu đầu

2
00:00:01,500 --> 00:00:03,000
Câu sau`),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      warnings: [{ code: 'SRT_OVERLAP', cueIndex: 2 }],
    });
  });

  it('rejects malformed SRT without changing the draft', async () => {
    const repository = new CaptionProjectRepository();
    const handlers = createProjectSrtImportHandlers(createService(repository));
    const response = await handlers.POST(importRequest('1\ninvalid timing\nNội dung'), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'SRT_INVALID',
        details: [
          expect.objectContaining({
            path: 'file.block.1.line.2',
            message: expect.stringContaining('Timing'),
          }),
        ],
      },
    });
    expect(repository.project?.draftVersion).toBe(1);
  });

  it('enforces optimistic concurrency for imports', async () => {
    const source = readFileSync(resolve('tests/fixtures/captions/vi.srt'), 'utf8');
    const repository = new CaptionProjectRepository();
    repository.project = { ...createProject(), draftVersion: 2 };
    const handlers = createProjectSrtImportHandlers(createService(repository));
    const response = await handlers.POST(importRequest(source, 1), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'PROJECT_VERSION_CONFLICT',
        details: [expect.objectContaining({ path: 'expectedDraftVersion' })],
      },
    });
  });

  it('validates multipart file extension and expected version', async () => {
    const handlers = createProjectSrtImportHandlers(createService(new CaptionProjectRepository()));
    const wrongExtension = await handlers.POST(
      importRequest('subtitle', 1, 'subtitle.txt'),
      context,
    );
    const missingVersionBody = new FormData();
    missingVersionBody.set('file', new File(['subtitle'], 'subtitle.srt'));
    const missingVersion = await handlers.POST(
      new Request(`http://localhost/api/v1/projects/${projectId}/captions/import-srt`, {
        method: 'POST',
        body: missingVersionBody,
      }),
      context,
    );

    expect(wrongExtension.status).toBe(400);
    expect(missingVersion.status).toBe(400);
  });
});

describe('caption configuration API', () => {
  it('updates only captions with optimistic concurrency', async () => {
    const repository = new CaptionProjectRepository();
    const handlers = createProjectCaptionHandlers(createService(repository));
    const captions = {
      ...STUDIO_PROJECT_FIXTURE.captions,
      enabled: true,
      source: 'manual' as const,
      style: 'news' as const,
      entries: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          startMs: 0,
          endMs: 2_000,
          text: 'Bản tin mới',
        },
      ],
    };
    const response = await handlers.PUT(
      new Request(`http://localhost/api/v1/projects/${projectId}/captions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedDraftVersion: 1, captions }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      draftVersion: 2,
      document: {
        scenes: STUDIO_PROJECT_FIXTURE.scenes,
        captions,
      },
    });
  });
});
