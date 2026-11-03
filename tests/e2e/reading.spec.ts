import { test, expect } from '@playwright/test';

test('trang chủ giữ giới thiệu và bài mới trên mobile, cây thư mục vẫn truy cập được', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.hero h1')).toHaveText('Drakie14');
  await expect(page.locator('#main')).toBeVisible();
  if (info.project.name === 'mobile')
    await page.screenshot({ path: info.outputPath('home-mobile.png'), fullPage: true });
  const latest = page.locator('.latest a.row:visible');
  await expect(latest).toHaveCount(info.project.name === 'mobile' ? 3 : 5);
  if (info.project.name === 'mobile') {
    const main = await page.locator('#main').boundingBox();
    const sidebar = await page.locator('[data-sidebar]').boundingBox();
    expect(main!.y + main!.height).toBeLessThanOrEqual(sidebar!.y);
    await expect(page.locator('.desktop-stats')).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-search-input]').scrollIntoViewIfNeeded();
  await page.locator('[data-search-input]').fill('XSS');
  await expect(page.locator('[data-list-results] a.row').first()).toBeVisible();
  await page.locator('[data-sidebar]').evaluate((el) => {
    (el as HTMLElement).dataset.e2eIdentity = 'persisted';
  });
  await page.locator('[data-list-results] a.row').first().click();
  await expect(page.locator('[data-sidebar]')).toHaveAttribute('data-e2e-identity', 'persisted');
  await expect(page.locator('[data-article-body]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.hero h1')).toHaveText('Drakie14');
  await expect(page.locator('[data-search-input]')).toHaveValue('XSS');
  await expect(page.locator('[data-list-results] a.row').first()).toBeVisible();
});

test('copy code, mục lục và bàn phím trên bài dài', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/posts/xss/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  const copy = page.locator('.copy-btn[data-copy]').first();
  const source = await copy.locator('xpath=ancestor::figure').locator('pre code').textContent();
  await copy.scrollIntoViewIfNeeded();
  await copy.click();
  await expect(copy).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(source);
  await page.locator('[data-toc-toggle]').click();
  await expect(page.locator('[data-toc-toggle]')).toHaveAttribute('aria-expanded', 'true');
  const link = page.locator('[data-toc-link]').nth(2);
  const href = await link.getAttribute('href');
  await link.click();
  await expect.poll(() => new URL(page.url()).hash).toBe(href);
});
