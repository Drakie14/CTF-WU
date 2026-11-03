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
    else if (p === '/git/trees' && request.method() === 'POST') {
      saved = request.postDataJSON().tree[0].content;
      data = { sha: 'tree' };
    } else if (p === '/git/commits' && request.method() === 'POST')
      data = { sha: 'commit', html_url: 'https://example.com/commit' };
    await route.fulfill({ json: data });
  });
  return Object.assign(() => saved, { releaseHidden });
}

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
