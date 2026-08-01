import { expect, test } from '@playwright/test';
import type { ProjectDocumentV1 } from '../packages/project-schema/src/index.js';
import { STUDIO_PROJECT_FIXTURE } from '../packages/video/src/fixture.js';

const projectId = '55555555-5555-4555-8555-555555555555';

test.describe('caption SRT import', () => {
  test.skip(
    process.env.E2E_BASE_URL === undefined,
    'Set E2E_BASE_URL to a running web application.',
  );

  test('imports Vietnamese captions and keeps later edits in autosave', async ({ page }) => {
    let project = {
      id: projectId,
      name: 'Vietnamese Caption Project',
      description: null,
      status: 'DRAFT' as const,
      draftVersion: 1,
      document: structuredClone(STUDIO_PROJECT_FIXTURE),
      createdAt: '2026-08-01T08:00:00.000Z',
      updatedAt: '2026-08-01T08:00:00.000Z',
    };
    const autosaveDocuments: ProjectDocumentV1[] = [];

    await page.route(`**/api/v1/projects/${projectId}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const request = route.request().postDataJSON() as {
          expectedDraftVersion: number;
          document: ProjectDocumentV1;
        };
        expect(request.expectedDraftVersion).toBe(project.draftVersion);
        autosaveDocuments.push(request.document);
        project = {
          ...project,
          draftVersion: project.draftVersion + 1,
          document: request.document,
          updatedAt: '2026-08-01T08:00:02.000Z',
        };
      }

      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(project) });
    });
    await page.route(`**/api/v1/projects/${projectId}/captions/import-srt`, async (route) => {
      expect(route.request().method()).toBe('POST');
      project = {
        ...project,
        draftVersion: 2,
        updatedAt: '2026-08-01T08:00:01.000Z',
        document: {
          ...project.document,
          captions: {
            ...project.document.captions,
            enabled: true,
            source: 'srt',
            entries: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                startMs: 500,
                endMs: 2_800,
                text: 'Xin chào! Đây là bản tin hôm nay.',
              },
              {
                id: '22222222-2222-4222-8222-222222222222',
                startMs: 3_100,
                endMs: 6_250,
                text: 'Các điểm đáng chú ý\nsẽ được cập nhật liên tục.',
              },
              {
                id: '33333333-3333-4333-8333-333333333333',
                startMs: 6_500,
                endMs: 9_000,
                text: 'Cảm ơn bạn đã theo dõi.',
              },
            ],
          },
        },
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ project, warnings: [] }),
      });
    });
    await page.route('**/api/v1/assets?*', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 1, pageSize: 100, total: 0 }),
      });
    });
    await page.route('**/api/v1/renders**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ items: [], page: 1, pageSize: 10, total: 0 }),
      });
    });

    await page.goto(`/projects/${projectId}`);
    await page.getByLabel('Tệp phụ đề SRT').setInputFiles('tests/fixtures/captions/vi.srt');
    await page.getByRole('button', { name: 'Nhập SRT' }).click();

    await expect(page.getByTestId('caption-entry')).toHaveCount(3);
    await expect(page.getByLabel('Nội dung phụ đề 1')).toHaveValue(
      'Xin chào! Đây là bản tin hôm nay.',
    );
    await expect(page.getByTestId('autosave-status')).toContainText('Bản nháp máy chủ v2');
    await expect(page.getByText('Đã nhập 3 câu phụ đề.')).toBeVisible();

    await page.getByLabel('Nội dung phụ đề 1').fill('Xin chào Việt Nam!');
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-phase', 'saved');
    await expect(page.getByTestId('autosave-status')).toContainText('Bản nháp máy chủ v3');
    expect(autosaveDocuments).toHaveLength(1);
    expect(autosaveDocuments[0]?.captions.entries[0]?.text).toBe('Xin chào Việt Nam!');
  });
});
