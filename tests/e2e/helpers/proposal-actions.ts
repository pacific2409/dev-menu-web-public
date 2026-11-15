import type { Page } from '@playwright/test';

export async function fillProposalForm(page: Page, technologyName = 'Technology A') {
  await page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ }).fill(technologyName);
  await page.getByRole('combobox', { name: /^難易度\s*必須$/ }).selectOption('1');
  await page.getByRole('spinbutton', { name: /^取り組める時間\s*必須$/ }).fill('2');
  await page.getByRole('combobox', { name: /^目的\s*必須$/ }).selectOption('1');
}

export async function submitProposal(page: Page) {
  await page.getByRole('button', { name: '課題を提案してもらう' }).click();
}
