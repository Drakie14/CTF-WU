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

test('bản đồ nhiều điểm mở cửa sổ chọn bài bằng hover, touch và bàn phím', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Lộ trình học', exact: true }).click();
  await expect(page).toHaveURL(/\/learn\/$/);
  const xss = page.locator('#xss');
  await expect(xss.locator('[data-learning-stop]')).toHaveCount(7);
  await expect(page.locator('#injection')).toBeHidden();
  const first = page.locator('#xss-stage-1');
  const second = page.locator('#xss-reflected');
  const firstPanel = page.locator('#xss-stage-1-panel');
  const panel = page.locator('#xss-reflected-panel');
  const mapBefore = await xss.locator('.road-map').boundingBox();
  if (info.project.name === 'desktop') {
    const focusBefore = await page.evaluate(() => document.activeElement?.id);
    await first.hover();
    await expect(firstPanel).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const cursor = document.querySelector<HTMLElement>('.reze-cursor')!;
      const old = cursor.style.pointerEvents;
      cursor.style.pointerEvents = 'auto';
      const rect = cursor.getBoundingClientRect();
      const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      cursor.style.pointerEvents = old;
      return topmost?.closest('.reze-cursor') === cursor;
    })).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(focusBefore);
    await expect.poll(() => second.evaluate(button => {
      const r = button.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-learning-stop]')?.id;
    })).toBe('xss-reflected');
    await second.hover();
  } else {
    await first.tap();
    await expect(firstPanel).toBeVisible();
    await second.tap();
  }
  await expect(panel).toBeVisible();
  await expect(firstPanel).toBeHidden();
  const mapAfter = await xss.locator('.road-map').boundingBox();
  expect(mapAfter!.height).toBe(mapBefore!.height);
  if (info.project.name === 'desktop') {
    const link = panel.locator('[data-lesson]').first();
    const target = await link.boundingBox();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 15 });
    await page.waitForTimeout(350);
    await expect(panel).toBeVisible();
  }
  await panel.locator('[data-lesson]').first().click();
  await expect(page.locator('[data-article-body]')).toBeVisible();
  if (info.project.name === 'mobile') await page.locator('[data-back]').click();
  else await page.goBack();
  await expect(page).toHaveURL(/\/learn\/#xss-reflected$/);
  await expect(page.locator('#xss-reflected-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#xss-reflected-panel')).toBeHidden();
  await expect(page.locator('#xss-reflected')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#xss-reflected-panel [data-lesson]').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Chọn lộ trình' }).getByRole('link', { name: 'Injection', exact: true }).click();
  await expect(page.locator('#xss')).toBeHidden();
  await expect(page.locator('#injection [data-learning-stop]')).toHaveCount(8);
  const injection = page.locator('#injection-stage-1');
  if (info.project.name === 'desktop') await injection.hover();
  else await injection.tap();
  await expect(page.locator('#injection-stage-1-panel')).toBeVisible();
  await page.locator('.learning h1').click();
  await expect(page.locator('#injection-stage-1-panel')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
