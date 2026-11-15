import { expect, type Page } from '@playwright/test';

export async function expectApplicationNavigation(
  page: Page,
  currentPage: 'practice-proposal' | 'shared-history',
) {
  const navigation = page.getByRole('navigation', { name: 'メインナビゲーション' });
  await expect(navigation).toBeVisible();
  const proposalLink = navigation.getByRole('link', { name: '課題を注文' });
  const historyLink = navigation.getByRole('link', { name: '共有履歴' });
  if (currentPage === 'practice-proposal') {
    await expect(proposalLink).toHaveAttribute('aria-current', 'page');
    await expect(historyLink).not.toHaveAttribute('aria-current');
  } else {
    await expect(proposalLink).not.toHaveAttribute('aria-current');
    await expect(historyLink).toHaveAttribute('aria-current', 'page');
  }
}
