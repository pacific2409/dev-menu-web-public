import { expect, test } from '@playwright/test';

import { historyDetailBody } from '../fixtures/controlled-data.ts';
import { withControlledPage } from '../fixtures/controlled-context.ts';
import { createJsonResponse } from '../fixtures/contract-response-builders.ts';
import { expectNoDocumentOverflow } from '../helpers/accessibility-assertions.ts';
import { requireEnvironment } from '../helpers/environment.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-017][safe-text] markup-shaped content remains inert text without layout overflow',
  createTestDetails({ testId: 'T-017', caseId: 'safe-text', classification: 'controlled' }),
  async ({ browser }) => {
    const safeFixture = '<img src=x onerror=window.__unsafeMarker=true> line\n' + 'x'.repeat(40);
    await withControlledPage(
      browser,
      requireEnvironment('PUBLIC_BASE_URL'),
      [
        {
          endpoint: '**/api/v1/shared-histories/*',
          classification: 'success',
          response: createJsonResponse('success', 200, historyDetailBody('20', safeFixture)),
        },
      ],
      async (page) => {
        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto('/shared-histories/20');
        await expect(page.getByText(safeFixture, { exact: true }).first()).toBeVisible();
        await expect(page.locator('img')).toHaveCount(0);
        expect(await page.evaluate(() => '__unsafeMarker' in window)).toBe(false);
        await expectNoDocumentOverflow(page);
      },
    );
  },
);
