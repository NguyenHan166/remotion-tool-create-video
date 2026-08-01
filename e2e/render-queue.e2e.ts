import { expect, test } from '@playwright/test';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const projectId = '55555555-5555-4555-8555-555555555555';
const renderId = '66666666-6666-4666-8666-666666666666';

test.describe('render queue workflow', () => {
  test.skip(
    process.env.E2E_BASE_URL === undefined,
    'Set E2E_BASE_URL to a running web application.',
  );

  test('queues, polls progress and downloads the completed MP4', async ({ page }) => {
    await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: projectId,
          name: 'Render Queue Project',
          description: null,
          status: 'DRAFT',
          draftVersion: 1,
          document: STUDIO_PROJECT_FIXTURE,
          createdAt: '2026-08-01T08:00:00.000Z',
          updatedAt: '2026-08-01T08:00:00.000Z',
        }),
      });
    });
    await page.route('**/api/v1/assets?*', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 1, pageSize: 100, total: 0 }),
      });
    });

    const baseJob = {
      id: renderId,
      projectId,
      revisionId: '77777777-7777-4777-8777-777777777777',
      preset: 'vertical-h264',
      priority: 0,
      renderedFrames: null,
      encodedFrames: null,
      totalFrames: null,
      stageMessage: 'Waiting for a render worker.',
      attempt: 0,
      maxAttempts: 2,
      errorCode: null,
      errorMessage: null,
      availableAt: '2026-08-01T08:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-01T08:00:00.000Z',
      outputs: [],
    };
    const queuedJob = { ...baseJob, status: 'QUEUED', progress: 0 };
    const renderingJob = {
      ...baseJob,
      status: 'RENDERING',
      progress: 0.46,
      renderedFrames: 138,
      encodedFrames: 0,
      totalFrames: 300,
      stageMessage: 'Rendering frames (138/300).',
      attempt: 1,
      startedAt: '2026-08-01T08:00:01.000Z',
    };
    const completedJob = {
      ...baseJob,
      status: 'COMPLETED',
      progress: 1,
      renderedFrames: 300,
      encodedFrames: 300,
      totalFrames: 300,
      stageMessage: 'Render completed.',
      attempt: 1,
      startedAt: '2026-08-01T08:00:01.000Z',
      finishedAt: '2026-08-01T08:00:04.000Z',
      outputs: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          kind: 'VIDEO',
          relativePath: `renders/${renderId}/video.mp4`,
          fileName: 'news.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 2048,
          width: 1080,
          height: 1920,
          durationMs: 10_000,
          metadata: { videoCodec: 'h264' },
          createdAt: '2026-08-01T08:00:04.000Z',
        },
        {
          id: '99999999-9999-4999-8999-999999999999',
          kind: 'THUMBNAIL',
          relativePath: `thumbnails/${renderId}.jpg`,
          fileName: 'thumbnail.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 512,
          width: 1080,
          height: 1920,
          durationMs: null,
          metadata: { frame: 149 },
          createdAt: '2026-08-01T08:00:04.000Z',
        },
      ],
    };
    let created = false;
    let listAfterCreate = 0;

    await page.route('**/api/v1/renders**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname.endsWith('/download')) {
        await route.fulfill({
          contentType: 'video/mp4',
          headers: { 'Content-Disposition': 'attachment; filename="news.mp4"' },
          body: 'mock-mp4',
        });
        return;
      }

      if (url.pathname.endsWith('/thumbnail')) {
        await route.fulfill({ contentType: 'image/jpeg', body: 'mock-jpeg' });
        return;
      }

      if (request.method() === 'POST' && url.pathname === '/api/v1/renders') {
        created = true;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(queuedJob) });
        return;
      }

      if (!created) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ items: [], page: 1, pageSize: 10, total: 0 }),
        });
        return;
      }

      listAfterCreate += 1;
      const job = listAfterCreate === 1 ? renderingJob : completedJob;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [job], page: 1, pageSize: 10, total: 1 }),
      });
    });

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId('render-queue')).toContainText('Chưa có bản render');
    await page.getByLabel('Chất lượng kết xuất').selectOption('vertical-h264');
    await page.getByRole('button', { name: 'Tạo bản render' }).click();

    const renderCard = page.getByTestId('render-job');
    await expect(renderCard).toHaveAttribute('data-status', 'RENDERING');
    await expect(renderCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '46');
    await expect(renderCard).toHaveAttribute('data-status', 'COMPLETED', { timeout: 5_000 });
    await expect(renderCard.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await expect(renderCard.getByRole('link', { name: /Tải MP4/ })).toBeVisible();
    await expect(renderCard.getByAltText(`Thumbnail render ${renderId.slice(0, 8)}`)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      renderCard.getByRole('link', { name: /Tải MP4/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('news.mp4');
  });
});
