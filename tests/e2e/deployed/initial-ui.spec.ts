import { expect, test } from '@playwright/test';

import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-002][initial-ui] initial proposal form exposes its guidance before submission',
  createTestDetails({ testId: 'T-002', caseId: 'initial-ui', classification: 'deployed' }),
  async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: '課題を注文' })).toBeVisible();
    const technology = page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ });
    const difficulty = page.getByRole('combobox', { name: /^難易度\s*必須$/ });
    const duration = page.getByRole('spinbutton', { name: /^取り組める時間\s*必須$/ });
    const purpose = page.getByRole('combobox', { name: /^目的\s*必須$/ });
    const preference = page.getByRole('textbox', { name: /^その他の希望\s*任意$/ });

    await test.step('diag.initial-form.presence', async () => {
      await expect(technology).toHaveCount(1);
      await expect(technology).toBeVisible();
    });
    await test.step('diag.initial-form.editable', async () => {
      await expect(technology).toBeEditable();
    });
    await test.step('diag.initial-form.empty', async () => {
      await expect(technology).toHaveValue('');
    });
    await expect(difficulty).toHaveValue('');
    await expect(duration).toHaveValue('');
    await expect(purpose).toHaveValue('');
    await expect(preference).toHaveValue('');
    await expect(page.getByText('例：React')).toBeVisible();
    await expect(page.getByRole('complementary', { name: '公開について' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2, name: '提案された課題' })).toHaveCount(0);

    await difficulty.selectOption('1');
    await expect(difficulty).not.toHaveValue('');
    await expect(difficulty).toHaveAttribute('aria-describedby', 'difficulty-guide');
  },
);
