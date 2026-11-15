import { expect, test } from '@playwright/test';

import { requireEnvironment } from '../helpers/environment.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-008][history-sync] technology selection stays synchronized with browser history',
  createTestDetails({ testId: 'T-008', caseId: 'history-sync', classification: 'deployed' }),
  async ({ page }) => {
    const technologyId = requireEnvironment('E2E_VALID_TECHNOLOGY_ID');

    await page.goto(`/shared-histories?technologyId=${encodeURIComponent(technologyId)}`);
    const technology = page.getByRole('combobox', { name: '技術' });
    await expect(technology).toHaveValue(technologyId);
    await expect(page.getByRole('region', { name: '共有履歴の取得結果' })).toBeVisible();

    await technology.selectOption('');
    await expect(page).not.toHaveURL(/technologyId=/);
    await page.goBack();
    await expect(technology).toHaveValue(technologyId);
    await page.goForward();
    await expect(technology).toHaveValue('');
  },
);

test(
  '[T-008][invalid-parameter] invalid technology parameters are replaced in place',
  createTestDetails({
    testId: 'T-008',
    caseId: 'invalid-parameter',
    classification: 'deployed',
  }),
  async ({ page }) => {
    await page.goto('/shared-histories?technologyId=invalid');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).not.toHaveURL(/technologyId=/);
    await expect(page.getByRole('combobox', { name: '技術' })).toHaveValue('');
  },
);

test(
  '[T-011][route-classification] invalid history identifiers never reach the API',
  createTestDetails({
    testId: 'T-011',
    caseId: 'route-classification',
    classification: 'deployed',
  }),
  async ({ page }) => {
    let detailRequestCount = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/shared-histories/')) {
        detailRequestCount += 1;
      }
    });

    for (const pathSegment of ['invalid', '01', '-1', '1.5', '9223372036854775808']) {
      await page.goto(`/shared-histories/${pathSegment}`);
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('link', { name: '新しい課題を注文する' })).toBeVisible();
    }
    expect(detailRequestCount).toBe(0);
  },
);

test(
  '[T-011][valid-route] a valid history identifier is passed to the same-origin API',
  createTestDetails({ testId: 'T-011', caseId: 'valid-route', classification: 'deployed' }),
  async ({ page }) => {
    const historyId = requireEnvironment('E2E_VALID_HISTORY_ID');
    const requests: URL[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/v1/shared-histories/')) requests.push(url);
    });

    await page.goto(`/shared-histories/${encodeURIComponent(historyId)}`);
    await expect(page.getByRole('heading', { level: 1, name: '共有履歴の詳細' })).toBeVisible();
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]?.origin).toBe(new URL(page.url()).origin);
  },
);
