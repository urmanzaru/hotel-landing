import { defineConfig, devices } from '@playwright/test';

// El sitio debe servirse en el origen registrado en el PMS (ver SITE_ORIGIN / clients/*.config.ts).
const baseURL = process.env.SITE_ORIGIN ?? 'http://localhost:4202';
const port = new URL(baseURL).port || '4202';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Se prueba el sitio construido, igual que se publica.
    command: `npm run build && npx astro preview --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
