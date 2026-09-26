import { describe, expect, it } from 'vitest';
import { assertUniqueSlugs, DuplicateSlugError } from '../../src/lib/content/loader';
import { slugify, slugifyOrHash } from '../../src/lib/content/slug';
import { buildTaxonomy, normalizeTagInput } from '../../src/lib/content/tags';

describe('slugify', () => {
  it('lowercases, strips Vietnamese diacritics, spaces → -', () => {
    expect(slugify('Đường Dẫn Tiếng Việt')).toBe('duong-dan-tieng-viet');
    expect(slugify('  Hello   World!! ')).toBe('hello-world');
  });
  it('maps meaningful special characters', () => {
    expect(slugify('C++')).toBe('cpp');
    expect(slugify('c#')).toBe('csharp');
    expect(slugify('dom xss')).toBe('dom-xss');
    expect(slugify('ASP.NET')).toBe('aspdotnet');
    expect(slugify('R&D')).toBe('r-and-d');
  });
  it('always yields a non-empty slug with slugifyOrHash', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugifyOrHash('!!!', 'tag')).toMatch(/^tag-[a-z0-9]+$/);
    expect(slugifyOrHash('日本語', 'tag')).not.toBe(slugifyOrHash('中文', 'tag'));
  });
});

describe('tags normalization (66.5-A)', () => {
  it('trims, dedupes case-insensitively within a post', () => {
    expect(normalizeTagInput(' SQLi , sqli, jwt ,, ').tags).toEqual(['SQLi', 'jwt']);
    expect(normalizeTagInput(['a', 'A', ' b ', 3]).tags).toEqual(['a', 'b', '3']);
  });

  it('splits comma lists inside array items (Sveltia CMS re-save of `tags: "a, b"`)', () => {
    expect(normalizeTagInput(['xss, dom-xss, javascript', 'new-tag', '']).tags).toEqual([
      'xss', 'dom-xss', 'javascript', 'new-tag',
    ]);
  });

  it('merges SQLi and sqli, display = most frequent spelling', () => {
    const tax = buildTaxonomy(['SQLi', 'sqli', 'sqli', 'C++', 'dom xss'], 'tag');
    expect(tax.bySlug.get('sqli')).toMatchObject({ name: 'sqli', count: 3 });
    expect(tax.slugOf('SQLi')).toBe('sqli');
    expect(tax.slugOf('C++')).toBe('cpp');
    expect(tax.slugOf('dom xss')).toBe('dom-xss');
    expect(tax.warnings).toEqual([]);
  });

  it('warns and merges different values with the same slug', () => {
    const tax = buildTaxonomy(['c++', 'cpp'], 'tag');
    expect(tax.terms).toHaveLength(1);
    expect(tax.warnings[0]).toMatch(/share slug "cpp"/);
  });
});

describe('duplicate slug (14)', () => {
  it('throws with both conflicting files', () => {
    expect(() =>
      assertUniqueSlugs([
        { slug: 'a', file: 'posts/a.md' },
        { slug: 'b', file: 'posts/b/index.md' },
        { slug: 'a', file: 'posts/ctf/a/index.md' },
      ]),
    ).toThrow(DuplicateSlugError);
    const dup = () =>
      assertUniqueSlugs([
        { slug: 'x', file: 'one.md' },
        { slug: 'x', file: 'two/index.md' },
      ]);
    expect(dup).toThrow(/"x"[\s\S]*one\.md[\s\S]*two\/index\.md/);
  });
});
