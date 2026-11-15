import { expect, test } from '@playwright/test';

import { loadRealSystemInputs } from '../fixtures/real-system-inputs.ts';
import { expectCompleteProposalResult } from '../helpers/real-actions.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-012][fixture-detail] a real saved history is complete and exposes safe navigation',
  createTestDetails({ testId: 'T-012', caseId: 'fixture-detail', classification: 'real' }),
  async ({ page }) => {
    const inputs = loadRealSystemInputs();
    await page.goto(`/shared-histories/${encodeURIComponent(inputs.historyId)}`);

    await expect(page.locator('time[datetime]')).toHaveCount(1);
    await expectCompleteProposalResult(
      page,
      '保存された3件の課題',
      false,
      /^(学ぶポイント|検証するポイント)$/,
    );
    const backLinks = page.getByRole('link', { name: '共有履歴へ戻る' });
    await expect(backLinks.first()).toHaveAttribute(
      'href',
      `/shared-histories?technologyId=${encodeURIComponent(inputs.technologyId)}`,
    );
    await expect(page.getByRole('link', { name: '新しい課題を注文する' })).toHaveAttribute(
      'href',
      '/',
    );
  },
);
