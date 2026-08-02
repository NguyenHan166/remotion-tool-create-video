import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  PrismaAssetRepository,
  PrismaProjectRepository,
  PrismaRenderJobRepository,
  createPrismaClient,
  type PrismaClient,
} from '../../packages/database/src/index.js';
import { parseProjectDocument } from '../../packages/project-schema/src/index.js';
import { initializeStorage, type StoragePaths } from '../../packages/storage/src/index.js';

import { DefaultAssetFileService } from '../../apps/web/src/assets/file-service.js';
import {
  createAssetCollectionHandlers,
  createAssetFileHandlers,
  createAssetResourceHandlers,
} from '../../apps/web/src/assets/handlers.js';
import { DefaultAssetUploadService } from '../../apps/web/src/assets/service.js';

import {
  createProjectCaptionHandlers,
  createProjectCollectionHandlers,
  createProjectDuplicateHandlers,
  createProjectResourceHandlers,
  createProjectRevisionHandlers,
  createProjectScriptApplyHandlers,
  createProjectScriptPreviewHandlers,
  createProjectSrtImportHandlers,
} from '../../apps/web/src/projects/handlers.js';
import { DefaultProjectService } from '../../apps/web/src/projects/service.js';

import {
  createRenderCancellationHandlers,
  createRenderCollectionHandlers,
  createRenderOutputFileHandlers,
  createRenderResourceHandlers,
  createRenderRetryHandlers,
} from '../../apps/web/src/renders/handlers.js';
import { DefaultRenderOutputFileService } from '../../apps/web/src/renders/file-service.js';
import { DefaultRenderService } from '../../apps/web/src/renders/service.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationTest = testDatabaseUrl === undefined ? describe.skip : describe;

const createdProjectIds: string[] = [];
const createdAssetIds: string[] = [];

let database: PrismaClient;
let tempStorageDir: string;
let storagePaths: StoragePaths;

let projectRepo: PrismaProjectRepository;
let assetRepo: PrismaAssetRepository;
let renderJobRepo: PrismaRenderJobRepository;

let projectService: DefaultProjectService;
let assetUploadService: DefaultAssetUploadService;
let assetFileService: DefaultAssetFileService;
let renderService: DefaultRenderService;
let renderOutputFileService: DefaultRenderOutputFileService;

// Handlers
let projectCollectionHandlers: ReturnType<typeof createProjectCollectionHandlers>;
let projectResourceHandlers: ReturnType<typeof createProjectResourceHandlers>;
let projectDuplicateHandlers: ReturnType<typeof createProjectDuplicateHandlers>;
let projectScriptPreviewHandlers: ReturnType<typeof createProjectScriptPreviewHandlers>;
let projectScriptApplyHandlers: ReturnType<typeof createProjectScriptApplyHandlers>;
let projectRevisionHandlers: ReturnType<typeof createProjectRevisionHandlers>;
let projectSrtImportHandlers: ReturnType<typeof createProjectSrtImportHandlers>;
let projectCaptionHandlers: ReturnType<typeof createProjectCaptionHandlers>;

let assetCollectionHandlers: ReturnType<typeof createAssetCollectionHandlers>;
let assetResourceHandlers: ReturnType<typeof createAssetResourceHandlers>;
let assetFileHandlers: ReturnType<typeof createAssetFileHandlers>;

let renderCollectionHandlers: ReturnType<typeof createRenderCollectionHandlers>;
let renderResourceHandlers: ReturnType<typeof createRenderResourceHandlers>;
let renderCancellationHandlers: ReturnType<typeof createRenderCancellationHandlers>;
let renderRetryHandlers: ReturnType<typeof createRenderRetryHandlers>;
let renderDownloadHandlers: ReturnType<typeof createRenderOutputFileHandlers>;
let renderThumbnailHandlers: ReturnType<typeof createRenderOutputFileHandlers>;

integrationTest('API Integration Suite against PostgreSQL', () => {
  beforeAll(async () => {
    database = createPrismaClient(testDatabaseUrl!);
    await database.$connect();

    tempStorageDir = await mkdtemp(join(tmpdir(), 'hansys-api-integration-'));
    storagePaths = await initializeStorage(tempStorageDir);

    projectRepo = new PrismaProjectRepository(database);
    assetRepo = new PrismaAssetRepository(database);
    renderJobRepo = new PrismaRenderJobRepository(database);

    projectService = new DefaultProjectService(projectRepo);
    assetUploadService = new DefaultAssetUploadService(assetRepo, storagePaths, 50 * 1024 * 1024);
    assetFileService = new DefaultAssetFileService(assetRepo, storagePaths);

    renderService = new DefaultRenderService(renderJobRepo, { maxAttempts: 3 });
    renderOutputFileService = new DefaultRenderOutputFileService(renderJobRepo, storagePaths);

    projectCollectionHandlers = createProjectCollectionHandlers(projectService);
    projectResourceHandlers = createProjectResourceHandlers(projectService);
    projectDuplicateHandlers = createProjectDuplicateHandlers(projectService);
    projectScriptPreviewHandlers = createProjectScriptPreviewHandlers(projectService);
    projectScriptApplyHandlers = createProjectScriptApplyHandlers(projectService);
    projectRevisionHandlers = createProjectRevisionHandlers(projectService);
    projectSrtImportHandlers = createProjectSrtImportHandlers(projectService);
    projectCaptionHandlers = createProjectCaptionHandlers(projectService);

    assetCollectionHandlers = createAssetCollectionHandlers(assetUploadService);
    assetResourceHandlers = createAssetResourceHandlers(assetUploadService);
    assetFileHandlers = createAssetFileHandlers(assetFileService);

    renderCollectionHandlers = createRenderCollectionHandlers(renderService);
    renderResourceHandlers = createRenderResourceHandlers(renderService);
    renderCancellationHandlers = createRenderCancellationHandlers(renderService);
    renderRetryHandlers = createRenderRetryHandlers(renderService);
    renderDownloadHandlers = createRenderOutputFileHandlers(renderOutputFileService, 'VIDEO');
    renderThumbnailHandlers = createRenderOutputFileHandlers(renderOutputFileService, 'THUMBNAIL');
  });

  afterEach(async () => {
    const projectIds = createdProjectIds.splice(0);

    if (projectIds.length > 0) {
      await database.renderJob.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await database.projectRevision.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await database.projectAsset.deleteMany({
        where: { projectId: { in: projectIds } },
      });
      await database.project.deleteMany({
        where: { id: { in: projectIds } },
      });
    }

    const assetIds = createdAssetIds.splice(0);

    if (assetIds.length > 0) {
      await database.projectAsset.deleteMany({
        where: { assetId: { in: assetIds } },
      });
      await database.asset.deleteMany({
        where: { id: { in: assetIds } },
      });
    }
  });

  afterAll(async () => {
    await database.$disconnect();
    await rm(tempStorageDir, { recursive: true, force: true });
  });

  describe('Projects API Integration', () => {
    it('creates, lists, fetches, updates (optimistic concurrency), duplicates, and archives a project', async () => {
      // 1. Create project via POST /api/v1/projects
      const createReq = new Request('http://localhost/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Integration Test Video',
          templateId: 'news-clean-v1',
          width: 1080,
          height: 1920,
          fps: 30,
        }),
      });
      const createRes = await projectCollectionHandlers.POST(createReq);
      expect(createRes.status).toBe(201);
      const createdProject = await createRes.json();
      expect(createdProject).toMatchObject({
        name: 'Integration Test Video',
        status: 'DRAFT',
        draftVersion: 1,
      });
      createdProjectIds.push(createdProject.id);

      // 2. List projects via GET /api/v1/projects
      const listReq = new Request('http://localhost/api/v1/projects?page=1&pageSize=10');
      const listRes = await projectCollectionHandlers.GET(listReq);
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.items.some((p: { id: string }) => p.id === createdProject.id)).toBe(true);

      // 3. Fetch single project via GET /api/v1/projects/:id
      const getReq = new Request(`http://localhost/api/v1/projects/${createdProject.id}`);
      const getRes = await projectResourceHandlers.GET(getReq, {
        params: Promise.resolve({ projectId: createdProject.id }),
      });
      expect(getRes.status).toBe(200);
      const fetchedProject = await getRes.json();
      expect(fetchedProject.id).toBe(createdProject.id);

      // 4. Successful PATCH with expectedDraftVersion = 1
      const patchReq = new Request(`http://localhost/api/v1/projects/${createdProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedDraftVersion: 1,
          name: 'Updated Title',
          document: {
            ...createdProject.document,
            metadata: {
              ...createdProject.document.metadata,
              title: 'Updated Title',
            },
          },
        }),
      });
      const patchRes = await projectResourceHandlers.PATCH(patchReq, {
        params: Promise.resolve({ projectId: createdProject.id }),
      });
      expect(patchRes.status).toBe(200);
      const updatedProject = await patchRes.json();
      expect(updatedProject.draftVersion).toBe(2);
      expect(updatedProject.name).toBe('Updated Title');

      // 5. Stale PATCH with expectedDraftVersion = 1 should fail with 409 PROJECT_VERSION_CONFLICT
      const stalePatchReq = new Request(`http://localhost/api/v1/projects/${createdProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedDraftVersion: 1,
          name: 'Stale Update',
          document: updatedProject.document,
        }),
      });
      const stalePatchRes = await projectResourceHandlers.PATCH(stalePatchReq, {
        params: Promise.resolve({ projectId: createdProject.id }),
      });
      expect(stalePatchRes.status).toBe(409);
      const staleError = await stalePatchRes.json();
      expect(staleError.error.code).toBe('PROJECT_VERSION_CONFLICT');

      // 6. Duplicate project via POST /api/v1/projects/:id/duplicate
      const dupReq = new Request(
        `http://localhost/api/v1/projects/${createdProject.id}/duplicate`,
        {
          method: 'POST',
        },
      );
      const dupRes = await projectDuplicateHandlers.POST(dupReq, {
        params: Promise.resolve({ projectId: createdProject.id }),
      });
      expect(dupRes.status).toBe(201);
      const duplicatedProject = await dupRes.json();
      expect(duplicatedProject.name).toBe('Updated Title (Copy)');
      createdProjectIds.push(duplicatedProject.id);

      // 7. Delete (archive) project via DELETE /api/v1/projects/:id
      const delReq = new Request(`http://localhost/api/v1/projects/${createdProject.id}`, {
        method: 'DELETE',
      });
      const delRes = await projectResourceHandlers.DELETE(delReq, {
        params: Promise.resolve({ projectId: createdProject.id }),
      });
      expect(delRes.status).toBe(200);
      const archivedProject = await delRes.json();
      expect(archivedProject.status).toBe('ARCHIVED');
    });

    it('previews and applies script splitting, then creates and lists manual revisions', async () => {
      // Create a base project
      const project = await projectRepo.create({
        name: 'Script & Revision Test Project',
        description: null,
        draftDocument: parseProjectDocument({
          schemaVersion: 1,
          metadata: { title: 'Script & Revision Test Project' },
          template: { id: 'news-clean-v1' },
          scenes: [],
        }),
        assetIds: [],
      });
      createdProjectIds.push(project.id);

      // 1. Script preview via POST /api/v1/projects/:id/script-preview
      const previewReq = new Request(
        `http://localhost/api/v1/projects/${project.id}/script-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: 'Hook text line\n\nContent paragraph two',
            splitMode: 'blank-line',
            defaultSceneType: 'content',
            defaultDurationInFrames: 150,
          }),
        },
      );
      const previewRes = await projectScriptPreviewHandlers.POST(previewReq, {
        params: Promise.resolve({ projectId: project.id }),
      });
      expect(previewRes.status).toBe(200);
      const previewData = await previewRes.json();
      expect(previewData.scenes.length).toBe(2);

      // 2. Script apply via POST /api/v1/projects/:id/script-apply
      const applyReq = new Request(`http://localhost/api/v1/projects/${project.id}/script-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedDraftVersion: 1,
          scenes: previewData.scenes,
        }),
      });
      const applyRes = await projectScriptApplyHandlers.POST(applyReq, {
        params: Promise.resolve({ projectId: project.id }),
      });
      expect(applyRes.status).toBe(200);
      const appliedProject = await applyRes.json();
      expect(appliedProject.draftVersion).toBe(2);
      expect(appliedProject.document.scenes.length).toBe(2);

      // 3. Create manual revision via POST /api/v1/projects/:id/revisions
      const createRevReq = new Request(`http://localhost/api/v1/projects/${project.id}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: 'Manual Snapshot v1' }),
      });
      const createRevRes = await projectRevisionHandlers.POST(createRevReq, {
        params: Promise.resolve({ projectId: project.id }),
      });
      expect(createRevRes.status).toBe(201);
      const createdRev = await createRevRes.json();
      expect(createdRev.revisionNumber).toBe(1);
      expect(createdRev.label).toBe('Manual Snapshot v1');

      // 4. List revisions via GET /api/v1/projects/:id/revisions
      const listRevReq = new Request(`http://localhost/api/v1/projects/${project.id}/revisions`);
      const listRevRes = await projectRevisionHandlers.GET(listRevReq, {
        params: Promise.resolve({ projectId: project.id }),
      });
      expect(listRevRes.status).toBe(200);
      const revList = await listRevRes.json();
      expect(revList.items.length).toBe(1);
      expect(revList.items[0].id).toBe(createdRev.id);
    });
  });

  describe('Assets API Integration', () => {
    it('uploads an asset, lists it, streams it with Range header, and handles deletion in-use checks', async () => {
      // 1. Upload asset via POST /api/v1/assets
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSAhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      const formData = new FormData();
      formData.append('file', new File([pngBuffer], 'test-image.png', { type: 'image/png' }));

      const uploadReq = new Request('http://localhost/api/v1/assets', {
        method: 'POST',
        body: formData,
      });
      const uploadRes = await assetCollectionHandlers.POST(uploadReq);
      expect(uploadRes.status).toBe(201);
      const uploadedAsset = await uploadRes.json();
      expect(uploadedAsset).toMatchObject({
        kind: 'IMAGE',
        originalName: 'test-image.png',
        mimeType: 'image/png',
        status: 'READY',
      });
      createdAssetIds.push(uploadedAsset.id);

      // 2. Fetch single asset via GET /api/v1/assets/:id
      const getAssetReq = new Request(`http://localhost/api/v1/assets/${uploadedAsset.id}`);
      const getAssetRes = await assetResourceHandlers.GET(getAssetReq, {
        params: Promise.resolve({ assetId: uploadedAsset.id }),
      });
      expect(getAssetRes.status).toBe(200);
      expect((await getAssetRes.json()).id).toBe(uploadedAsset.id);

      // 3. Stream media file with Range header via GET /api/v1/assets/:id/file
      const streamReq = new Request(`http://localhost/api/v1/assets/${uploadedAsset.id}/file`, {
        headers: { range: 'bytes=0-10' },
      });
      const streamRes = await assetFileHandlers.GET(streamReq, {
        params: Promise.resolve({ assetId: uploadedAsset.id }),
      });
      expect(streamRes.status).toBe(206);
      expect(streamRes.headers.get('Content-Range')).toContain('bytes 0-10/');

      // 4. Attach asset to a project and attempt deletion (should fail with 409 ASSET_IN_USE)
      const project = await projectRepo.create({
        name: 'Asset Bound Project',
        description: null,
        draftDocument: parseProjectDocument({
          schemaVersion: 1,
          metadata: { title: 'Asset Bound Project' },
          template: { id: 'news-clean-v1' },
          scenes: [
            {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              type: 'image',
              mediaAssetId: uploadedAsset.id,
            },
          ],
        }),
        assetIds: [uploadedAsset.id],
      });
      createdProjectIds.push(project.id);

      const delAssetReq = new Request(`http://localhost/api/v1/assets/${uploadedAsset.id}`, {
        method: 'DELETE',
      });
      const delAssetRes = await assetResourceHandlers.DELETE(delAssetReq, {
        params: Promise.resolve({ assetId: uploadedAsset.id }),
      });
      expect(delAssetRes.status).toBe(409);
      const delError = await delAssetRes.json();
      expect(delError.error.code).toBe('ASSET_IN_USE');

      // 5. Unbind asset from project and delete asset (should succeed)
      await projectRepo.updateDraft({
        projectId: project.id,
        expectedDraftVersion: 1,
        draftDocument: parseProjectDocument({
          schemaVersion: 1,
          metadata: { title: 'Asset Unbound Project' },
          template: { id: 'news-clean-v1' },
          scenes: [],
        }),
        assetIds: [],
      });

      const retryDelRes = await assetResourceHandlers.DELETE(
        new Request(`http://localhost/api/v1/assets/${uploadedAsset.id}`, { method: 'DELETE' }),
        { params: Promise.resolve({ assetId: uploadedAsset.id }) },
      );
      expect(retryDelRes.status).toBe(200);
    });
  });

  describe('Captions API Integration', () => {
    it('imports SRT captions into draft document and updates caption configuration', async () => {
      const project = await projectRepo.create({
        name: 'Caption Test Project',
        description: null,
        draftDocument: parseProjectDocument({
          schemaVersion: 1,
          metadata: { title: 'Caption Test Project' },
          template: { id: 'news-clean-v1' },
          scenes: [],
        }),
        assetIds: [],
      });
      createdProjectIds.push(project.id);

      // 1. Import SRT via POST /api/v1/projects/:id/captions/import-srt
      const srtContent = `1\n00:00:01,000 --> 00:00:03,500\nXin chào các bạn\n\n2\n00:00:04,000 --> 00:00:06,000\nĐây là video ngắn\n`;
      const formData = new FormData();
      formData.append('file', new File([srtContent], 'subtitles.srt', { type: 'text/plain' }));
      formData.append('expectedDraftVersion', '1');

      const srtReq = new Request(
        `http://localhost/api/v1/projects/${project.id}/captions/import-srt`,
        {
          method: 'POST',
          body: formData,
        },
      );
      const srtRes = await projectSrtImportHandlers.POST(srtReq, {
        params: Promise.resolve({ projectId: project.id }),
      });
      expect(srtRes.status).toBe(200);
      const srtData = await srtRes.json();
      expect(srtData.draftVersion).toBe(2);
      expect(srtData.document.captions.items.length).toBe(2);
      expect(srtData.document.captions.items[0].text).toBe('Xin chào các bạn');

      // 2. Update caption settings via PUT /api/v1/projects/:id/captions
      const captionConfigReq = new Request(
        `http://localhost/api/v1/projects/${project.id}/captions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedDraftVersion: 2,
            captions: {
              enabled: true,
              style: 'tiktok',
              positionYRatio: 0.85,
            },
          }),
        },
      );
      const captionConfigRes = await projectCaptionHandlers.PUT(captionConfigReq, {
        params: Promise.resolve({ projectId: project.id }),
      });
      expect(captionConfigRes.status).toBe(200);
      const updatedCaptionsProject = await captionConfigRes.json();
      expect(updatedCaptionsProject.draftVersion).toBe(3);
      expect(updatedCaptionsProject.document.captions.style).toBe('tiktok');
    });
  });

  describe('Renders API Integration', () => {
    it('queues a render job, queries status, tests cancellation, retry handlers and output file requests', async () => {
      const project = await projectRepo.create({
        name: 'Render Test Project',
        description: null,
        draftDocument: parseProjectDocument({
          schemaVersion: 1,
          metadata: { title: 'Render Test Project' },
          template: { id: 'news-clean-v1' },
          scenes: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              type: 'hook',
              headline: 'Hello Render',
            },
          ],
        }),
        assetIds: [],
      });
      createdProjectIds.push(project.id);

      // 1. Queue render job via POST /api/v1/renders
      const renderReq = new Request('http://localhost/api/v1/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          preset: 'vertical-h264',
        }),
      });
      const renderRes = await renderCollectionHandlers.POST(renderReq);
      expect(renderRes.status).toBe(201);
      const job = await renderRes.json();
      expect(job.status).toBe('QUEUED');
      expect(job.projectId).toBe(project.id);

      // 2. Fetch render job via GET /api/v1/renders/:id
      const getJobReq = new Request(`http://localhost/api/v1/renders/${job.id}`);
      const getJobRes = await renderResourceHandlers.GET(getJobReq, {
        params: Promise.resolve({ renderId: job.id }),
      });
      expect(getJobRes.status).toBe(200);
      expect((await getJobRes.json()).id).toBe(job.id);

      // 3. Cancel queued render job via POST /api/v1/renders/:id/cancel
      const cancelReq = new Request(`http://localhost/api/v1/renders/${job.id}/cancel`, {
        method: 'POST',
      });
      const cancelRes = await renderCancellationHandlers.POST(cancelReq, {
        params: Promise.resolve({ renderId: job.id }),
      });
      expect(cancelRes.status).toBe(200);
      const cancelledJob = await cancelRes.json();
      expect(cancelledJob.status).toBe('CANCEL_REQUESTED');

      // Transition status to CANCELLED using repository transitionStatus
      await renderJobRepo.transitionStatus({
        renderJobId: job.id,
        nextStatus: 'CANCELLED',
      });

      // 4. Retry cancelled job via POST /api/v1/renders/:id/retry
      const retryReq = new Request(`http://localhost/api/v1/renders/${job.id}/retry`, {
        method: 'POST',
      });
      const retryRes = await renderRetryHandlers.POST(retryReq, {
        params: Promise.resolve({ renderId: job.id }),
      });
      expect(retryRes.status).toBe(200);
      const retriedJob = await retryRes.json();
      expect(retriedJob.status).toBe('QUEUED');

      // 5. Test download and thumbnail handlers when output not ready (should return 409 RENDER_NOT_READY)
      const downloadReq = new Request(`http://localhost/api/v1/renders/${job.id}/download`);
      const downloadRes = await renderDownloadHandlers.GET(downloadReq, {
        params: Promise.resolve({ renderId: job.id }),
      });
      expect(downloadRes.status).toBe(409);

      const thumbReq = new Request(`http://localhost/api/v1/renders/${job.id}/thumbnail`);
      const thumbRes = await renderThumbnailHandlers.GET(thumbReq, {
        params: Promise.resolve({ renderId: job.id }),
      });
      expect(thumbRes.status).toBe(409);
    });
  });

  describe('Failure States & Standard Error Envelopes', () => {
    it('returns structured error envelopes with X-Request-ID for 404, 400, and validation errors', async () => {
      // 1. 404 Not Found error envelope
      const nonExistentId = '00000000-0000-4000-8000-000000000000';
      const req404 = new Request(`http://localhost/api/v1/projects/${nonExistentId}`);
      const res404 = await projectResourceHandlers.GET(req404, {
        params: Promise.resolve({ projectId: nonExistentId }),
      });
      expect(res404.status).toBe(404);
      expect(res404.headers.has('X-Request-ID')).toBe(true);
      const body404 = await res404.json();
      expect(body404).toMatchObject({
        error: {
          code: 'PROJECT_NOT_FOUND',
          message: 'Project not found.',
        },
      });

      // 2. 400 Validation Error on project creation
      const invalidCreateReq = new Request('http://localhost/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '', // Empty name invalid
          templateId: 'non-existent-template',
        }),
      });
      const invalidCreateRes = await projectCollectionHandlers.POST(invalidCreateReq);
      expect(invalidCreateRes.status).toBe(400);
      const invalidBody = await invalidCreateRes.json();
      expect(invalidBody.error.code).toBe('BAD_REQUEST');
      expect(Array.isArray(invalidBody.error.details)).toBe(true);
    });
  });
});
