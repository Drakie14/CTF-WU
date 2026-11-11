import { test, expect, type Page } from '@playwright/test';
import { parse } from 'yaml';
const file = 'src/content/posts/Dreamhack/metadata/index.md';
const source =
  '---\ntitle: Metadata\ndate: 2026-11-03\nctf: Dreamhack\ncategory: web\nsummary: Tóm tắt gốc\npoints: 42\ncover: ./cover.png\ndraft: true\n---\n\n## Solution\n\n$x^2$\n\n```mermaid\ngraph TD\n A-->B\n```\n';
async function mockRepository(page: Page, holdHiddenState = false) {
  let releaseHidden = () => {};
  const hiddenState = holdHiddenState
    ? new Promise<void>((resolve) => {
        releaseHidden = resolve;
      })
    : Promise.resolve();
  page.once('close', () => releaseHidden());
  let saved = '';
  await page.addInitScript(() => {
    localStorage.setItem('ctf-wu.studio-token', 'test-only');
    localStorage.setItem('ctf-wu.studio.tree-open', JSON.stringify(['Dreamhack']));
  });
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname.replace('/repos/Drakie14/CTF-WU', '');
    if (p === '/git/blobs/old') await hiddenState;
    let data: unknown = {};
    if (p === '/git/ref/heads/main') data = { object: { sha: 'head' } };
    else if (p === '/git/trees/head') data = { tree: [{ path: file, type: 'blob', sha: 'old' }] };
    else if (p === '/git/blobs/old' || p.startsWith('/contents/'))
      data = { sha: 'old', content: Buffer.from(source).toString('base64') };
    else if (p === '/git/commits/head') data = { tree: { sha: 'base' } };
    else if (p === '/git/blobs' && request.method() === 'POST') data = { sha: 'blob' };
    else if (p === '/git/trees' && request.method() === 'POST') {
      saved = request.postDataJSON().tree[0].content;
      data = { sha: 'tree' };
    } else if (p === '/git/commits' && request.method() === 'POST')
      data = { sha: 'commit', html_url: 'https://example.com/commit' };
    await route.fulfill({ json: data });
  });
  return Object.assign(() => saved, { releaseHidden });
}

test('URL folder và bài hỗ trợ Back, Forward, reload mà vẫn giữ sửa đổi', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  await page.goto('/admin/studio/');
  await page.locator('.folder-open').filter({ hasText: 'Dreamhack' }).click();
  await expect(page).toHaveURL(/\/admin\/studio\/folder\/Dreamhack\/$/);
  await page.locator('[data-folder-files] .file-open').click();
  await expect(page).toHaveURL(/\/admin\/studio\/post\/Dreamhack\/metadata\/index.md\/$/);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nBan nhap qua lai.');
  await page.goBack();
  await expect(page.locator('[data-library-home]')).toBeVisible();
  await expect(page).toHaveURL(/\/folder\/Dreamhack\/$/);
  await expect(page.locator('[data-history-forward]')).toBeEnabled();
  await page.locator('[data-history-forward]').click();
  await expect(page.locator('.cm-content')).toContainText('Ban nhap qua lai.');
  const reply = await page.reload();
  expect(reply!.status()).toBe(200);
  await expect(page.locator('[data-title]')).toHaveValue('Metadata');
  await expect(page.locator('.cm-content')).toContainText('Ban nhap qua lai.');
  await expect(page).toHaveTitle('Metadata · Write-up Studio');
  await page.locator('[data-history-back]').click();
  await expect(page.locator('[data-library-home]')).toBeVisible();
  await expect(page.locator('[data-library-title]')).toHaveText('Dreamhack');
});

test('Back lúc đang mở bài không bị request cũ kéo trở lại editor', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  let reading = false;
  let release = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  page.once('close', release);
  await page.route('https://api.github.com/**/contents/**', async (route) => {
    reading = true;
    await waiting;
    await route.fallback();
  });
  await page.goto('/admin/studio/');
  await page.locator('.folder-open').filter({ hasText: 'Dreamhack' }).click();
  await expect(page).toHaveURL(/\/folder\/Dreamhack\/$/);
  await page.locator('[data-folder-files] .file-open').click();
  await expect.poll(() => reading).toBe(true);
  await page.goBack();
  release();
  await expect(page).toHaveURL(/\/admin\/studio\/$/);
  await expect(page.locator('[data-library-home]')).toBeVisible();
  await expect(page.locator('[data-composer]')).toBeHidden();
  await page.goForward();
  await expect(page.locator('[data-library-title]')).toHaveText('Dreamhack');
  await expect(page.locator('[data-composer]')).toBeHidden();
});

test('URL nháp mới mở trực tiếp và reload khôi phục đủ metadata/body', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  await page.goto('/admin/studio/new/Dreamhack/');
  await expect(page.locator('[data-composer]')).toBeVisible();
  await page.locator('[data-title]').fill('Draft URL');
  await page.locator('.cm-content').click();
  await page.keyboard.type('Noi dung chua publish.');
  const reply = await page.reload();
  expect(reply!.status()).toBe(200);
  await expect(page.locator('[data-title]')).toHaveValue('Draft URL');
  await expect(page.locator('.cm-content')).toContainText('Noi dung chua publish.');
  await expect(page.locator('[data-folder]')).toHaveValue('Dreamhack');
});

for (const reduced of [false, true]) test(`Studio chuyển màn ${reduced ? 'không animation khi giảm chuyển động' : 'có animation'}`, async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    (window as Window & { studioMotionCount?: number }).studioMotionCount = 0;
    Element.prototype.animate = function (...args) {
      if (this.classList.contains('workspace')) {
        const state = window as Window & { studioMotionCount?: number };
        state.studioMotionCount = (state.studioMotionCount ?? 0) + 1;
      }
      return animate.apply(this, args);
    };
  });
  await page.goto('/admin/studio/');
  await page.locator('.folder-open').filter({ hasText: 'Dreamhack' }).click();
  await expect(page).toHaveURL(/\/folder\/Dreamhack\/$/);
  await page.locator('[data-folder-files] .file-open').click();
  await expect(page).toHaveURL(/\/post\//);
  const count = await page.evaluate(() => (window as Window & { studioMotionCount?: number }).studioMotionCount ?? 0);
  if (reduced) expect(count).toBe(0);
  else expect(count).toBeGreaterThan(0);
});

test('metadata cuộn được để nhập API key trên màn hình desktop thấp', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Kiểm tra popup desktop ở chiều cao thấp');
  await page.setViewportSize({ width: 1440, height: 600 });
  await mockRepository(page);
  await page.goto('/admin/studio/post/Dreamhack/metadata/index.md/');
  await expect(page.locator('[data-composer]')).toBeVisible();
  await page.locator('[data-metadata-toggle]').click();
  await page.locator('[data-ai-key] summary').click();
  await page.locator('[data-gemini-key]').fill('test-key');
  await expect(page.locator('[data-gemini-key]')).toBeInViewport();
  const metrics = await page.locator('[data-metadata]').evaluate((panel) => ({
    bottom: panel.getBoundingClientRect().bottom, scrollable: panel.scrollHeight > panel.clientHeight, scroll: panel.scrollTop,
  }));
  expect(metrics.bottom).toBeLessThanOrEqual(600);
  expect(metrics.scrollable).toBe(true);
  expect(metrics.scroll).toBeGreaterThan(0);
});

test('Studio màn hình nhỏ mở được token và thư viện để chọn bài', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Kiểm tra thư viện dạng drawer trên màn hình nhỏ');
  await mockRepository(page);
  await page.addInitScript(() => localStorage.removeItem('ctf-wu.studio-token'));
  await page.goto('/admin/studio/');
  await page.locator('[data-connection]').click();
  await expect(page.locator('[data-token]')).toBeVisible();
  await page.locator('[data-token]').fill('test-only');
  await page.locator('[data-connect]').click();
  await expect(page.locator('.tree-file .tree-open')).toBeVisible();
  await page.locator('.tree-file .tree-open').click();
  await expect(page.locator('[data-composer]')).toBeVisible();
  await expect(page).toHaveURL(/\/post\/Dreamhack\/metadata\/index.md\/$/);
  await expect(page.locator('[data-sidebar-toggle]')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('[data-sidebar-toggle]').click();
  await expect(page.locator('.tree-file .tree-open')).toBeVisible();
  await page.locator('[data-library-backdrop]').click({ position: { x: 370, y: 150 } });
  await expect(page.locator('[data-sidebar-toggle]')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert');
});

test('reload vẫn mở được bài local khi GitHub chưa trả lời', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  const path = 'Dreamhack/Extra/Bronze/blind-command/index.md';
  const localSource = '---\ntitle: Blind Command\ndate: 2026-11-03\nctf: Dreamhack\ncategory: web\n---\n\n## Solution\n\nNội dung local chưa publish.';
  let release = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  page.once('close', release);
  await page.route('**/__studio/local', (route) => route.fulfill({ json: { ok: true } }));
  await page.route('**/__studio/git/**', async (route) => {
    await waiting;
    await route.fulfill({ status: 503, body: 'GitHub unavailable' });
  });
  await page.route('**/__studio/fs/**', async (route) => {
    const url = new URL(route.request().url());
    const relative = url.searchParams.get('path') ?? '';
    if (url.pathname.endsWith('/entries')) {
      const parts = path.slice(relative ? relative.length + 1 : 0).split('/');
      await route.fulfill({ json: [{ name: parts[0], kind: parts.length > 1 ? 'directory' : 'file' }] });
    } else if (url.pathname.endsWith('/stat')) {
      await route.fulfill({ json: { kind: relative === path ? 'file' : 'directory' } });
    } else if (url.pathname.endsWith('/file') && route.request().method() === 'GET') {
      await route.fulfill({ body: localSource });
    } else await route.fulfill({ status: 204 });
  });
  await page.addInitScript(() => {
    localStorage.setItem('ctf-wu.studio.tree-open', JSON.stringify(['Dreamhack', 'Dreamhack/Extra', 'Dreamhack/Extra/Bronze']));
  });
  try {
    await page.goto('/admin/studio/');
    for (let attempt = 0; attempt < 2; attempt++) {
      const post = page.locator('.tree-file[data-local] .tree-open');
      await expect(post).toContainText('blind-command');
      await post.click();
      await expect(page.locator('[data-title]')).toHaveValue('Blind Command');
      await expect(page.locator('.cm-content')).toContainText('Nội dung local chưa publish.');
      if (attempt === 0) await page.reload();
    }
    release();
    await expect(page.locator('[data-library-status]')).toContainText('503');
    await expect(page.locator('.tree-file[data-local] .tree-open')).toContainText('blind-command');
  } finally {
    release();
  }
});

test('Studio mở, sửa body, preview và publish giữ metadata', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  const saved = await mockRepository(page, true);
  await page.goto('/admin/studio/');
  await page.locator('.tree-file .tree-open').click();
  await expect(page.locator('[data-composer]')).toBeVisible();
  await expect(page.locator('[data-preview] .katex').first()).toBeVisible();
  await expect(page.locator('[data-preview] .mermaid svg')).toBeVisible({ timeout: 20000 });
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\nTôi giữ nguyên flag `DH{testflag}`.');
  await page.locator('[data-publish]').click();
  await expect.poll(saved).toContain('Tôi giữ nguyên flag');
  saved.releaseHidden();
  const frontmatter = parse(/^---\n([\s\S]*?)\n---/.exec(saved())![1]);
  expect(frontmatter).toMatchObject({
    summary: 'Tóm tắt gốc',
    points: 42,
    cover: './cover.png',
    draft: true,
  });
});

test('nháp cũ không tự ghi đè bản GitHub mới mở', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  await page.addInitScript(
    ({ file, source }) => {
      localStorage.setItem(
        `ctf-wu.studio.draft.${file}`,
        JSON.stringify({
          title: 'Bản nháp cũ',
          folder: 'Dreamhack',
          date: '2026-11-03',
          ctf: 'Dreamhack',
          category: 'web',
          difficulty: '',
          tags: '',
          source: 'Nội dung nháp cũ',
          originalSource: source,
          base: 'outdated-base',
        }),
      );
    },
    { file, source },
  );
  await page.goto('/admin/studio/');
  await page.locator('.tree-file .tree-open').click();
  await expect(page.locator('[data-title]')).toHaveValue('Metadata');
  await expect(page.locator('.cm-content')).not.toContainText('Nội dung nháp cũ');
  await expect(page.locator('[data-stale-draft]')).toBeVisible();
  await page.locator('[data-stale-draft]').click();
  await expect(page.locator('.cm-content')).toContainText('Nội dung nháp cũ');
});

test('khôi phục đủ ảnh nháp từ IndexedDB trước khi đưa body vào preview', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  const wrongRequests: string[] = [];
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    wrongRequests.push(route.request().url());
    await route.fulfill({ status: 404 });
  });
  await page.goto('/admin/studio/');
  await expect(page.locator('.tree-file .tree-open')).toBeVisible();
  await page.locator('.tree-file .tree-open').click();
  await expect(page.locator('[data-composer]')).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nBai dang mo.');
  await expect.poll(() => page.evaluate((file) => localStorage.getItem(`ctf-wu.studio.draft.${file}`), file)).not.toBeNull();
  await page.evaluate(async ({ file, source }) => {
    const key = `ctf-wu.studio.draft.${file}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    localStorage.setItem(key, JSON.stringify({ title: 'Metadata', folder: 'Dreamhack', date: '2026-11-03', ctf: 'Dreamhack', category: 'web', difficulty: '', tags: '', source: '![image](./draft-image.png)', originalSource: source, base: [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, '0')).join('') }));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('ctf-wu-studio-local', 2);
      request.onupgradeneeded = () => {
        for (const name of ['handles', 'draft-assets']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('draft-assets', 'readwrite');
      tx.objectStore('draft-assets').put([{ name: 'draft-image.png', file: new File([bytes], 'draft-image.png', { type: 'image/png' }) }], key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    let release = () => {};
    const ready = new Promise<void>((resolve) => { release = resolve; });
    (window as Window & { releaseDraftAssets?: () => void }).releaseDraftAssets = release;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (...args: Parameters<IDBFactory['open']>) => {
      const request = open(...args);
      request.addEventListener('success', (event) => {
        (window as Window & { readingDraftAssets?: boolean }).readingDraftAssets = true;
        event.stopImmediatePropagation();
        void ready.then(() => request.onsuccess?.call(request, event));
      }, { once: true });
      return request;
    };
  }, { file, source });
  await page.locator('.tree-file .tree-open').click();
  await expect.poll(() => page.evaluate(() => (window as Window & { readingDraftAssets?: boolean }).readingDraftAssets)).toBe(true);
  // Chờ lâu hơn debounce autosave: bản đang nạp không được ghi đè nháp đang khôi phục.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 600)));
  expect(await page.evaluate((file) => JSON.parse(localStorage.getItem(`ctf-wu.studio.draft.${file}`)!).source, file)).toBe('![image](./draft-image.png)');
  await page.evaluate(() => (window as Window & { releaseDraftAssets?: () => void }).releaseDraftAssets!());
  await expect(page.locator('[data-composer]')).toBeVisible();
  await expect(page.locator('[data-preview] img')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('[data-preview] img')).toHaveJSProperty('naturalWidth', 1);
  expect(wrongRequests).toEqual([]);
});

test('Save folder không ghi đè khi GitHub đã đổi từ lúc chuẩn bị thay đổi', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  const pending = { base: 'outdated-head', entries: [{ path: file, mode: '100644', type: 'blob', sha: 'staged' }], messages: ['content: ẩn bài'] };
  await page.addInitScript((pending) => localStorage.setItem('ctf-wu.studio.pending-folders', JSON.stringify(pending)), pending);
  const writes: string[] = [];
  await page.route('https://api.github.com/**', async (route) => {
    if (route.request().method() !== 'GET') writes.push(route.request().url());
    await route.fallback();
  });
  await page.goto('/admin/studio/');
  await expect(page.locator('[data-pending-bar]')).toBeVisible();
  await page.locator('[data-pending-save]').click();
  await expect(page.locator('[data-library-status]')).toContainText('GitHub đã đổi');
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ctf-wu.studio.pending-folders')!))).toEqual(pending);
});

test('folder mới ghi nhớ bản GitHub gốc và Save được bình thường', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  await page.goto('/admin/studio/');
  await expect(page.locator('.tree-file .tree-open')).toBeVisible();
  await page.locator('[data-folder-create]').click();
  await page.locator('[data-name-input]').fill('Empty');
  await page.locator('[data-name-submit]').click();
  await expect(page.locator('[data-pending-bar]')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ctf-wu.studio.pending-folders')!).base)).toBe('head');
  await page.locator('[data-pending-save]').click();
  await expect(page.locator('[data-pending-bar]')).toBeHidden();
  await expect(page.locator('[data-library-status]')).toContainText('Đã lưu 1 thay đổi');
});

test('upload nhiều file cùng tên trong một lượt vẫn có tên riêng', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await mockRepository(page);
  await page.addInitScript(() => { Date.now = () => 1794020897306; });
  await page.goto('/admin/studio/');
  await page.locator('.tree-file .tree-open').click();
  await expect(page.locator('[data-composer]')).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await page.locator('[data-assets]').setInputFiles(Array.from({ length: 3 }, () => ({ name: 'image.png', mimeType: 'image/png', buffer: png })));
  const names = await page.locator('.asset-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('title')));
  expect(names).toHaveLength(3);
  expect(new Set(names).size).toBe(3);
  for (const image of await page.locator('[data-preview] img').all()) await expect(image).toHaveJSProperty('naturalWidth', 1);
});

test('Publish khóa thao tác khi request đang chạy để không mất sửa đổi mới', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  const saved = await mockRepository(page);
  let release = () => {};
  const ready = new Promise<void>((resolve) => { release = resolve; });
  page.once('close', release);
  await page.route('https://api.github.com/**/git/trees', async (route) => {
    await ready;
    await route.fallback();
  });
  await page.goto('/admin/studio/');
  await page.locator('.tree-file .tree-open').click();
  await expect(page.locator('[data-composer]')).toBeVisible();
  await page.locator('[data-publish]').click();
  await expect(page.locator('.studio')).toHaveAttribute('inert', '');
  await page.keyboard.type('Sửa trong lúc publish');
  await expect(page.locator('.cm-content')).not.toContainText('Sửa trong lúc publish');
  release();
  await expect.poll(saved).toContain('## Solution');
  await expect(page.locator('.studio')).not.toHaveAttribute('inert');
});

test('đánh giá, bỏ tag rồi Publish bị treo vẫn mở khóa và giữ nháp', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  const saved = await mockRepository(page);
  await page.addInitScript(() => localStorage.setItem('ctf-wu.studio.gemini-key', 'test-only'));
  await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({ json: {
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      tags: ['Flask', 'Cookie'], difficulty: 'Bronze 2', summary: 'Bài kiểm thử.',
    }) }] } }],
  } }));
  let release = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  page.once('close', release);
  await page.goto('/admin/studio/');
  await page.locator('.tree-file .tree-open').click();
  await page.locator('[data-metadata-toggle]').click();
  await page.locator('[data-auto-tags]').click();
  await expect(page.locator('[data-tag-toast]')).toBeVisible();
  await page.getByRole('button', { name: 'Bỏ tag Cookie', exact: true }).click();
  await expect(page.locator('[data-toast-tags]')).not.toContainText('Cookie');
  // Rút ngắn timeout của request sẽ bị giữ, không phải thời gian chờ assertion của Playwright.
  await page.evaluate(() => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = () => timeout(300);
  });
  await page.route('https://api.github.com/**/git/ref/heads/main', async (route) => {
    await waiting;
    await route.fulfill({ status: 503, body: 'Unavailable' });
  });
  try {
    await page.locator('[data-toast-publish]').click();
    await expect(page.locator('[data-status]')).toContainText('Quá thời gian chờ Publish');
    await expect(page.locator('.studio')).not.toHaveAttribute('inert');
    await expect(page.locator('[data-difficulty]')).toHaveValue('Bronze 2');
    await expect(page.locator('[data-tags]')).toHaveValue('Flask');
    await expect(page.locator('.cm-content')).toContainText('## Solution');
    expect(saved()).toBe('');
    await expect.poll(() => page.evaluate((file) => {
      const draft = localStorage.getItem(`ctf-wu.studio.draft.${file}`);
      return draft && JSON.parse(draft).tags;
    }, file)).toBe('Flask');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nVan sua duoc sau timeout');
    await expect(page.locator('.cm-content')).toContainText('Van sua duoc sau timeout');
  } finally {
    release();
  }
});

test('mở ngày dạng ngày/tháng/năm trong editor và giữ nguyên khi publish', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  const saved = await mockRepository(page);
  await page.route('https://api.github.com/**/contents/**', (route) => route.fulfill({ json: { sha: 'old', content: Buffer.from(source.replace('2026-11-03', '03/11/2026')).toString('base64') } }));
  await page.goto('/admin/studio/');
  await page.locator('.tree-file .tree-open').click();
  await expect(page.locator('[data-date]')).toHaveValue('2026-11-03');
  await page.locator('[data-publish]').click();
  await expect.poll(saved).toContain('03/11/2026');
});

test('mở bài local chờ ảnh sẵn sàng trước khi render preview', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  const directory = 'Dreamhack/local-images';
  const names = ['image.png', '1794020897306-image.png', 'ảnh chụp #1.png'];
  const body = `---\ntitle: Local images\nctf: Dreamhack\n---\n\n${names.map((name) => `![image](./${encodeURIComponent(name)})`).join('\n\n')}`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const relativeRequests: string[] = [];
  let readingImage = false;
  let releaseImages = () => {};
  const imagesReady = new Promise<void>((resolve) => { releaseImages = resolve; });
  page.once('close', releaseImages);
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/admin/studio/') && request.url().endsWith('.png'))
      relativeRequests.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem('ctf-wu.studio.tree-open', JSON.stringify(['Dreamhack']));
  });
  await page.route('**/__studio/**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405 });
    if (url.pathname === '/__studio/local') return route.fulfill({ json: { ok: true } });
    if (url.pathname === '/__studio/git/git/ref/heads/main')
      return route.fulfill({ json: { object: { sha: 'head' } } });
    if (url.pathname === '/__studio/git/git/trees/head') return route.fulfill({ json: { tree: [] } });
    const path = url.searchParams.get('path') ?? '';
    if (url.pathname === '/__studio/fs/stat')
      return route.fulfill({ json: { kind: path.endsWith('.md') ? 'file' : 'directory' } });
    if (url.pathname === '/__studio/fs/entries') {
      const entries = path === '' ? [{ name: 'Dreamhack', kind: 'directory' }]
        : path === 'Dreamhack' ? [{ name: 'local-images', kind: 'directory' }]
        : [{ name: 'index.md', kind: 'file' }, ...names.map((name) => ({ name, kind: 'file' }))];
      return route.fulfill({ json: entries });
    }
    if (url.pathname === '/__studio/fs/file' && path === `${directory}/index.md`)
      return route.fulfill({ body, contentType: 'text/markdown' });
    if (url.pathname === '/__studio/fs/file' && names.some((name) => path === `${directory}/${name}`)) {
      readingImage = true;
      await imagesReady;
      return route.fulfill({ body: png, contentType: 'image/png' });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin/studio/');
  await page.locator('.tree-file[data-local] .tree-open').click();
  await expect.poll(() => readingImage).toBe(true);
  // Để preview có cơ hội render trong lúc việc đọc ảnh còn bị giữ lại.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  releaseImages();
  await expect(page.locator('[data-composer]')).toBeVisible();
  const images = page.locator('[data-preview] img');
  await expect(images).toHaveCount(names.length);
  for (const image of await images.all()) {
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect(image).toHaveJSProperty('naturalWidth', 1);
  }
  expect(relativeRequests).toEqual([]);
});
