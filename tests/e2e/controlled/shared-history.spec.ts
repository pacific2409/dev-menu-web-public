import { expect, test } from '@playwright/test';

import { historyListBody, technologyListBody } from '../fixtures/controlled-data.ts';
import { withControlledPage } from '../fixtures/controlled-context.ts';
import {
  createJsonResponse,
  createNetworkFailure,
  createTextResponse,
  type ControlledResponse,
} from '../fixtures/contract-response-builders.ts';
import { requireEnvironment } from '../helpers/environment.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

const technologiesEndpoint = '**/api/v1/technologies';
const historiesEndpoint = /\/api\/v1\/technologies\/[^/]+\/shared-histories$/;

test(
  '[T-007][technology-states] technology loading success empty failure and retry are isolated',
  createTestDetails({ testId: 'T-007', caseId: 'technology-states', classification: 'controlled' }),
  async ({ browser }) => {
    const responses = [
      createJsonResponse('known-error', 500, { errorCode: 'DB9999', errorMessage: 'controlled' }),
      createJsonResponse('success', 200, technologyListBody()),
    ];
    let requestCount = 0;
    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: technologiesEndpoint,
          classification: ['known-error', 'success'],
          response: () => {
            const response = responses[requestCount];
            requestCount += 1;
            if (response === undefined) throw new Error('Unexpected technology request.');
            return response;
          },
        },
      ],
      async (page) => {
        await page.goto('/shared-histories');
        const alert = page.getByRole('alert');
        await expect(alert).toBeFocused();
        await alert.getByRole('button', { name: 'もう一度読み込む' }).click();
        const technology = page.getByRole('combobox', { name: '技術' });
        await expect(technology).toBeEnabled();
        await expect(technology.locator('option')).toHaveCount(3);
        expect(requestCount).toBe(2);
      },
    );

    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: technologiesEndpoint,
          classification: 'empty',
          response: createJsonResponse('empty', 200, { technologies: [] }),
        },
      ],
      async (page) => {
        await page.goto('/shared-histories');
        await expect(page.getByRole('status')).toContainText('共有履歴のある技術はまだありません');
        await expect(page.getByRole('alert')).toHaveCount(0);
      },
    );

    const failureResponses: ControlledResponse[] = [
      createNetworkFailure('connectionfailed'),
      createTextResponse(200, 'opaque'),
    ];
    for (const response of failureResponses) {
      await withControlledPage(
        browser,
        requireEnvironment('PUBLIC_BASE_URL'),
        [
          {
            endpoint: technologiesEndpoint,
            classification: response.classification,
            response,
          },
        ],
        async (page) => {
          await page.goto('/shared-histories');
          await expect(page.getByRole('alert')).toBeFocused();
          await expect(page.getByRole('combobox', { name: '技術' })).toBeDisabled();
        },
      );
    }
  },
);

test(
  '[T-010][request-replacement] a later technology selection wins over a delayed response',
  createTestDetails({
    testId: 'T-010',
    caseId: 'request-replacement',
    classification: 'controlled',
  }),
  async ({ browser }) => {
    let notifyDelayedHistoryFulfilled: (() => void) | undefined;
    const delayedHistoryFulfilled = new Promise<void>((resolve) => {
      notifyDelayedHistoryFulfilled = resolve;
    });
    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: technologiesEndpoint,
          classification: 'success',
          response: createJsonResponse('success', 200, technologyListBody()),
        },
        {
          endpoint: historiesEndpoint,
          classification: 'success',
          response: async (request) => {
            const technologyId = new URL(request.url()).pathname.split('/')[4] ?? '';
            if (technologyId === '1') await new Promise((resolve) => setTimeout(resolve, 150));
            return createJsonResponse(
              'success',
              200,
              historyListBody(technologyId, technologyId === '1' ? 'A' : 'B'),
            );
          },
          onFulfilled: (request) => {
            if (new URL(request.url()).pathname.includes('/technologies/1/')) {
              notifyDelayedHistoryFulfilled?.();
            }
          },
        },
      ],
      async (page) => {
        await page.goto('/shared-histories');
        const technology = page.getByRole('combobox', { name: '技術' });
        await technology.selectOption('1');
        await page.evaluate(() => {
          history.pushState({}, '', '/shared-histories?technologyId=2');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await expect(
          page.getByRole('heading', { level: 2, name: '「Technology B」の共有履歴' }),
        ).toBeVisible();
        await delayedHistoryFulfilled;
        await expect(
          page.getByRole('heading', { level: 2, name: '「Technology A」の共有履歴' }),
        ).toHaveCount(0);
        await expect(
          page.getByRole('heading', { level: 2, name: '「Technology B」の共有履歴' }),
        ).toBeVisible();
        await expect(page.getByRole('alert')).toHaveCount(0);
      },
    );

    let retryRequestCount = 0;
    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: technologiesEndpoint,
          classification: 'success',
          response: createJsonResponse('success', 200, technologyListBody()),
        },
        {
          endpoint: historiesEndpoint,
          classification: ['known-error', 'success'],
          response: () => {
            retryRequestCount += 1;
            return retryRequestCount === 1
              ? createJsonResponse('known-error', 500, {
                  errorCode: 'DB9999',
                  errorMessage: 'controlled',
                })
              : createJsonResponse('success', 200, historyListBody('1'));
          },
        },
      ],
      async (page) => {
        await page.goto('/shared-histories');
        await page.getByRole('combobox', { name: '技術' }).selectOption('1');
        const alert = page.getByRole('alert');
        await expect(alert).toBeFocused();
        await alert.getByRole('button', { name: 'もう一度読み込む' }).click();
        await expect(
          page.getByRole('heading', { level: 2, name: '「Technology A」の共有履歴' }),
        ).toBeVisible();
        expect(retryRequestCount).toBe(2);
      },
    );
  },
);
