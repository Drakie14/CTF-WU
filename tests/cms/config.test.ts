// Kiểm tra public/admin/config.yml (Sveltia CMS) và CSP của /admin trong public/_headers.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { CATEGORIES, DIFFICULTIES } from '../../src/lib/content/constants';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

interface Field { name: string; widget?: string; required?: boolean; options?: unknown[]; default?: unknown; field?: unknown }
interface Collection {
  name: string; folder: string; path?: string; media_folder?: string; public_folder?: string;
  nested?: unknown; meta?: { path?: { index_file?: string } }; fields: Field[];
  view_filters?: Array<{ field: string; empty?: boolean; eq?: string }>; view_groups?: Array<{ field: string }>;
}
const config = parseYaml(read('public/admin/config.yml')) as {
  backend: Record<string, unknown>; collections: Collection[]; media_folder: string;
};
const posts = config.collections.find((c) => c.name === 'posts')!;
const field = (name: string) => posts.fields.find((f) => f.name === name)!;

describe('Sveltia CMS config.yml', () => {
  it('backend GitHub, chỉ đăng nhập bằng token nhập trên trình duyệt, không có secret', () => {
    expect(config.backend.name).toBe('github');
    expect(config.backend.auth_methods).toEqual(['token']);
    expect(config.backend.base_url).toBeUndefined(); // không OAuth proxy
    const raw = read('public/admin/config.yml');
    expect(raw).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|client_secret|password\s*:/i);
  });

  it('collection posts trỏ đúng thư mục content, hỗ trợ <slug>/index.md và <ctf>/<slug>/index.md', () => {
    expect(posts.folder).toBe('src/content/posts');
    expect(posts.path).toBe('{{slug}}/index');
    expect(posts.nested).toBeTruthy();
    expect(posts.meta?.path?.index_file).toBe('index');
    // Ảnh upload nằm cạnh index.md của bài.
    expect(posts.media_folder).toBe('');
    expect(posts.public_folder).toBe('');
  });

  it('collection posts_single sửa được bài dạng <slug>.md và <ctf>/<slug>.md (không tạo bài mới), cùng bộ field', () => {
    const single = config.collections.find((c) => c.name === 'posts_single') as Collection & { create?: boolean };
    expect(single.folder).toBe('src/content/posts');
    expect(single.path).toBeUndefined();
    // Sveltia khớp tối đa `depth` cấp đường dẫn: 2 → <slug>.md, <ctf>/<slug>.md. Với 3 thì
    // <ctf>/<slug>/index.md (thuộc collection posts) cũng khớp → bài bị liệt kê hai lần.
    expect(single.nested).toEqual({ depth: 2, subfolders: true });
    expect(single.create).toBe(false);
    expect(single.fields).toEqual(posts.fields);
  });

  it('form có đủ field; title chỉ required trên CMS', () => {
    const names = posts.fields.map((f) => f.name);
    expect(names).toEqual(['title', 'date', 'ctf', 'category', 'difficulty', 'points', 'tags', 'summary', 'cover', 'images', 'body']);
    expect(field('title').required).toBe(true);
    for (const f of posts.fields.filter((x) => x.name !== 'title')) expect(f.required, f.name).toBe(false);
  });

  it('thân bài dùng widget văn bản thô (không markdown/richtext editor)', () => {
    expect(field('body').widget).toBe('text');
    expect(posts.fields.some((f) => f.widget === 'markdown' || f.widget === 'richtext')).toBe(false);
  });

  it('category/difficulty là dropdown khớp với pipeline', () => {
    expect(field('category').widget).toBe('select');
    expect(field('category').options).toEqual([...CATEGORIES]);
    expect(field('difficulty').widget).toBe('select');
    expect(field('difficulty').options).toEqual([...DIFFICULTIES]);
  });

  it('tags dynamic: list tự do, không hard-code tag nào', () => {
    const tags = field('tags');
    expect(tags.widget).toBe('list');
    expect(tags.options).toBeUndefined();
    expect(tags.field).toBeUndefined();
    expect(tags.default).toBeUndefined();
    // Chỉ xét dữ liệu cấu hình (đã parse), không xét comment YAML — comment có thể nhắc tên bài như XSS.md.
    expect(JSON.stringify(config)).not.toMatch(/\b(sqli|jwt|xss)\b/i);
  });

  it('CTF nhập tự do (tạo CTF mới); có lọc category, "Chưa phân loại" và nhóm theo CTF', () => {
    expect(field('ctf').widget).toBe('string');
    expect(posts.view_filters).toContainEqual(expect.objectContaining({ field: 'category', empty: true }));
    for (const c of CATEGORIES) expect(posts.view_filters).toContainEqual(expect.objectContaining({ field: 'category', eq: c }));
    expect(posts.view_groups).toContainEqual(expect.objectContaining({ field: 'ctf' }));
  });

  it('admin/index.html self-host Sveltia, có noindex, không tải script từ CDN', () => {
    const html = read('public/admin/index.html');
    expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
    const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    expect(scripts).toEqual(['/admin/sveltia-cms.js']);
    expect(html).not.toMatch(/unpkg|jsdelivr|cdn\./i);
    expect(existsSync(path.join(root, 'node_modules/@sveltia/cms/dist/sveltia-cms.js'))).toBe(true);
  });
});

describe('public/_headers', () => {
  const blocks = new Map<string, string[]>();
  let cur = '';
  for (const line of read('public/_headers').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) blocks.set((cur = line.trim()), []);
    else blocks.get(cur)!.push(line.trim());
  }
  const csp = (block: string) =>
    blocks.get(block)!.find((l) => l.startsWith('Content-Security-Policy:'))!.slice('Content-Security-Policy:'.length).trim();

  it('public CSP vẫn chặt, không bị nới cho CMS', () => {
    const p = csp('/*');
    expect(p).toMatch(/script-src 'self'( 'wasm-unsafe-eval')?;/);
    expect(p).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(p).not.toMatch(/github|unpkg|jsdelivr/);
    expect(p).toMatch(/img-src 'self' data:;/);
    expect(p).toMatch(/frame-src 'none'/);
  });

  it('/admin có CSP riêng (tách khỏi CSP public), cho phép GitHub API, noindex', () => {
    const admin = blocks.get('/admin/*')!;
    expect(admin).toContain('! Content-Security-Policy');
    const p = csp('/admin/*');
    expect(p).toMatch(/script-src 'self';/);
    expect(p).toMatch(/connect-src [^;]*https:\/\/api\.github\.com/);
    // Bản dịch giao diện (locales/vi.json…) tải từ unpkg; thiếu thì CMS treo với trình duyệt tiếng Việt.
    expect(p).toMatch(/connect-src [^;]*https:\/\/unpkg\.com\/@sveltia\/[ ;]/);
    expect(p).toMatch(/frame-ancestors 'none'/);
    expect(p).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|script-src[^;]*unpkg/);
    expect(admin).toContain('X-Robots-Tag: noindex, nofollow');
  });
});
