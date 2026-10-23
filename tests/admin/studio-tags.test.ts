import { describe, expect, it } from 'vitest';
import { buildVocabulary, canonicalTag, suggestTags } from '../../src/lib/studio-tags';

const vocabulary = buildVocabulary([
  { name: 'Web', count: 13 }, { name: 'Path Traversal', count: 5 }, { name: 'XSS', count: 4 },
  { name: 'CSRF', count: 1 }, { name: 'csrf', count: 1 }, { name: 'Cookie', count: 1 }, { name: 'cookie', count: 1 },
  { name: '.htaccess', count: 1 }, { name: 'htaccess', count: 1 }, { name: 'Handlebars', count: 1 },
  { name: 'shell=True', count: 1 }, { name: 'Prototype Pollution', count: 2 },
]);

describe('buildVocabulary', () => {
  it('merges spellings that share a slug and keeps the most used one', () => {
    expect(canonicalTag('csrf', vocabulary)).toBe('CSRF');
    expect(canonicalTag('HTACCESS', vocabulary)).toBe('.htaccess');
    expect(canonicalTag('path-traversal', vocabulary)).toBe('Path Traversal');
    expect(canonicalTag('Brand New', vocabulary)).toBe('Brand New');
  });
});

describe('suggestTags', () => {
  it('does not match tags inside unrelated words', () => {
    const { added } = suggestTags({ title: 'Source review', body: 'Traversal of the source code, force the resource.', current: [] }, vocabulary);
    expect(added).not.toContain('RCE');
    expect(added).not.toContain('RSA');
  });

  it('detects techniques from payloads and uses the blog spelling', () => {
    const body = '## Solution\n\nTa gửi `../../../../etc/passwd` rồi đọc file `.HTACCESS`.\n\n```js\nObject.__proto__.isAdmin = true\n```';
    const { tags } = suggestTags({ title: 'Lost files', body, category: 'web', current: ['xss'] }, vocabulary);
    expect(tags[0]).toBe('Web');
    expect(tags).toContain('XSS');
    expect(tags).not.toContain('xss');
    expect(tags).toEqual(expect.arrayContaining(['Path Traversal', '.htaccess', 'Prototype Pollution']));
  });

  it('needs stronger evidence for plain and generic words', () => {
    expect(suggestTags({ title: 'X', body: 'Template dùng handlebars.', current: [] }, vocabulary).added).not.toContain('Handlebars');
    expect(suggestTags({ title: 'Handlebars RCE', body: 'Template dùng handlebars.', current: [] }, vocabulary).added).toContain('Handlebars');
    expect(suggestTags({ title: 'X', body: 'cookie, cookie và cookie.', current: [] }, vocabulary).added).not.toContain('Cookie');
    expect(suggestTags({ title: 'X', body: '## Sửa cookie\n\ncookie, cookie, cookie.', current: [] }, vocabulary).added).toContain('Cookie');
  });

  it('ignores URLs and the CTF name', () => {
    const body = 'Xem [bài này](https://portswigger.net/web-security/cross-site-scripting) về CSS CTF.';
    const { added } = suggestTags({ title: 'Hello', body, ctf: 'CSS CTF', current: [] }, buildVocabulary(vocabulary.values(), [{ name: 'CSS', count: 1 }]));
    expect(added).not.toContain('XSS');
    expect(added).not.toContain('CSS');
  });

  it('reports renamed tags and adds CVE ids', () => {
    const result = suggestTags({ title: 'phpBB CVE-2026-48611', body: 'Khai thác CVE-2026-48611.', current: ['csrf'] }, vocabulary);
    expect(result.renamed).toEqual([['csrf', 'CSRF']]);
    expect(result.added).toEqual(expect.arrayContaining(['CVE', 'CVE-2026-48611']));
  });
});
