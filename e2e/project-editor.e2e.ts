import { expect, test } from '@playwright/test';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const projectId = '55555555-5555-4555-8555-555555555555';

test.describe('project editor preview', () => {
  test.skip(
    process.env.E2E_BASE_URL === undefined,
    'Set E2E_BASE_URL to a running web application.',
  );

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/assets?*', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: '88888888-8888-4888-8888-888888888888',
              kind: 'IMAGE',
              status: 'READY',
              originalName: 'news-image.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 1_024,
              width: 1080,
              height: 1920,
              durationMs: null,
              hasAudio: null,
              errorCode: null,
              errorMessage: null,
              createdAt: '2026-07-29T00:00:00.000Z',
              updatedAt: '2026-07-29T00:00:00.000Z',
            },
          ],
          page: 1,
          pageSize: 100,
          total: 1,
        }),
      });
    });
  });

  test('updates the Remotion Player from local draft text without a render request', async ({
    page,
  }) => {
    const renderRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/renders')) {
        renderRequests.push(request.url());
      }
    });
    await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: projectId,
          name: 'E2E News Preview',
          description: null,
          status: 'DRAFT',
          draftVersion: 1,
          document: STUDIO_PROJECT_FIXTURE,
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        }),
      });
    });

    await page.goto(`/projects/${projectId}`);

    await expect(page.getByRole('heading', { name: 'Xem trước dự án' })).toBeVisible();
    const headline = 'Tiêu đề thay đổi ngay trong Player';
    await page.getByLabel('Tiêu đề').fill(headline);
    await expect(page.getByTestId('remotion-player')).toContainText(headline);

    const sceneItems = page.getByTestId('scene-list-item');
    await expect(sceneItems).toHaveCount(2);
    const originalIds = await sceneItems.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-scene-id')),
    );

    await page.getByRole('button', { name: 'Chọn scene Nội dung' }).click();
    await expect(page.getByLabel('Tiêu đề')).toHaveValue(
      'Một nguồn dữ liệu cho cả xem trước và kết xuất',
    );
    await page.getByRole('button', { name: 'Di chuyển scene lên' }).click();
    await expect
      .poll(() =>
        sceneItems.evaluateAll((items) => items.map((item) => item.getAttribute('data-scene-id'))),
      )
      .toEqual([originalIds[1], originalIds[0]]);

    await page.getByRole('button', { name: 'Nhân bản scene' }).click();
    await expect(sceneItems).toHaveCount(3);
    const duplicatedIds = await sceneItems.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-scene-id')),
    );
    expect(duplicatedIds[0]).toBe(originalIds[1]);
    expect(duplicatedIds[1]).not.toBe(originalIds[0]);
    expect(duplicatedIds[1]).not.toBe(originalIds[1]);

    await page.getByRole('button', { name: 'Thêm scene' }).click();
    await expect(sceneItems).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Scene 4' })).toBeVisible();
    await page.getByRole('button', { name: 'Xóa scene' }).click();
    await expect(sceneItems).toHaveCount(3);
    expect(renderRequests).toEqual([]);
  });

  test('edits validated scene fields from the inspector', async ({ page }) => {
    await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: projectId,
          name: 'Inspector Project',
          description: null,
          status: 'DRAFT',
          draftVersion: 1,
          document: STUDIO_PROJECT_FIXTURE,
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        }),
      });
    });

    await page.goto(`/projects/${projectId}`);
    await page.getByLabel('Tên scene').fill('Danh sách điểm chính');
    await page.getByLabel('Loại scene').selectOption('bullet-list');
    await page.getByLabel('Tiêu đề').fill('Ba điểm đáng chú ý');
    await page.getByLabel('Danh sách bullet').fill('Tốc độ\nỔn định\nDễ sử dụng');
    await page.getByLabel('Căn chữ').selectOption('right');
    await page.getByLabel('Mức nhấn mạnh').selectOption('urgent');
    await page.getByLabel('Biến thể template').selectOption('compact');

    await expect(page.getByTestId('scene-list-item').first()).toContainText('Danh sách điểm chính');
    await expect(page.getByTestId('remotion-player')).toContainText('Ba điểm đáng chú ý');

    await page.getByLabel('Thời lượng frame').fill('5');
    await expect(page.getByTestId('inspector-validation-error')).toBeVisible();
    await expect(page.getByLabel('Thời lượng frame')).toHaveValue('90');

    await page.getByLabel('Thời lượng frame').fill('180');
    await expect(page.getByTestId('inspector-validation-error')).not.toBeVisible();
    await expect(page.getByLabel('Thời lượng frame')).toHaveValue('180');
  });

  test('shows the Player error state for an unavailable template', async ({ page }) => {
    await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          id: projectId,
          name: 'Broken Preview',
          description: null,
          status: 'DRAFT',
          draftVersion: 1,
          document: {
            ...STUDIO_PROJECT_FIXTURE,
            template: {
              id: 'unavailable-template-v1',
              version: 1,
            },
          },
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
        }),
      });
    });

    await page.goto(`/projects/${projectId}`);

    await expect(
      page.getByRole('alert').getByText('Không thể hiển thị bản xem trước'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tải lại editor' })).toBeVisible();
  });
});
