import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { studioRouteUrl } from '../../src/lib/studio-route';
import { readDocument } from '../../src/lib/studio-document';

const postsRoot = 'src/content/posts/';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const source = (title: string, body = '## Solution\n\nOriginal body.', tags = '') =>
  `---\ntitle: ${title}\ndate: 2026-11-03\nctf: Dreamhack\ncategory: web\ntags: [${tags}]\n---\n\n${body}\n`;
type Post = { path: string; source: string; sha: string };
type TreeEntry = { path: string; sha?: string; content?: string };

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Luồng authoring chạy trên desktop');
  await page.route('https://raw.githubusercontent.com/**', (route) => route.fulfill({ status: 404 }));
});

async function mockRepository(page: Page, posts: Post[], local = false, remoteAssets: Array<{ path: string; sha: string }> = []) {
  const writes = { blobs: [] as Array<{ content: string; encoding: string }>, tree: [] as TreeEntry[] };
  await page.addInitScript(() => {
    localStorage.setItem('ctf-wu.studio-token', 'test-only');
    localStorage.setItem('ctf-wu.studio.tree-open', JSON.stringify(['Dreamhack']));
    localStorage.setItem('ctf-wu.studio.ai-provider', 'gemini');
    localStorage.removeItem('ctf-wu.studio.gemini-key');
  });
  await page.route('**/__studio/local', (route) => route.fulfill({ json: { ok: local } }));
  await page.route('**/__studio/sync', (route) => route.fulfill({ json: { ok: true, message: 'Mock sync' } }));
  await page.route(/https:\/\/api\.github\.com\/repos\/Drakie14\/CTF-WU\/|\/__studio\/git\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/repos\/Drakie14\/CTF-WU|^\/__studio\/git/, '');
    let data: unknown;
    if (path === '/git/ref/heads/main') data = { object: { sha: 'head' } };
    else if (path === '/git/trees/head') data = { tree: [...posts, ...remoteAssets].map((post) => ({ path: postsRoot + post.path, type: 'blob', sha: post.sha })) };
    else if (path.startsWith('/git/blobs/') || path.startsWith('/contents/')) {
      const post = posts.find((post) => path === `/git/blobs/${post.sha}` || decodeURIComponent(path) === `/contents/${postsRoot}${post.path}`);
      if (post) data = { sha: post.sha, content: Buffer.from(post.source).toString('base64') };
    } else if (path === '/git/commits/head') data = { tree: { sha: 'base' } };
    else if (path === '/git/blobs' && request.method() === 'POST') {
      writes.blobs.push(request.postDataJSON());
      data = { sha: `asset-${writes.blobs.length}` };
    } else if (path === '/git/trees' && request.method() === 'POST') {
      writes.tree = request.postDataJSON().tree;
      data = { sha: 'tree' };
    } else if (path === '/git/commits' && request.method() === 'POST') data = { sha: 'commit', html_url: 'https://example.com/commit' };
    else if (path === '/git/refs/heads/main' && request.method() === 'PATCH') data = { object: { sha: 'commit' } };
    await route.fulfill(data ? { json: data } : { status: 404, body: `Missing mock: ${path}` });
  });
  return writes;
}

async function mockFilesystem(page: Page, initial: Record<string, Buffer> = {}, failWrites = false) {
  const files = new Map(Object.entries(initial));
  const directories = new Set(['', 'Dreamhack']);
  const state = { attempts: 0, files, directories, removed: [] as string[] };
  const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const addDirectory = (path: string) => {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  };
  for (const file of files.keys()) addDirectory(parent(file));
  await page.route('**/__studio/fs/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.searchParams.get('path') ?? '';
    if (url.pathname.endsWith('/stat')) return route.fulfill({ json: { kind: files.has(path) ? 'file' : directories.has(path) ? 'directory' : null } });
    if (url.pathname.endsWith('/dir') && request.method() === 'POST') {
      addDirectory(path);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith('/entries')) {
      const entries = [
        ...[...directories].filter((entry) => entry && parent(entry) === path).map((entry) => ({ name: entry.split('/').pop(), kind: 'directory' })),
        ...[...files.keys()].filter((entry) => parent(entry) === path).map((entry) => ({ name: entry.split('/').pop(), kind: 'file' })),
      ];
      return route.fulfill({ json: entries });
    }
    if (url.pathname.endsWith('/file') && request.method() === 'PUT') {
      state.attempts++;
      if (failWrites) return route.fulfill({ status: 503, body: 'Filesystem unavailable' });
      files.set(path, request.postDataBuffer() ?? Buffer.alloc(0));
      return route.fulfill({ status: 204 });
    }
    if (url.pathname.endsWith('/file') && files.has(path)) {
      return route.fulfill({ body: files.get(path)!, contentType: path.endsWith('.png') ? 'image/png' : 'text/markdown' });
    }
    if (url.pathname.endsWith('/entry') && request.method() === 'DELETE') {
      state.removed.push(path);
      for (const file of files.keys()) if (file === path || file.startsWith(`${path}/`)) files.delete(file);
      for (const directory of directories) if (directory === path || directory.startsWith(`${path}/`)) directories.delete(directory);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 404 });
  });
  return state;
}

async function openPost(page: Page, path: string) {
  await page.goto(studioRouteUrl({ kind: 'post', path }));
  await expect(page.locator('[data-composer]')).toBeVisible();
}

test('lỗi ghi file local vẫn giữ nháp trình duyệt và khôi phục sau reload URL mới', async ({ page }) => {
  await mockRepository(page, [], true);
  const filesystem = await mockFilesystem(page, {}, true);
  await page.goto(studioRouteUrl({ kind: 'new', folder: 'Dreamhack' }));
  await expect(page.locator('[data-title]')).toBeVisible();
  await page.locator('[data-title]').fill('Local fallback');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('Noi dung phai giu khi o dia loi.');
  await expect.poll(() => filesystem.attempts).toBeGreaterThan(0);
  const key = 'ctf-wu.studio.draft.new:Dreamhack';
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').source, key)).toContain('Noi dung phai giu');
  await page.reload();
  await expect(page.locator('[data-title]')).toHaveValue('Local fallback');
  await expect(page.locator('.cm-content')).toContainText('Noi dung phai giu khi o dia loi.');
});

test('reload trước debounce autosave vẫn giữ phần vừa sửa trong bài đã publish', async ({ page }) => {
  const post = { path: 'Dreamhack/first/index.md', sha: 'first', source: source('First') };
  await mockRepository(page, [post]);
  await openPost(page, post.path);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  // Giữ debounce 450ms chưa chạy; chỉ handler rời trang mới có thể lưu đoạn vừa gõ.
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.keyboard.insertText('\nLatest unsaved edit.');
  await page.reload();
  await page.clock.resume();
  await expect(page.locator('.cm-content')).toContainText('Latest unsaved edit.');
});

test('gợi ý tags offline chậm không ghi metadata sang bài khác', async ({ page }) => {
  const first = { path: 'Dreamhack/first/index.md', sha: 'first', source: source('First', 'https://dreamhack.io/wargame/challenges/1234/\n\nSELECT secret FROM users', 'FirstOnly') };
  const second = { path: 'Dreamhack/second/index.md', sha: 'second', source: source('Second', '## Solution\n\nSecond body.', 'KeepSecond') };
  await mockRepository(page, [first, second]);
  let release = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  page.once('close', release);
  await page.route('**/api/dreamhack/1234', async (route) => {
    await waiting;
    await route.fulfill({ json: { difficulty: 'Bronze 3' } });
  });
  try {
    await openPost(page, first.path);
    await page.locator('[data-metadata-toggle]').click();
    const requested = page.waitForRequest('**/api/dreamhack/1234');
    await page.locator('[data-auto-tags]').click();
    await requested;
    await page.locator(`.tree-file[title="${second.path}"] .tree-open`).click();
    await expect(page.locator('[data-title]')).toHaveValue('Second');
    const response = page.waitForResponse('**/api/dreamhack/1234');
    release();
    await (await response).finished();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator('[data-tags]')).toHaveValue('KeepSecond');
    await expect(page.locator('[data-difficulty]')).toHaveValue('');
  } finally {
    release();
  }
});

test('không bỏ tệp còn được tham chiếu trong bài và báo lý do', async ({ page }) => {
  const post = { path: 'Dreamhack/first/index.md', sha: 'first', source: source('First') };
  await mockRepository(page, [post]);
  await openPost(page, post.path);
  await page.locator('[data-assets]').setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('[data-preview] img')).toHaveJSProperty('naturalWidth', 1);
  if (await page.locator('[data-assets-drawer]').isHidden()) await page.locator('[data-assets-toggle]').click();
  await page.getByRole('button', { name: 'Bỏ image.png', exact: true }).click();
  await expect(page.locator('.asset-card')).toHaveCount(1);
  await expect(page.locator('[data-status]')).toContainText(/dùng|sử dụng|tham chiếu|liên kết/i);
  await expect(page.locator('[data-preview] img')).toHaveJSProperty('naturalWidth', 1);
});

test('bài đã publish đọc ảnh mới từ local để preview và đưa vào commit', async ({ page }) => {
  const post = { path: 'Dreamhack/first/index.md', sha: 'first', source: source('First') };
  const writes = await mockRepository(page, [post], true);
  const local = source('First', '## Solution\n\nChanged locally.\n\n![image](./local.png)');
  await mockFilesystem(page, { [post.path]: Buffer.from(local), 'Dreamhack/first/local.png': png });
  await page.addInitScript(({ path, hash }) => {
    localStorage.setItem(`ctf-wu.studio.sync-baseline.${path}`, hash);
  }, { path: postsRoot + post.path, hash: createHash('sha256').update(post.source).digest('hex') });
  await openPost(page, post.path);
  await expect(page.locator('.cm-content')).toContainText('Changed locally.');
  await expect(page.locator('[data-preview] img')).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('[data-preview] img')).toHaveJSProperty('naturalWidth', 1);
  await page.locator('[data-publish]').click();
  await expect.poll(() => writes.tree.find((entry) => entry.path === `${postsRoot}Dreamhack/first/local.png`)?.sha).toBe('asset-1');
  expect(writes.blobs).toEqual([{ content: png.toString('base64'), encoding: 'base64' }]);
  expect(writes.tree.find((entry) => entry.path === postsRoot + post.path)?.content).toContain('![image](./local.png)');
});

test('đổi Folder của nháp trình duyệt vẫn reload được từ URL ban đầu', async ({ page }) => {
  await mockRepository(page, []);
  await page.goto(studioRouteUrl({ kind: 'new', folder: 'Dreamhack' }));
  await expect(page.locator('[data-title]')).toBeVisible();
  await page.locator('[data-title]').fill('Browser draft');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('Original draft body.');
  await page.locator('[data-folder]').fill('CTF Tournament/CSCTF 2026');
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\nLatest after changing folder.');
  await expect(page).toHaveURL(/\/new\/Dreamhack\/$/);
  await page.reload();
  await expect(page.locator('[data-title]')).toHaveValue('Browser draft');
  await expect(page.locator('[data-folder]')).toHaveValue('CTF Tournament/CSCTF 2026');
  await expect(page.locator('.cm-content')).toContainText('Latest after changing folder.');
});

test('đổi tên nháp local gặp lỗi giữ URL, thư mục cũ và phần vừa sửa', async ({ page }) => {
  await mockRepository(page, [], true);
  const filesystem = await mockFilesystem(page);
  await page.goto(studioRouteUrl({ kind: 'new', folder: 'Dreamhack' }));
  await expect(page.locator('[data-title]')).toBeVisible();
  await page.locator('[data-title]').fill('Local A');
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('Original local draft.');
  await expect(page).toHaveURL(/\/post\/Dreamhack\/local-a\/index.md\/$/);
  let held = false;
  let release = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  page.once('close', release);
  await page.route('**/__studio/fs/file?*', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).searchParams.get('path');
    // Cho phép copy bản A trước, chỉ giữ lần ghi nội dung mới có title B.
    if (request.method() !== 'PUT' || path !== 'Dreamhack/local-b/index.md' || !request.postData()?.includes('Local B')) return route.fallback();
    held = true;
    await waiting;
    return route.fulfill({ status: 503, body: 'Rename destination unavailable' });
  });
  try {
    await page.locator('[data-title]').fill('Local B');
    await expect.poll(() => held).toBe(true);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\nLatest while rename is failing.');
    const failed = page.waitForResponse((reply) => reply.url().includes('/__studio/fs/file?') && reply.status() === 503);
    release();
    await (await failed).finished();
    await expect(page.locator('[data-status]')).toContainText('503');
    expect(filesystem.files.has('Dreamhack/local-a/index.md')).toBe(true);
    expect(filesystem.directories.has('Dreamhack/local-a')).toBe(true);
    expect(filesystem.removed).not.toContain('Dreamhack/local-a');
    await expect(page).toHaveURL(/\/post\/Dreamhack\/local-a\/index.md\/$/);
    await page.reload();
    await expect(page.locator('[data-title]')).toHaveValue('Local B');
    await expect(page.locator('.cm-content')).toContainText('Latest while rename is failing.');
  } finally {
    release();
  }
});

test('ảnh local cũ cùng tên ảnh remote không bị upload đè khi chỉ sửa text', async ({ page }) => {
  const post = { path: 'Dreamhack/first/index.md', sha: 'first', source: source('First', '## Solution\n\n![image](./image.png)') };
  const imagePath = 'Dreamhack/first/image.png';
  const writes = await mockRepository(page, [post], true, [{ path: imagePath, sha: 'new-remote-image' }]);
  await mockFilesystem(page, { [post.path]: Buffer.from(post.source), [imagePath]: Buffer.from('stale local image') });
  await page.route('https://raw.githubusercontent.com/**/image.png', (route) => route.fulfill({ body: png, contentType: 'image/png' }));
  await openPost(page, post.path);
  await expect(page.locator('[data-preview] img')).toHaveAttribute('src', /^https:\/\/raw\.githubusercontent\.com\//);
  await expect(page.locator('[data-preview] img')).toHaveJSProperty('naturalWidth', 1);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\nText-only edit.');
  await page.locator('[data-publish]').click();
  await expect.poll(() => writes.tree.find((entry) => entry.path === postsRoot + post.path)?.content).toContain('Text-only edit.');
  expect(writes.blobs).toEqual([]);
  expect(writes.tree.some((entry) => entry.path === postsRoot + imagePath)).toBe(false);
});

test('sửa bài dạng file md không publish đè bài md bên cạnh như tệp đính kèm', async ({ page }) => {
  const first = { path: 'Dreamhack/first.md', sha: 'first', source: source('First') };
  const second = { path: 'Dreamhack/second.md', sha: 'second', source: source('Second') };
  const writes = await mockRepository(page, [first, second], true);
  const sibling = Buffer.from(source('Second', 'Unpublished edits in sibling write-up.'));
  const filesystem = await mockFilesystem(page, { [first.path]: Buffer.from(first.source), [second.path]: sibling });
  await openPost(page, first.path);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\nEdit first write-up only.');
  await page.locator('[data-publish]').click();
  await expect.poll(() => writes.tree.find((entry) => entry.path === postsRoot + first.path)?.content).toContain('Edit first write-up only.');
  expect(writes.blobs).toEqual([]);
  expect(writes.tree.map((entry) => entry.path)).toEqual([postsRoot + first.path]);
  expect(filesystem.files.get(second.path)).toEqual(sibling);
});

test('Hiện đọc source thật dù trạng thái ẩn của flow YAML chưa tải xong', async ({ page }) => {
  const post = { path: 'Dreamhack/first/index.md', sha: 'first', source: '---\n{ title: First, date: 2026-11-03, ctf: Dreamhack, category: web, draft: true }\n---\n\nKeep `DH{testflag}`.\n' };
  const writes = await mockRepository(page, [post]);
  let reads = 0;
  let release = () => {};
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  page.once('close', release);
  await page.route('**/git/blobs/first', async (route) => {
    if (++reads === 1) await waiting;
    await route.fallback();
  });
  try {
    await page.goto('/admin/studio/');
    await expect.poll(() => reads).toBe(1);
    await page.locator(`.tree-file[title="${post.path}"] .selection-checkbox`).click();
    await page.locator('[data-visibility="show"]').click();
    await expect(page.locator('[data-pending-bar]')).toBeVisible();
    expect(reads).toBeGreaterThan(1);
    expect(writes.blobs).toHaveLength(1);
    expect(writes.blobs[0].encoding).toBe('utf-8');
    const shown = readDocument(writes.blobs[0].content);
    expect(shown.fields).toMatchObject({ title: 'First', ctf: 'Dreamhack', category: 'web' });
    expect(shown.fields).not.toHaveProperty('draft');
    expect(shown.body).toBe(readDocument(post.source).body);
  } finally {
    release();
  }
});
