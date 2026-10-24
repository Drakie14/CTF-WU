import { describe, expect, it } from 'vitest';
import { buildVocabulary, canonicalTag, extractConcepts, isCategoryTag, mergeAiTags, suggestTags } from '../../src/lib/studio-tags';

const vocabulary = buildVocabulary([
  { name: 'Web', count: 13 }, { name: 'Misc', count: 3 }, { name: 'Path Traversal', count: 5 }, { name: 'XSS', count: 4 },
  { name: 'CSRF', count: 1 }, { name: 'csrf', count: 1 }, { name: 'Cookie', count: 1 }, { name: 'cookie', count: 1 },
  { name: '.htaccess', count: 1 }, { name: 'htaccess', count: 1 }, { name: 'Handlebars', count: 1 },
  { name: 'shell=True', count: 1 }, { name: 'Prototype Pollution', count: 2 }, { name: 'dset', count: 1 },
]);

describe('buildVocabulary', () => {
  it('merges spellings that share a slug and keeps the most used one', () => {
    expect(canonicalTag('csrf', vocabulary)).toBe('CSRF');
    expect(canonicalTag('HTACCESS', vocabulary)).toBe('.htaccess');
    expect(canonicalTag('path-traversal', vocabulary)).toBe('Path Traversal');
    expect(canonicalTag('Brand New', vocabulary)).toBe('Brand New');
  });

  it('leaves category names out of the vocabulary', () => {
    expect(isCategoryTag('Web')).toBe(true);
    expect(isCategoryTag('Reverse Engineering')).toBe(true);
    expect(isCategoryTag('Web Cache')).toBe(false);
    expect([...vocabulary.values()].map((term) => term.name)).not.toEqual(expect.arrayContaining(['Web']));
  });
});

describe('suggestTags', () => {
  it('never adds category tags and removes the ones already typed', () => {
    const result = suggestTags({ title: 'Lost files', body: 'Gửi `../../../../etc/passwd`.', category: 'web', current: ['Web', 'misc', 'XSS'] }, vocabulary);
    expect(result.tags).toEqual(['XSS', 'Path Traversal']);
    expect(result.removed).toEqual(['Web', 'misc']);
  });

  it('puts vulnerabilities before keywords', () => {
    const body = '## Handlebars\n\nTa dùng `__proto__` để ghi đè, rồi đọc `.htaccess` và `.htaccess`.';
    const { tags } = suggestTags({ title: 'Lika', body, current: ['dset'] }, vocabulary);
    expect(tags).toEqual(['Prototype Pollution', 'dset', 'Handlebars', '.htaccess']);
  });

  it('does not match tags inside unrelated words', () => {
    const { added } = suggestTags({ title: 'Source review', body: 'Traversal of the source code, force the resource.', current: [] }, vocabulary);
    expect(added).not.toContain('RCE');
    expect(added).not.toContain('RSA');
  });

  it('trusts headings and sentences that name the bug, ignores negated ones', () => {
    expect(suggestTags({ title: 'X', body: 'Đây chính là lỗ hổng `Broken Access Control` kinh điển.', current: [] }, vocabulary).added).toContain('Broken Access Control');
    expect(suggestTags({ title: 'X', body: '## SSTI?\n\nTa nhập `{{7*7}}`.', current: [] }, vocabulary).added).toContain('SSTI');
    expect(suggestTags({ title: 'X', body: 'Vậy đây không phải SSTI. Cũng không phải SSTI nốt.', current: [] }, vocabulary).added).not.toContain('SSTI');
    expect(suggestTags({ title: 'X', body: 'Nhắc qua XSS một lần.', current: [] }, vocabulary).added).not.toContain('XSS');
  });

  it('does not auto-add generic words, but keeps them when typed', () => {
    const body = '## Sửa cookie\n\ncookie, cookie, cookie, cookie, cookie, cookie.';
    expect(suggestTags({ title: 'X', body, current: [] }, vocabulary).added).not.toContain('Cookie');
    expect(suggestTags({ title: 'X', body, current: ['cookie'] }, vocabulary).tags).toEqual(['Cookie']);
  });

  it('picks up sinks the write-up explains in inline code', () => {
    const body = '### os.path.join()\n\nHàm `os.path.join` bỏ phần trước nếu `filename` là đường dẫn tuyệt đối.\n\n```py\nos.path.join(a, b)\nsubprocess.run(x)\n```';
    const { added } = suggestTags({ title: 'X', body, current: [] }, vocabulary);
    expect(added).toContain('os.path.join');
    expect(added).not.toContain('subprocess');
  });

  it('ignores URLs, the CTF name and flag prefixes', () => {
    const body = 'Xem [bài này](https://portswigger.net/web-security/cross-site-scripting) về CSS CTF. Flag: `CSS{css_is_fun}` và CSS{again_css}.';
    const { added } = suggestTags({ title: 'Hello', body, ctf: 'CSS CTF', current: [] }, buildVocabulary(vocabulary.values(), [{ name: 'CSS', count: 1 }]));
    expect(added).toEqual([]);
  });

  it('reports renamed tags and adds CVE ids', () => {
    const result = suggestTags({ title: 'phpBB CVE-2026-48611', body: 'Khai thác CVE-2026-48611.', current: ['csrf'] }, vocabulary);
    expect(result.renamed).toEqual([['csrf', 'CSRF']]);
    expect(result.tags).toEqual(['CSRF', 'CVE-2026-48611', 'CVE']);
  });
});

describe('extractConcepts / tag mới', () => {
  const names = (title: string, body: string) => [...extractConcepts(title, body).values()].map((entry) => entry.name);

  it('takes the concept the author introduces with a rhetorical question or "lỗ hổng `X`"', () => {
    expect(names('X', 'Vậy `template string` là gì?\n\nTa dùng `template string` để gọi hàm.')).toContain('template string');
    expect(names('X', '## Vậy DAV là gì?')).toContain('DAV');
    expect(names('X', 'Đây là kỹ thuật `Dangling Markup` kinh điển.')).toContain('Dangling Markup');
  });

  it('skips question lists, Vietnamese phrases, files and site names', () => {
    expect(names('X', '1. `object`, `property`, `value`, `keypath` là gì?')).toEqual([]);
    expect(names('X', 'Vậy `security phía client` là gì?')).toEqual([]);
    expect(names('X', 'Tải [web_ass.tar.gz](https://github.com/swisskyrepo/x.tar.gz), đọc [PortSwigger](https://portswigger.net/web-security) và [List of file signatures](https://en.wikipedia.org/wiki/List_of_file_signatures).')).toEqual([]);
  });

  it('takes reference links only from docs/knowledge sites', () => {
    expect(names('X', 'Dùng thuật toán [`Dijkstra`](https://en.wikipedia.org/wiki/Dijkstra%27s_algorithm).')).toContain('Dijkstra');
    expect(names('X', 'Gửi tới [webhook](https://webhook.site/abc).')).toEqual([]);
  });

  it('adds at most two brand-new tags, after known ones, and reports them as novel', () => {
    const body = 'Vậy `Alpha Trick` là gì?\n\nVậy `Beta Trick` là gì?\n\nVậy `Gamma Trick` là gì?\n\nGửi `../../../../etc/passwd`.';
    const result = suggestTags({ title: 'X', body, current: [] }, vocabulary);
    expect(result.novel).toHaveLength(2);
    expect(result.added[0]).toBe('Path Traversal');
    expect(result.added.slice(1)).toEqual(result.novel);
  });

  it('snaps a concept to the blog spelling instead of creating a new tag', () => {
    const result = suggestTags({ title: 'X', body: '## 2. prototype pollution là gì?', current: [] }, vocabulary);
    expect(result.added).toContain('Prototype Pollution');
    expect(result.novel).toEqual([]);
  });
});

describe('mergeAiTags', () => {
  it('keeps typed tags, puts AI tags first, snaps spelling and drops categories', () => {
    const base = suggestTags({ title: 'X', body: 'Gửi `../../../../etc/passwd`.', current: ['dset'] }, vocabulary);
    const merged = mergeAiTags(base, ['Web', 'prototype pollution', 'Known-plaintext', 'dset'], vocabulary);
    expect(merged.tags).toEqual(['Prototype Pollution', 'Path Traversal', 'dset', 'Known-plaintext']);
    expect(merged.novel).toEqual(['Known-plaintext']);
  });

  it('drops offline-only novel guesses when AI answered', () => {
    const base = suggestTags({ title: 'X', body: 'Vậy `Alpha Trick` là gì?', current: [] }, vocabulary);
    expect(base.novel).toEqual(['Alpha Trick']);
    expect(mergeAiTags(base, ['XSS'], vocabulary).tags).toEqual(['XSS']);
  });

  it('does not backfill from offline guesses once the user curated the AI list', () => {
    const base = suggestTags({ title: 'X', body: 'Gửi `../../../../etc/passwd`.', current: [] }, vocabulary);
    expect(base.added).toContain('Path Traversal');
    expect(mergeAiTags(base, ['XSS'], vocabulary, 8, false).tags).toEqual(['XSS']);
    expect(mergeAiTags(base, [], vocabulary, 8, false).tags).toEqual([]);
  });
});
