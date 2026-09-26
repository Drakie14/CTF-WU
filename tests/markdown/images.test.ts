import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderMd } from './render';

// PNG 1x1 hợp lệ.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('remote & local images', () => {
  let dir = '';
  let postFile: URL;
  const fetchMock = vi.fn();

  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ctf-img-'));
    mkdirSync(path.join(dir, 'posts', 'demo'), { recursive: true });
    writeFileSync(path.join(dir, 'posts', 'demo', 'local.png'), PNG);
    postFile = pathToFileURL(path.join(dir, 'posts', 'demo', 'index.md'));
    process.env.REMOTE_IMAGE_CACHE_DIR = path.join(dir, 'cache');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    delete process.env.REMOTE_IMAGE_CACHE_DIR;
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => fetchMock.mockReset());

  it('downloads remote images at build time into the cache and rewrites src to a local path', async () => {
    fetchMock.mockResolvedValue(new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    const url = 'https://hackmd.io/_uploads/abc.png';
    const { html } = await renderMd(`![shot](${url} =300x)`, { fileURL: postFile });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(html).not.toContain('hackmd.io');
    // Astro thay <img> bằng placeholder astro:assets cho ảnh local đã tải về.
    expect(html).toMatch(/__ASTRO_IMAGE_="[^"]*cache\/[0-9a-f]{32}\.png/);
    expect(html).toContain('&#x22;width&#x22;:300');
    expect(readdirSync(path.join(dir, 'cache'))).toHaveLength(1);

    // Build sau dùng cache, không tải lại.
    await renderMd(`![shot](${url})`, { fileURL: postFile });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles raw HTML <img> with remote src too', async () => {
    fetchMock.mockResolvedValue(new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    const { html } = await renderMd('<img src="https://i.imgur.com/xyz.png" alt="raw">', { fileURL: postFile });
    expect(html).not.toContain('imgur.com');
    expect(html).toContain('__ASTRO_IMAGE_');
  });

  it('failed download → warning with post + URL, alt text fallback, no throw', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));
    const url = 'https://i.imgur.com/missing.png';
    const { html, warnings } = await renderMd(`![the alt](${url})`, { fileURL: postFile });
    expect(html).toContain('[image: the alt]');
    expect(html).not.toContain('imgur.com');
    expect(warnings.some((w) => w.includes('index.md') && w.includes(url))).toBe(true);
  });

  it('non-image responses are rejected', async () => {
    fetchMock.mockResolvedValue(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }));
    const { html } = await renderMd('![x](https://example.com/page)', { fileURL: postFile });
    expect(html).toContain('[image: x]');
  });

  it('local images: existing kept for astro:assets, missing → fallback + warning', async () => {
    const ok = await renderMd('![l](./local.png)', { fileURL: postFile });
    expect(ok.html).toContain('__ASTRO_IMAGE_');
    const missing = await renderMd('![gone](./gone.png)', { fileURL: postFile });
    expect(missing.html).toContain('[image: gone]');
    expect(missing.warnings.some((w) => w.includes('gone.png'))).toBe(true);
  });

  it('first image near the top is high priority, later ones lazy', async () => {
    const { html } = await renderMd('![a](./local.png)\n\n' + 'para\n\n'.repeat(6) + '![b](./local.png)', { fileURL: postFile });
    const props = [...html.matchAll(/__ASTRO_IMAGE_="([^"]*)"/g)].map((m) => m[1]!.replace(/&#x22;/g, '"'));
    expect(props[0]).toContain('"fetchpriority":"high"');
    expect(props[1]).toContain('"loading":"lazy"');
  });
});
