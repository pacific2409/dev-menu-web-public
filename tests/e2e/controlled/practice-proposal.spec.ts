import { expect, test } from '@playwright/test';

import { proposalSuccessBody } from '../fixtures/controlled-data.ts';
import { withControlledPage } from '../fixtures/controlled-context.ts';
import {
  createJsonResponse,
  createNetworkFailure,
  createTextResponse,
  type ControlledResponse,
} from '../fixtures/contract-response-builders.ts';
import { requireEnvironment } from '../helpers/environment.ts';
import { fillProposalForm, submitProposal } from '../helpers/proposal-actions.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

const proposalEndpoint = '**/api/v1/practice-proposals';

test(
  '[T-005][reorder-state] previous results survive only an in-flight or failed reorder',
  createTestDetails({ testId: 'T-005', caseId: 'reorder-state', classification: 'controlled' }),
  async ({ browser }) => {
    const responses: ControlledResponse[] = [
      createJsonResponse('success', 200, proposalSuccessBody('A')),
      createJsonResponse('success', 200, proposalSuccessBody('B')),
      createJsonResponse('known-error', 500, {
        errorCode: 'GAI001',
        errorMessage: 'controlled failure',
      }),
    ];
    let requestCount = 0;

    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: proposalEndpoint,
          classification: ['success', 'known-error'],
          response: async () => {
            const response = responses[requestCount];
            requestCount += 1;
            if (response === undefined) throw new Error('Unexpected proposal request.');
            if (requestCount === 2) await new Promise((resolve) => setTimeout(resolve, 100));
            return response;
          },
        },
      ],
      async (page) => {
        const resultHeading = page.getByRole('heading', { level: 2, name: '提案された課題' });
        await test.step('diag.reorder.initial-submit', async () => {
          await page.goto('/');
          await fillProposalForm(page);
          await submitProposal(page);
          await expect(resultHeading).toBeFocused();
        });

        await test.step('diag.reorder.in-flight', async () => {
          await page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ }).fill('Technology B');
          await submitProposal(page);
          await expect(page.getByText('前回成功した提案')).toBeVisible();
          await expect(
            page.getByRole('status').filter({ hasText: '課題を考えています' }),
          ).toBeVisible();
        });
        await test.step('diag.reorder.success', async () => {
          await expect(page.getByText('前回成功した提案')).toHaveCount(0);
        });

        await test.step('diag.reorder.failure', async () => {
          await submitProposal(page);
          const alert = page.getByRole('alert');
          await expect(alert).toBeFocused();
          await expect(page.getByText('前回成功した提案')).toBeVisible();
          expect(requestCount).toBe(3);
        });

        await test.step('diag.reorder.reload-clear', async () => {
          await page.reload();
          await expect(resultHeading).toHaveCount(0);
          expect(requestCount).toBe(3);
        });
      },
    );
  },
);

test(
  '[T-006][error-mapping] only matching error contracts expose known user states',
  createTestDetails({ testId: 'T-006', caseId: 'error-mapping', classification: 'controlled' }),
  async ({ browser }) => {
    const cases: {
      diagnosticStep: string;
      classification: ControlledResponse['classification'];
      response: ControlledResponse;
    }[] = [
      {
        diagnosticStep: 'diag.error-mapping.known-error',
        classification: 'known-error',
        response: createJsonResponse('known-error', 500, {
          errorCode: 'GAI001',
          errorMessage: 'internal controlled text',
        }),
      },
      {
        diagnosticStep: 'diag.error-mapping.unknown-error',
        classification: 'unknown-error',
        response: createJsonResponse('unknown-error', 500, {
          errorCode: 'UNKNOWN',
          errorMessage: 'internal controlled text',
        }),
      },
      {
        diagnosticStep: 'diag.error-mapping.contract-mismatch',
        classification: 'contract-mismatch',
        response: createTextResponse(500, 'opaque'),
      },
      {
        diagnosticStep: 'diag.error-mapping.network-failure',
        classification: 'network-failure',
        response: createNetworkFailure('connectionfailed'),
      },
    ];

    for (const controlledCase of cases) {
      await test.step(controlledCase.diagnosticStep, async () => {
        await withControlledPage(
          browser,
          requireEnvironment('PUBLIC_BASE_URL'),
          [
            {
              endpoint: proposalEndpoint,
              classification: controlledCase.classification,
              response: controlledCase.response,
            },
          ],
          async (page) => {
            await page.goto('/');
            await fillProposalForm(page);
            await submitProposal(page);
            const alert = page.getByRole('alert');
            await expect(alert).toBeFocused();
            await expect(alert).not.toContainText(/GAI001|UNKNOWN|internal controlled text|opaque/);
            await expect(page.getByRole('button', { name: '課題を提案してもらう' })).toBeEnabled();
          },
        );
      });
    }

    await test.step('diag.error-mapping.validation-error', async () => {
      await withControlledPage(
        browser,
        requireEnvironment('PUBLIC_BASE_URL'),
        [
          {
            endpoint: proposalEndpoint,
            classification: 'known-error',
            response: createJsonResponse('known-error', 400, {
              errorCode: 'VE0001',
              errorMessage: 'controlled validation',
              validationMessage: { technologyName: 'controlled field message' },
            }),
          },
        ],
        async (page) => {
          await page.goto('/');
          await fillProposalForm(page);
          await submitProposal(page);
          await expect(page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ })).toBeFocused();
          await expect(page.getByRole('alert', { name: '入力エラー' })).toBeVisible();
          await expect(page.getByRole('alert')).not.toContainText(
            /controlled validation|controlled field message/,
          );
        },
      );
    });
  },
);
