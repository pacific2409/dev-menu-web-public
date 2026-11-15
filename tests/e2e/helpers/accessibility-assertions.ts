import { expect, type Locator, type Page } from '@playwright/test';

export async function expectActiveElement(locator: Locator) {
  await expect(locator).toBeFocused();
}

export async function expectVisibleFocusIndicator(locator: Locator) {
  await locator.focus();
  const hasVisibleIndicator = await locator.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return (
      style.boxShadow !== 'none' || (style.outlineStyle !== 'none' && style.outlineWidth !== '0px')
    );
  });
  expect(hasVisibleIndicator).toBe(true);
}

export async function expectNoDocumentOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
}
