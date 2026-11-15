import { expect, test } from '@playwright/test';

import { loadRealSystemInputs } from '../fixtures/real-system-inputs.ts';
import {
  expectCompleteProposalResult,
  fillRealProposalForm,
  submitRealProposal,
} from '../helpers/real-actions.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-003][validation-normalization] invalid values stay local and valid input is normalized once',
  createTestDetails({
    testId: 'T-003',
    caseId: 'validation-normalization',
    classification: 'real',
  }),
  async ({ page }) => {
    test.setTimeout(120_000);
    const inputs = loadRealSystemInputs();
    let requestCount = 0;
    let normalizationMatches = false;
    page.on('request', (request) => {
      if (
        request.method() !== 'POST' ||
        new URL(request.url()).pathname !== '/api/v1/practice-proposals'
      )
        return;
      requestCount += 1;
      const body = request.postDataJSON() as Record<string, unknown>;
      normalizationMatches =
        body.technologyName === inputs.normalizedTechnologyName &&
        body.difficulty === '1' &&
        body.durationHours === 2 &&
        body.purpose === '1' &&
        body.additionalPreference === null;
    });

    await page.goto('/');
    await submitRealProposal(page);
    const summary = page.getByRole('alert', { name: '入力エラー' });
    await expect(summary).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ })).toBeFocused();
    await expect(page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(requestCount).toBe(0);

    await fillRealProposalForm(page, inputs);
    await expect(summary).toHaveCount(0);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/practice-proposals',
    );
    await submitRealProposal(page);
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    expect(requestCount).toBe(1);
    expect(normalizationMatches).toBe(true);
  },
);

test(
  '[T-004][successful-result] a real proposal is presented as one complete three-item result',
  createTestDetails({ testId: 'T-004', caseId: 'successful-result', classification: 'real' }),
  async ({ page }) => {
    test.setTimeout(120_000);
    const inputs = loadRealSystemInputs();
    await page.goto('/');
    await fillRealProposalForm(page, inputs);
    await submitRealProposal(page);

    const submit = page.getByRole('button', { name: '課題を提案してもらう' });
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: '課題を考えています' })).toBeVisible();
    await expect(page.getByRole('list', { name: '提案された3件の課題' })).toHaveCount(0);
    await expectCompleteProposalResult(page, '提案された3件の課題');
  },
);
