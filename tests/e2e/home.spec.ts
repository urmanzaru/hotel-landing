import { expect, test } from '@playwright/test';

test('la portada se sirve y expone el cliente configurado', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('client')).toHaveText('Cliente: lacabana');
});
