import { describe, expect, it } from 'vitest';
import { buildVocabulary, canonicalTag, isCategoryTag, suggestTags } from '../../src/lib/studio-tags';

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
