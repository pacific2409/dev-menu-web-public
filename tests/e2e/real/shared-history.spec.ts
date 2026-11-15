import { expect, test } from '@playwright/test';

import { loadRealSystemInputs } from '../fixtures/real-system-inputs.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';

test(
  '[T-009][fixture-order] real shared histories retain the approved fixture order and navigation',
  createTestDetails({ testId: 'T-009', caseId: 'fixture-order', classification: 'real' }),
  async ({ page }) => {
    const inputs = loadRealSystemInputs();
    await page.goto('/shared-histories');
    await page.getByRole('combobox', { name: '技術' }).selectOption(inputs.technologyId);

    const list = page.getByRole('list', { name: `${inputs.fixtureTechnologyName}の共有履歴` });
    const links = list.getByRole('link');
    await expect(links).toHaveCount(inputs.orderedHistoryIds.length);
    const observedIds = await links.evaluateAll((elements) =>
      elements.map((element) =>
        new URL((element as HTMLAnchorElement).href).pathname.split('/').at(-1),
      ),
    );
    expect(observedIds).toEqual(inputs.orderedHistoryIds);
    await expect(list.locator('time[datetime]')).toHaveCount(inputs.orderedHistoryIds.length);

    await links.first().focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/shared-histories\/[1-9][0-9]*$/);
  },
);
