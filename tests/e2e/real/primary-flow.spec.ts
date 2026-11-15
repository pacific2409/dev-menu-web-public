import { expect, test } from '@playwright/test';

import { loadRealSystemInputs } from '../fixtures/real-system-inputs.ts';
import {
  expectCompleteProposalResult,
  fillRealProposalForm,
  submitRealProposal,
} from '../helpers/real-actions.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-014][primary-flow] proposal creation reaches its public history detail without authentication',
  createTestDetails({ testId: 'T-014', caseId: 'primary-flow', classification: 'real' }),
  async ({ page }) => {
    test.setTimeout(120_000);
    const inputs = loadRealSystemInputs();

    await page.goto('/');
    await fillRealProposalForm(page, inputs);
    await submitRealProposal(page);
    await expectCompleteProposalResult(page, '提案された3件の課題');

    await page
      .getByRole('navigation', { name: 'メインナビゲーション' })
      .getByRole('link', {
        name: '共有履歴',
      })
      .click();
    await page
      .getByRole('combobox', { name: '技術' })
      .selectOption({ label: inputs.normalizedTechnologyName });
    const historyList = page.getByRole('list', {
      name: `${inputs.normalizedTechnologyName}の共有履歴`,
    });
    await historyList.getByRole('link').first().click();
    await expectCompleteProposalResult(page, '保存された3件の課題', false);
    await expect(page.getByRole('button', { name: /ログイン|サインイン|認証/ })).toHaveCount(0);
  },
);
