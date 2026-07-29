import { expect, test, type Page } from '@playwright/test';
import { type ProjectDocumentV1 } from '../packages/project-schema/src/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const projectId = '55555555-5555-4555-8555-555555555555';

type ProjectPayload = {
  id: string;
  name: string;
  description: null;
  status: 'DRAFT';
  draftVersion: number;
  document: ProjectDocumentV1;
  createdAt: string;
  updatedAt: string;
};

type AutosaveRequest = {
  expectedDraftVersion: number;
  document: ProjectDocumentV1;
};

function createProjectPayload(
  name: string,
  document: ProjectDocumentV1 = STUDIO_PROJECT_FIXTURE,
  draftVersion = 1,
): ProjectPayload {
  return {
    id: projectId,
    name,
    description: null,
    status: 'DRAFT',
    draftVersion,
    document,
    createdAt: '2026-07-29T00:00:00.000Z',
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

async function mockAutosavingProject(
  page: Page,
  initialProject: ProjectPayload,
): Promise<AutosaveRequest[]> {
  let project = structuredClone(initialProject);
  const requests: AutosaveRequest[] = [];

  await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const request = route.request().postDataJSON() as AutosaveRequest;
      requests.push(request);

      if (request.expectedDraftVersion !== project.draftVersion) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'PROJECT_VERSION_CONFLICT',
              message: 'Project draft version conflict.',
              details: [
                {
                  path: 'expectedDraftVersion',
                  message: `Expected version ${request.expectedDraftVersion}; current version is ${project.draftVersion}.`,
                },
              ],
            },
          }),
        });
        return;
      }

      project = {
        ...project,
        draftVersion: project.draftVersion + 1,
        document: request.document,
        updatedAt: '2026-07-29T00:00:01.000Z',
      };
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(project),
    });
  });

  return requests;
}

async function mockConflictedProject(page: Page): Promise<AutosaveRequest[]> {
  const initialProject = createProjectPayload('Conflict Project');
  const remoteDocument = structuredClone(STUDIO_PROJECT_FIXTURE);
  remoteDocument.scenes[0]!.text.headline = 'Tiêu đề mới nhất từ máy chủ';
  const remoteProject = createProjectPayload('Conflict Project', remoteDocument, 2);
  const requests: AutosaveRequest[] = [];
  let getCount = 0;

  await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
    if (route.request().method() === 'GET') {
      getCount += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(getCount === 1 ? initialProject : remoteProject),
      });
      return;
    }

    const request = route.request().postDataJSON() as AutosaveRequest;
    requests.push(request);

    if (requests.length === 1) {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'PROJECT_VERSION_CONFLICT',
            message: 'Project draft version conflict.',
            details: [
              {
                path: 'expectedDraftVersion',
                message: 'Expected version 1; current version is 2.',
              },
            ],
          },
        }),
      });
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...remoteProject,
        draftVersion: 3,
        document: request.document,
        updatedAt: '2026-07-29T00:00:02.000Z',
      }),
    });
  });

  return requests;
}

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
    const autosaveRequests = await mockAutosavingProject(
      page,
      createProjectPayload('E2E News Preview'),
    );

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
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'saved');
    const settledRequestCount = autosaveRequests.length;
    expect(settledRequestCount).toBeGreaterThan(0);
    await page.waitForTimeout(1_000);
    expect(autosaveRequests).toHaveLength(settledRequestCount);
    expect(renderRequests).toEqual([]);
  });

  test('seeks exact scene boundaries and keeps the active strip item in sync', async ({ page }) => {
    const autosaveRequests = await mockAutosavingProject(
      page,
      createProjectPayload('Player Controls Project'),
    );

    await page.goto(`/projects/${projectId}`);

    const stripItems = page.getByTestId('scene-strip-item');
    const playerTime = page.getByTestId('player-time');
    await expect(stripItems).toHaveCount(2);
    await expect(stripItems.nth(0)).toHaveAttribute('data-start-frame', '0');
    await expect(stripItems.nth(1)).toHaveAttribute('data-start-frame', '90');
    await expect(stripItems.nth(0)).toHaveAttribute('data-active', 'true');
    await expect(playerTime).toHaveAttribute('data-frame', '15');

    await page.getByRole('button', { name: 'Scene tiếp theo' }).click();
    await expect(playerTime).toHaveAttribute('data-frame', '90');
    await expect(stripItems.nth(0)).toHaveAttribute('data-active', 'false');
    await expect(stripItems.nth(1)).toHaveAttribute('data-active', 'true');
    await expect(page.getByLabel('Tiêu đề')).toHaveValue(
      'Một nguồn dữ liệu cho cả xem trước và kết xuất',
    );

    await page.getByRole('button', { name: 'Scene trước' }).click();
    await expect(playerTime).toHaveAttribute('data-frame', '0');
    await expect(stripItems.nth(0)).toHaveAttribute('data-active', 'true');

    const timeSlider = page.getByLabel('Tua theo thời gian');
    await timeSlider.fill('89');
    await expect(playerTime).toHaveAttribute('data-frame', '89');
    await expect(stripItems.nth(0)).toHaveAttribute('data-active', 'true');

    await timeSlider.fill('90');
    await expect(playerTime).toHaveAttribute('data-frame', '90');
    await expect(stripItems.nth(1)).toHaveAttribute('data-active', 'true');

    await page.getByRole('button', { name: 'Tắt tiếng' }).click();
    await expect(page.getByRole('button', { name: 'Bật tiếng' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Bật tiếng' }).click();
    await expect(page.getByRole('button', { name: 'Tắt tiếng' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.getByRole('button', { name: 'Phát', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tạm dừng', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Phát', exact: true })).toBeVisible();

    await page.waitForTimeout(300);
    expect(autosaveRequests).toHaveLength(0);
  });

  test('edits validated scene fields from the inspector', async ({ page }) => {
    await mockAutosavingProject(page, createProjectPayload('Inspector Project'));

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
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'saved');
  });

  test('keeps local edits visible and retries them after a stale-tab conflict', async ({
    page,
  }) => {
    const autosaveRequests = await mockConflictedProject(page);
    const localHeadline = 'Tiêu đề đang sửa ở tab cũ';

    await page.goto(`/projects/${projectId}`);
    await page.getByLabel('Tiêu đề').fill(localHeadline);

    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'conflict');
    await expect(
      page.getByText('Project đã thay đổi ở tab hoặc phiên làm việc khác.'),
    ).toBeVisible();
    await expect(page.getByLabel('Tiêu đề')).toHaveValue(localHeadline);
    await expect(page.getByRole('button', { name: 'Lưu bản của tôi lên v2' })).toBeVisible();
    expect(autosaveRequests).toHaveLength(1);

    await page.getByRole('button', { name: 'Lưu bản của tôi lên v2' }).click();
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'saved');
    await expect(page.getByTestId('autosave-status')).toContainText('Bản nháp máy chủ v3');
    expect(autosaveRequests).toHaveLength(2);
    expect(autosaveRequests[1]?.expectedDraftVersion).toBe(2);
    expect(autosaveRequests[1]?.document.scenes[0]?.text.headline).toBe(localHeadline);

    await page.waitForTimeout(1_000);
    expect(autosaveRequests).toHaveLength(2);
  });

  test('can recover a stale tab by accepting the latest server draft', async ({ page }) => {
    const autosaveRequests = await mockConflictedProject(page);

    await page.goto(`/projects/${projectId}`);
    await page.getByLabel('Tiêu đề').fill('Thay đổi local sẽ được bỏ');
    await expect(page.getByRole('button', { name: 'Dùng bản máy chủ v2' })).toBeVisible();

    await page.getByRole('button', { name: 'Dùng bản máy chủ v2' }).click();

    await expect(page.getByLabel('Tiêu đề')).toHaveValue('Tiêu đề mới nhất từ máy chủ');
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'saved');
    await expect(page.getByTestId('autosave-status')).toContainText('Bản nháp máy chủ v2');
    await page.waitForTimeout(1_000);
    expect(autosaveRequests).toHaveLength(1);
  });

  test('shows a save error and retries only after the user asks', async ({ page }) => {
    const project = createProjectPayload('Retry Project');
    let patchCount = 0;

    await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(project),
        });
        return;
      }

      patchCount += 1;
      if (patchCount === 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Autosave is temporarily unavailable.',
            },
          }),
        });
        return;
      }

      const request = route.request().postDataJSON() as AutosaveRequest;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...project,
          draftVersion: 2,
          document: request.document,
        }),
      });
    });

    await page.goto(`/projects/${projectId}`);
    await page.getByLabel('Tiêu đề').fill('Nội dung cần retry');

    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'error');
    await expect(page.getByText('Autosave is temporarily unavailable.')).toBeVisible();
    expect(patchCount).toBe(1);
    await page.waitForTimeout(300);
    expect(patchCount).toBe(1);

    await page.getByRole('button', { name: 'Thử lưu lại' }).click();
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'saved');
    expect(patchCount).toBe(2);
  });

  test('shows the Player error state for an unavailable template', async ({ page }) => {
    await mockAutosavingProject(
      page,
      createProjectPayload('Broken Preview', {
        ...STUDIO_PROJECT_FIXTURE,
        template: {
          id: 'unavailable-template-v1',
          version: 1,
        },
      }),
    );

    await page.goto(`/projects/${projectId}`);

    await expect(
      page.getByRole('alert').getByText('Không thể hiển thị bản xem trước'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tải lại editor' })).toBeVisible();
  });
});
