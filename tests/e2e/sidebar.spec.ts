import { test, expect } from '@playwright/test';

test('Admin mở dialog hiện tại sau khi đổi sidebar qua bộ lọc', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/posts/xss/');
  await page.evaluate(() => {
    const state = window as Window & { adminModalCalls?: boolean[] };
    state.adminModalCalls = [];
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      state.adminModalCalls!.push(this.isConnected);
      showModal.call(this);
    };
  });
  await page.locator('.art-meta .badge[href="/category/web/"]').click();
  await expect(page).toHaveURL(/\/category\/web\/$/);
  await page.locator('[data-admin-link]').click();
  await expect(page.locator('[data-admin-auth]')).toBeVisible();
  await page.locator('[data-admin-auth-close]').click();
  await page.locator('.sb-filter-clear').click();
  await expect(page).toHaveURL(/\/$/);
  await page.locator('[data-admin-link]').click();
  await expect(page.locator('[data-admin-auth]')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { adminModalCalls?: boolean[] }).adminModalCalls)).toEqual([true, true]);
  expect(errors).toEqual([]);
});

test('Back trên mobile trở về đúng từ khóa và kết quả tìm kiếm', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Nút Back trong bài chỉ hiện trên mobile');
  await page.goto('/search/?q=XSS');
  const results = page.locator('[data-search-page-results] li > a');
  await expect(results.first()).toBeVisible();
  const firstResult = await results.first().getAttribute('href');
  await results.first().click();
  await expect(page.locator('[data-article-body]')).toBeVisible();
  await expect(page.locator('[data-back]')).toHaveAttribute('href', '/search/?q=XSS');
  await page.locator('[data-back]').click();
  await expect(page).toHaveURL(/\/search\/\?q=XSS$/);
  await expect(page.locator('[data-search-page-input]')).toHaveValue('XSS');
  await expect(page.locator('[data-search-page-results] li > a').first()).toHaveAttribute('href', firstResult!);
});

test('mở kết quả tìm kiếm ở tab mới giữ nguyên đường dẫn Back của tab hiện tại', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'Kiểm tra Ctrl/click của trình duyệt desktop');
  await page.goto('/search/?q=XSS');
  const result = page.locator('[data-search-page-results] li > a').first();
  await expect(result).toBeVisible();
  const articleUrl = new URL((await result.getAttribute('href'))!, page.url()).href;
  await page.evaluate(() => sessionStorage.setItem('from-list-url', '/archive/'));
  for (const modified of [true, false]) {
    if (!modified) await result.evaluate((link) => link.setAttribute('target', '_blank'));
    // Tab dùng noopener/COOP vẫn xuất hiện trong BrowserContext.
    const opened = context.waitForEvent('page');
    await result.click(modified ? { modifiers: ['Control'] } : {});
    const tab = await opened;
    await expect(tab).toHaveURL(articleUrl);
    await tab.close();
    expect(await page.evaluate(() => sessionStorage.getItem('from-list-url'))).toBe('/archive/');
    await expect(page).toHaveURL(/\/search\/\?q=XSS$/);
  }
});
