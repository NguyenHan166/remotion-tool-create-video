import { expect, test } from '@playwright/test';

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

test.describe('asset library', () => {
  test.skip(
    process.env.E2E_BASE_URL === undefined,
    'Set E2E_BASE_URL to a running stack with PostgreSQL and ffprobe.',
  );

  test('uploads an image, previews it and removes it', async ({ page }) => {
    await page.goto('/assets');

    await expect(page.getByRole('heading', { name: 'Thư viện media' })).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'e2e-pixel.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    });
    await page.getByRole('button', { name: 'Tải lên' }).click();

    await expect(page.getByText('e2e-pixel.png').first()).toBeVisible();
    await page.getByRole('button', { name: 'Xem trước e2e-pixel.png' }).click();

    const preview = page.getByRole('img', { name: 'Xem trước e2e-pixel.png' });
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('dialog').getByRole('button', { name: 'Xóa media' }).click();
    await expect(page.getByText('Đã xóa media khỏi thư viện.')).toBeVisible();
    await expect(page.getByText('e2e-pixel.png')).toHaveCount(0);
  });
});
