import { expect, test } from '@playwright/test';

import { historyDetailBody } from '../fixtures/controlled-data.ts';
import { withControlledPage } from '../fixtures/controlled-context.ts';
import {
  createJsonResponse,
  createNetworkFailure,
} from '../fixtures/contract-response-builders.ts';
import { requireEnvironment } from '../helpers/environment.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

const detailEndpoint = '**/api/v1/shared-histories/*';

test(
  '[T-013][detail-errors] not-found and retryable failures remain distinct',
  createTestDetails({ testId: 'T-013', caseId: 'detail-errors', classification: 'controlled' }),
  async ({ browser }) => {
    let notifyDelayedDetailFulfilled: (() => void) | undefined;
    const delayedDetailFulfilled = new Promise<void>((resolve) => {
      notifyDelayedDetailFulfilled = resolve;
    });
    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: detailEndpoint,
          classification: 'known-error',
          response: createJsonResponse('known-error', 404, {
            errorCode: 'SH0001',
            errorMessage: 'controlled',
          }),
        },
      ],
      async (page) => {
        await page.goto('/shared-histories/20');
        const alert = page.getByRole('alert');
        await expect(alert).toBeFocused();
        await expect(alert.getByRole('button')).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 2, name: '提案された課題' })).toHaveCount(
          0,
        );
      },
    );

    let requestCount = 0;
    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: detailEndpoint,
          classification: ['network-failure', 'success'],
          response: () => {
            requestCount += 1;
            return requestCount === 1
              ? createNetworkFailure('connectionfailed')
              : createJsonResponse('success', 200, historyDetailBody());
          },
        },
      ],
      async (page) => {
        await page.goto('/shared-histories/20');
        const alert = page.getByRole('alert');
        await expect(alert).toBeFocused();
        await alert.getByRole('button', { name: 'もう一度読み込む' }).click();
        await expect(page.getByRole('heading', { level: 2, name: '提案された課題' })).toBeVisible();
        expect(requestCount).toBe(2);
      },
    );

    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: detailEndpoint,
          classification: 'success',
          response: async (request) => {
            const historyId = new URL(request.url()).pathname.split('/').at(-1) ?? '';
            if (historyId === '20') await new Promise((resolve) => setTimeout(resolve, 150));
            return createJsonResponse(
              'success',
              200,
              historyDetailBody(historyId, `detail-${historyId}`),
            );
          },
          onFulfilled: (request) => {
            if (new URL(request.url()).pathname.endsWith('/20')) {
              notifyDelayedDetailFulfilled?.();
            }
          },
        },
      ],
      async (page) => {
        await page.goto('/shared-histories/20');
        await page.evaluate(() => {
          history.pushState({}, '', '/shared-histories/21');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await expect(page.getByRole('heading', { level: 3, name: 'detail-21 1' })).toBeVisible();
        await delayedDetailFulfilled;
        await expect(page.getByRole('heading', { level: 3, name: 'detail-20 1' })).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 3, name: 'detail-21 1' })).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
      },
    );
  },
);
