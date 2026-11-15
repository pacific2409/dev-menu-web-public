import { defineConfig, devices } from '@playwright/test';

function parsePublicBaseUrl(value: string | undefined) {
  if (value === undefined || value.length === 0) {
    throw new Error('PUBLIC_BASE_URL is required to run the formal integration test harness.');
  }

  const publicBaseUrl = URL.parse(value);
  if (
    publicBaseUrl === null ||
    (publicBaseUrl.protocol !== 'http:' && publicBaseUrl.protocol !== 'https:') ||
    publicBaseUrl.username.length > 0 ||
    publicBaseUrl.password.length > 0 ||
    publicBaseUrl.pathname !== '/' ||
    publicBaseUrl.search.length > 0 ||
    publicBaseUrl.hash.length > 0
  ) {
    throw new Error(
      'PUBLIC_BASE_URL must be an HTTP(S) origin without credentials, path, query, or fragment.',
    );
  }

  return publicBaseUrl.origin;
}

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.playwright-output',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: './tests/e2e/reporters/sanitized-reporter.ts',
  use: {
    baseURL: parsePublicBaseUrl(process.env.PUBLIC_BASE_URL),
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
