import { expect, type Page } from '@playwright/test';

import type { RealSystemInputs } from '../fixtures/real-system-inputs.ts';

export async function fillRealProposalForm(page: Page, inputs: RealSystemInputs) {
  await page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ }).fill(inputs.technologyInput);
  await page.getByRole('combobox', { name: /^難易度\s*必須$/ }).selectOption('1');
  await page.getByRole('spinbutton', { name: /^取り組める時間\s*必須$/ }).fill('2');
  await page.getByRole('combobox', { name: /^目的\s*必須$/ }).selectOption('1');
  await page.getByRole('textbox', { name: /^その他の希望\s*任意$/ }).fill('   ');
}

export async function submitRealProposal(page: Page) {
  await page.getByRole('button', { name: '課題を提案してもらう' }).click();
}

export async function expectCompleteProposalResult(
  page: Page,
  listName: string,
  expectResultFocus = true,
  practiceFocusName: string | RegExp = '学ぶポイント',
) {
  const heading = page.getByRole('heading', { level: 2, name: '提案された課題' });
  if (expectResultFocus) await expect(heading).toBeFocused();
  const proposals = page.getByRole('list', { name: listName }).getByRole('listitem');
  await expect(proposals).toHaveCount(3);
  for (const proposal of await proposals.all()) {
    await expect(proposal.getByRole('heading', { level: 3 })).not.toHaveText('');
    await expect(proposal.getByText('概要', { exact: true })).toBeVisible();
    await expect(proposal.getByText('達成目標', { exact: true })).toBeVisible();
    await expect(proposal.getByText(practiceFocusName, { exact: true })).toBeVisible();
  }
}
