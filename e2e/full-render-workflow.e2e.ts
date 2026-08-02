import { expect, test } from '@playwright/test';
import { type ProjectDocumentV1 } from '../packages/project-schema/src/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const projectId = 'e2e-full-workflow-project-id-111';
const assetId = 'e2e-full-workflow-asset-id-222';
const renderId = 'e2e-full-workflow-render-id-333';
const outputVideoId = 'e2e-full-workflow-output-video-444';
const outputThumbId = 'e2e-full-workflow-output-thumb-555';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type RenderJobMock = {
  id: string;
  projectId: string;
  revisionId: string;
  preset: string;
  status: string;
  priority: number;
  progress: number;
  renderedFrames: number | null;
  encodedFrames: number | null;
  totalFrames: number | null;
  stageMessage: string;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  availableAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  outputs: Array<{
    id: string;
    kind: string;
    relativePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    width: number;
    height: number;
    durationMs: number | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
};

test.describe('full end-to-end render workflow', () => {
  test.skip(
    process.env.E2E_BASE_URL === undefined,
    'Set E2E_BASE_URL to a running web application stack.',
  );

  test('performs complete journey: project loading, script import, asset upload, player preview, render queueing and MP4 download', async ({
    page,
  }) => {
    let currentDocument: ProjectDocumentV1 = structuredClone(STUDIO_PROJECT_FIXTURE);
    let draftVersion = 1;

    let projectState = {
      id: projectId,
      name: 'E2E Complete Video Project',
      description: null,
      status: 'DRAFT' as const,
      draftVersion,
      document: currentDocument,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    };

    // 1. Mock GET & PATCH /api/v1/projects/:id
    await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON() as {
          expectedDraftVersion: number;
          document: ProjectDocumentV1;
          name?: string;
        };
        draftVersion += 1;
        currentDocument = payload.document;
        projectState = {
          ...projectState,
          draftVersion,
          document: currentDocument,
          name: payload.name ?? projectState.name,
          updatedAt: '2026-08-01T10:00:01.000Z',
        };
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(projectState),
      });
    });

    // 2. Mock GET & POST /api/v1/assets
    await page.route('**/api/v1/assets?*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: assetId,
            kind: 'IMAGE',
            status: 'READY',
            originalName: 'workflow-image.png',
            storedName: `${assetId}.png`,
            relativePath: `assets/${assetId}.png`,
            mimeType: 'image/png',
            sizeBytes: 68,
            sha256: 'a'.repeat(64),
            width: 1,
            height: 1,
            durationMs: null,
            hasAudio: false,
            errorCode: null,
            errorMessage: null,
            createdAt: '2026-08-01T10:00:00.000Z',
            updatedAt: '2026-08-01T10:00:00.000Z',
          }),
        });
        return;
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: assetId,
              kind: 'IMAGE',
              status: 'READY',
              originalName: 'workflow-image.png',
              storedName: `${assetId}.png`,
              relativePath: `assets/${assetId}.png`,
              mimeType: 'image/png',
              sizeBytes: 68,
              sha256: 'a'.repeat(64),
              width: 1,
              height: 1,
              durationMs: null,
              hasAudio: false,
              errorCode: null,
              errorMessage: null,
              createdAt: '2026-08-01T10:00:00.000Z',
              updatedAt: '2026-08-01T10:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        }),
      });
    });

    // 3. Mock POST /api/v1/projects/:id/script-preview & script-apply
    await page.route(`**/api/v1/projects/${projectId}/script-preview`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          scenes: [
            {
              name: 'Hook tin mới',
              body: 'Mở đầu tin tức nóng hổi hôm nay.',
              type: 'hook',
              durationInFrames: 150,
            },
            {
              name: 'Chi tiết tin',
              body: 'Nội dung phân tích chi tiết quy trình video.',
              type: 'content',
              durationInFrames: 180,
            },
          ],
        }),
      });
    });

    await page.route(`**/api/v1/projects/${projectId}/script-apply`, async (route) => {
      draftVersion += 1;
      currentDocument = {
        ...currentDocument,
        scenes: [
          {
            id: 'scene-1111-1111',
            type: 'hook',
            name: 'Hook tin mới',
            enabled: true,
            style: {
              textAlign: 'center',
              emphasis: 'normal',
            },
            text: {
              headline: 'Hook tin mới',
              body: 'Mở đầu tin tức nóng hổi hôm nay.',
            },
            durationInFrames: 150,
          },
          {
            id: 'scene-2222-2222',
            type: 'content',
            name: 'Chi tiết tin',
            enabled: true,
            style: {
              textAlign: 'center',
              emphasis: 'normal',
            },
            text: {
              headline: 'Chi tiết tin',
              body: 'Nội dung phân tích chi tiết quy trình video.',
            },
            durationInFrames: 180,
          },
        ],
      };
      projectState = {
        ...projectState,
        draftVersion,
        document: currentDocument,
        updatedAt: '2026-08-01T10:00:02.000Z',
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(projectState),
      });
    });

    // 4. Mock Renders API state machine (QUEUED -> RENDERING -> COMPLETED)
    let renderPollCount = 0;
    const queuedJob: RenderJobMock = {
      id: renderId,
      projectId,
      revisionId: 'rev-111-222',
      preset: 'vertical-h264',
      status: 'QUEUED',
      priority: 0,
      progress: 0,
      renderedFrames: null,
      encodedFrames: null,
      totalFrames: 330,
      stageMessage: 'Đang chờ worker nhận job.',
      attempt: 0,
      maxAttempts: 3,
      errorCode: null,
      errorMessage: null,
      availableAt: '2026-08-01T10:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      outputs: [],
    };

    await page.route('**/api/v1/renders', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(queuedJob),
        });
        return;
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [queuedJob], page: 1, pageSize: 10, total: 1 }),
      });
    });

    await page.route(`**/api/v1/renders/${renderId}`, async (route) => {
      renderPollCount += 1;
      let currentJob: RenderJobMock = { ...queuedJob };

      if (renderPollCount >= 2 && renderPollCount < 4) {
        currentJob = {
          ...currentJob,
          status: 'RENDERING',
          progress: 0.5,
          renderedFrames: 165,
          totalFrames: 330,
          stageMessage: 'Đang xuất khung hình (165/330).',
          attempt: 1,
          startedAt: '2026-08-01T10:00:01.000Z',
        };
      } else if (renderPollCount >= 4) {
        currentJob = {
          ...currentJob,
          status: 'COMPLETED',
          progress: 1,
          renderedFrames: 330,
          encodedFrames: 330,
          totalFrames: 330,
          stageMessage: 'Render hoàn tất.',
          attempt: 1,
          startedAt: '2026-08-01T10:00:01.000Z',
          finishedAt: '2026-08-01T10:00:05.000Z',
          outputs: [
            {
              id: outputVideoId,
              kind: 'VIDEO',
              relativePath: `renders/${renderId}/video.mp4`,
              fileName: 'E2E_Complete_Video.mp4',
              mimeType: 'video/mp4',
              sizeBytes: 1024 * 1024,
              width: 1080,
              height: 1920,
              durationMs: 11_000,
              metadata: { codec: 'h264' },
              createdAt: '2026-08-01T10:00:05.000Z',
            },
            {
              id: outputThumbId,
              kind: 'THUMBNAIL',
              relativePath: `thumbnails/${renderId}.jpg`,
              fileName: 'thumbnail.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 4096,
              width: 1080,
              height: 1920,
              durationMs: null,
              metadata: null,
              createdAt: '2026-08-01T10:00:05.000Z',
            },
          ],
        };
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(currentJob),
      });
    });

    // 5. Navigate to Editor
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('E2E Complete Video Project').first()).toBeVisible();

    // 6. Test Script Import flow
    await page.getByRole('button', { name: 'Nhập kịch bản' }).click();
    await expect(page.getByRole('heading', { name: 'Nhập kịch bản văn bản' })).toBeVisible();

    await page
      .getByLabel('Nội dung kịch bản dạng văn bản thô')
      .fill('Mở đầu tin tức nóng hổi hôm nay.\n\nNội dung phân tích chi tiết quy trình video.');
    await page.getByRole('button', { name: 'Tách thử kịch bản' }).click();

    await expect(page.getByText('Hook tin mới')).toBeVisible();
    await page.getByRole('button', { name: 'Áp dụng vào kịch bản' }).click();

    // 7. Test Media Asset Upload in Editor
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'workflow-image.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    });

    // 8. Verify Remotion Preview Container is rendered
    await expect(page.locator('.remotion-player-container')).toBeVisible();

    // 9. Enqueue Render Job
    const renderButton = page.getByRole('button', { name: 'Render video' });
    await expect(renderButton).toBeVisible();
    await renderButton.click();

    // 10. Verify Render Job Progress & Completion
    await expect(page.getByText('Render hoàn tất')).toBeVisible({ timeout: 10_000 });

    // 11. Verify Download MP4 Video Button links to download endpoint
    const downloadLink = page.getByRole('link', { name: 'Tải video MP4' });
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute(
      'href',
      `/api/v1/renders/${renderId}/download`,
    );
  });
});
