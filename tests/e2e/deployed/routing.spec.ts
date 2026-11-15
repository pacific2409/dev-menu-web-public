import { expect, test } from '@playwright/test';

import { requireEnvironment } from '../helpers/environment.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-001][known-routes] known routes load directly and navigation stays in the SPA',
  createTestDetails({ testId: 'T-001', caseId: 'known-routes', classification: 'deployed' }),
  async ({ page }) => {
    const historyId = requireEnvironment('E2E_VALID_HISTORY_ID');

    for (const [path, heading] of [
      ['/', '課題を注文'],
      ['/shared-histories', '共有履歴'],
      [`/shared-histories/${encodeURIComponent(historyId)}`, '共有履歴の詳細'],
    ] as const) {
      const response = await page.goto(path);
      expect(response?.ok()).toBe(true);
      expect(response?.headers()['content-type']).toContain('text/html');
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }

    await page.goto('/');
    const documentRequests: string[] = [];
    page.on('request', (request) => {
      if (request.isNavigationRequest()) documentRequests.push(request.method());
    });
    await page
      .getByRole('navigation', { name: 'メインナビゲーション' })
      .getByRole('link', {
        name: '共有履歴',
      })
      .click();
    await expect(page).toHaveURL(/\/shared-histories$/);
    expect(documentRequests).toHaveLength(0);
  },
);

test(
  '[T-001][routing-precedence] unknown client and API routes retain distinct routing',
  createTestDetails({
    testId: 'T-001',
    caseId: 'routing-precedence',
    classification: 'deployed',
  }),
  async ({ page }) => {
    const clientResponse = await page.goto('/integration-test-unknown-client-route');
    expect(clientResponse?.ok()).toBe(true);
    expect(clientResponse?.headers()['content-type']).toContain('text/html');

    const apiResponse = await page.request.get('/api/integration-test-unknown-route');
    expect(apiResponse.status()).toBe(404);
    if ((apiResponse.headers()['content-type'] ?? '').includes('text/html')) {
      expect(apiResponse.headers().server).toBe('Payara Micro');
    }
  },
);
