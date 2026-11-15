import { expect, test } from '@playwright/test';

import {
  expectActiveElement,
  expectNoDocumentOverflow,
  expectVisibleFocusIndicator,
} from '../helpers/accessibility-assertions.ts';
import { requireEnvironment } from '../helpers/environment.ts';
import { createTestDetails } from '../helpers/test-metadata.ts';
import { expectApplicationNavigation } from '../helpers/navigation-assertions.ts';

test(
  '[T-015][navigation-title-focus] navigation title and focus follow SPA transitions',
  createTestDetails({
    testId: 'T-015',
    caseId: 'navigation-title-focus',
    classification: 'deployed',
  }),
  async ({ page }) => {
    await page.goto('/shared-histories/invalid');
    await expect(page).toHaveTitle('共有履歴の詳細 | Dev Menu');
    await expectApplicationNavigation(page, 'shared-history');

    await page
      .getByRole('navigation', { name: 'メインナビゲーション' })
      .getByRole('link', { name: '課題を注文' })
      .click();
    const heading = page.getByRole('heading', { level: 1, name: '課題を注文' });
    await expect(page).toHaveTitle('課題を注文 | Dev Menu');
    await expectApplicationNavigation(page, 'practice-proposal');
    await expectActiveElement(heading);
  },
);

test(
  '[T-016][keyboard-responsive] keyboard focus remains visible without narrow overflow',
  createTestDetails({
    testId: 'T-016',
    caseId: 'keyboard-responsive',
    classification: 'deployed',
  }),
  async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    await page.keyboard.press('Tab');
    await expectVisibleFocusIndicator(page.getByRole('link', { name: 'Dev Menu' }));
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/shared-histories$/);
    await expectNoDocumentOverflow(page);
  },
);

test(
  '[T-018][browser-security-boundary] public routes expose no authentication or browser secret state',
  createTestDetails({
    testId: 'T-018',
    caseId: 'browser-security-boundary',
    classification: 'deployed',
  }),
  async ({ page }) => {
    const frontendOrigin = new URL(requireEnvironment('PUBLIC_BASE_URL')).origin;
    const requestCategories: string[] = [];
    page.on('request', (request) => {
      const requestUrl = new URL(request.url());
      requestCategories.push(requestUrl.origin === frontendOrigin ? 'same-origin' : 'external');
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: '課題を注文' })).toBeVisible();
    await expect(page.getByRole('button', { name: /ログイン|サインイン|認証/ })).toHaveCount(0);
    const scriptPaths = await page
      .locator('script[src]')
      .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));
    let artifactSecretPatternCount = 0;
    for (const scriptPath of scriptPaths) {
      const scriptResponse = await page.request.get(scriptPath);
      const scriptBody = await scriptResponse.text();
      artifactSecretPatternCount += [
        /AKIA[0-9A-Z]{16}/g,
        /AWS_SECRET_ACCESS_KEY/g,
        /aws_secret_access_key/g,
        /bedrock-runtime\.[a-z0-9-]+\.amazonaws\.com/g,
      ].reduce((count, pattern) => count + (scriptBody.match(pattern)?.length ?? 0), 0);
    }
    const browserState = await page.evaluate(() => ({
      localKeyCount: localStorage.length,
      sessionKeyCount: sessionStorage.length,
      awsCredentialPatternCount: (
        document.documentElement.textContent.match(/AKIA[0-9A-Z]{16}/g) ?? []
      ).length,
    }));
    expect(browserState).toEqual({
      localKeyCount: 0,
      sessionKeyCount: 0,
      awsCredentialPatternCount: 0,
    });
    expect(artifactSecretPatternCount).toBe(0);
    expect(requestCategories.filter((category) => category === 'external')).toHaveLength(0);
  },
);

test(
  '[T-019][stateless-scope] reload and a new context do not restore transient proposal state',
  createTestDetails({ testId: 'T-019', caseId: 'stateless-scope', classification: 'deployed' }),
  async ({ browser, page }) => {
    let postCount = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST') postCount += 1;
    });

    const technology = page.getByRole('textbox', { name: /^学びたい技術\s*必須$/ });
    await page.goto('/');
    await test.step('diag.stateless.initial-edit', async () => {
      await expect(technology).toHaveCount(1);
      await expect(technology).toBeEditable();
      await technology.fill('temporary-value');
    });
    await test.step('diag.stateless.reload-clear', async () => {
      await page.reload();
      await expect(technology).toHaveValue('');
      expect(postCount).toBe(0);
    });

    await test.step('diag.stateless.fresh-context', async () => {
      const context = await browser.newContext();
      const freshPage = await context.newPage();
      try {
        await freshPage.goto('/');
        await expect(freshPage.getByRole('textbox', { name: /^学びたい技術\s*必須$/ })).toHaveValue(
          '',
        );
        for (const excludedControl of [/チャット/, /全文検索/, /進捗/, /課題を保存/]) {
          await expect(freshPage.getByRole('button', { name: excludedControl })).toHaveCount(0);
        }
      } finally {
        await context.close();
      }
    });
  },
);
