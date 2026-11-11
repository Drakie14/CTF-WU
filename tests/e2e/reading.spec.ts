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
    const search = await page.locator('.home-search').boundingBox();
    const firstPost = await latest.first().boundingBox();
    expect(search!.y + search!.height).toBeLessThan(firstPost!.y);
    await expect(page.locator('[data-home-search-input]')).toBeInViewport();
    await expect(page.locator('[data-search-input]')).toBeHidden();
  } else {
    const lastPost = await latest.last().boundingBox();
    const stats = await page.locator('.desktop-stats').boundingBox();
    expect(lastPost!.y + lastPost!.height).toBeLessThan(stats!.y);
    await expect(latest.first()).toBeInViewport();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-sidebar]').evaluate((el) => {
    (el as HTMLElement).dataset.e2eIdentity = 'persisted';
  });
  if (info.project.name === 'mobile') {
    await page.locator('[data-home-search-input]').fill('XSS');
    await page.locator('[data-home-search-input]').press('Enter');
    await expect(page).toHaveURL(/\/search\/\?q=XSS$/);
    const result = page.locator('[data-search-page-results] li > a').first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page.locator('[data-article-body]')).toBeVisible();
    await expect(page.locator('[data-sidebar]')).toHaveAttribute('data-e2e-identity', 'persisted');
    await page.goBack();
    await expect(page.locator('[data-search-page-input]')).toHaveValue('XSS');
    await expect(page.locator('[data-search-page-results] li > a').first()).toBeVisible();
    await page.goBack();
    await expect(page.locator('.hero h1')).toHaveText('Drakie14');
    return;
  }
  await page.locator('[data-search-input]').fill('XSS');
  await expect(page.locator('[data-list-results] a.row').first()).toBeVisible();
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

test('đổi bài gỡ listener của mục lục cũ', async ({ page }) => {
  await page.goto('/posts/xss/');
  await page.evaluate(() => {
    (window as Window & { previousToc?: HTMLElement }).previousToc = document.querySelector<HTMLElement>('[data-toc]')!;
  });
  const link = page.locator('.pn a').first();
  const target = await link.getAttribute('href');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${target}$`));
  const result = await page.evaluate(() => {
    const previous = (window as Window & { previousToc?: HTMLElement }).previousToc!;
    previous.setAttribute('data-open', '');
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { detached: !previous.isConnected, changed: !previous.hasAttribute('data-open') };
  });
  expect(result).toEqual({ detached: true, changed: false });
});
