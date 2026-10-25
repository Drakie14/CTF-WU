// Kiểm tra CSP của /admin trong public/_headers.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

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

  it('public CSP vẫn chặt, không bị nới cho admin', () => {
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
    expect(p).toMatch(/frame-ancestors 'none'/);
    expect(p).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|script-src[^;]*unpkg/);
    expect(p).not.toMatch(/jsdelivr/);
    expect(admin).toContain('X-Robots-Tag: noindex, nofollow');
  });

  it('/admin/studio cho phép WebAssembly của Shiki mà không nới CSP admin chung', () => {
    const studio = blocks.get('/admin/studio/*')!;
    expect(studio).toContain('! Content-Security-Policy');
    const p = csp('/admin/studio/*');
    expect(p).toMatch(/script-src 'self' 'wasm-unsafe-eval';/);
    expect(p).not.toMatch(/jsdelivr/);
    expect(p).toMatch(/connect-src [^;]*https:\/\/api\.github\.com/);
    expect(p).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(p).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp('/admin/*')).toMatch(/script-src 'self';/);
  });

  it('chỉ Studio được gọi Gemini API (Gợi ý tags bằng AI)', () => {
    expect(csp('/admin/studio/*')).toMatch(/connect-src [^;]*https:\/\/generativelanguage\.googleapis\.com/);
    expect(csp('/admin/*')).not.toMatch(/googleapis|anthropic/);
    expect(csp('/*')).not.toMatch(/googleapis|anthropic/);
  });
});
