import { describe, expect, it } from 'vitest';
import { normalizeFrontmatter, splitFrontmatter, type NormalizeContext } from '../../src/lib/content/frontmatter';
import { getPathInfo } from '../../src/lib/content/paths';

const ctx = (over: Partial<NormalizeContext> = {}): NormalizeContext => ({
  file: 'src/content/posts/demo.md',
  baseName: 'demo',
  folderCtf: '',
  fallbackDate: new Date('2026-01-02T03:04:05Z'),
  fallbackDateSource: 'mtime',
  ...over,
});

const run = (md: string, over: Partial<NormalizeContext> = {}) => {
  const split = splitFrontmatter(md);
  return { split, ...normalizeFrontmatter(split.data, ctx(over)) };
};

describe('splitFrontmatter', () => {
  it('works without frontmatter (1)', () => {
    const { split, data, warnings } = run('# DOM XSS\n\nHello');
    expect(split.hasFrontmatter).toBe(false);
    expect(split.body).toBe('# DOM XSS\n\nHello');
    expect(data.title).toBe('demo');
    expect(data.titleInferred).toBe(true);
    expect(data.date.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(warnings.some((w) => w.field === 'title')).toBe(true);
  });

  it('handles CRLF line endings and BOM', () => {
    const { split, data } = run('﻿---\r\ntitle: Win\r\n---\r\nbody\r\n');
    expect(data.title).toBe('Win');
    expect(split.body).toBe('body\r\n');
  });

  it('does not fail on malformed YAML', () => {
    const { split, data } = run('---\ntitle: [unclosed\nfoo: : bar\n---\nbody');
    expect(split.error).toMatch(/invalid YAML/);
    expect(split.body).toBe('body');
    expect(data.titleInferred).toBe(true);
  });

  it('handles empty frontmatter', () => {
    expect(run('---\n---\nbody').split.body).toBe('body');
  });

  it('treats non-object YAML as no data', () => {
    expect(run('---\n- a\n- b\n---\nbody').split.error).toBeDefined();
  });
});

describe('normalizeFrontmatter', () => {
  it('missing title uses file/folder name (2)', () => {
    const { data } = run('---\nctf: X\n---\n# Heading Title\n', { baseName: 'dom-xss' });
    expect(data.title).toBe('dom-xss');
    expect(data.titleInferred).toBe(true);
  });

  it('never takes the # heading as title (5)', () => {
    const { data } = run('# DOM XSS\n\ntext', { baseName: 'another-writeup' });
    expect(data.title).toBe('another-writeup');
  });

  it('missing ctf → empty, or inferred from folder (3, 8)', () => {
    expect(run('---\ntitle: a\n---\n').data.ctf).toBe('');
    const inferred = run('---\ntitle: a\n---\n', { folderCtf: 'CSAW Quals 2026' }).data;
    expect(inferred.ctf).toBe('CSAW Quals 2026');
    expect(inferred.ctfInferred).toBe(true);
    const explicit = run('---\nctf: Other\n---\n', { folderCtf: 'CSAW' }).data;
    expect(explicit.ctf).toBe('Other');
    expect(explicit.ctfInferred).toBe(false);
  });

  it('missing category → empty (4)', () => {
    expect(run('---\ntitle: a\n---\n').data.category).toBe('');
  });

  it('category/difficulty are case-insensitive', () => {
    const { data } = run('---\ncategory: WEB\ndifficulty: Hard\n---\n');
    expect(data.category).toBe('web');
    expect(data.difficulty).toBe('hard');
  });

  it('tags as string (9) and array (10)', () => {
    expect(run('---\ntags: "sqli, jwt"\n---\n').data.tags).toEqual(['sqli', 'jwt']);
    expect(run('---\ntags: [sqli, jwt]\n---\n').data.tags).toEqual(['sqli', 'jwt']);
    expect(run('---\ntags:\n  - a\n  - b\n---\n').data.tags).toEqual(['a', 'b']);
    expect(run('---\ntitle: x\n---\n').data.tags).toEqual([]);
  });

  it('accepts brand-new tags without declaration (11)', () => {
    expect(run('---\ntags: [test-new-tag, never-seen-before]\n---\n').data.tags).toEqual([
      'test-new-tag',
      'never-seen-before',
    ]);
  });

  it('invalid fields → warning + default, never throws (12)', () => {
    const { data, warnings } = run(
      '---\ntitle: 42\ndate: not-a-date\ncategory: hacking\ndifficulty: impossible\npoints: abc\ntags: {a: 1}\nsummary: [x]\ncover: 5\n---\n',
    );
    expect(data.title).toBe('42');
    expect(data.dateSource).toBe('mtime');
    expect(data.category).toBe('');
    expect(data.difficulty).toBe('');
    expect(data.points).toBeNull();
    expect(data.tags).toEqual([]);
    expect(data.summary).toBe('');
    expect(data.cover).toBe('');
    const fields = warnings.map((w) => w.field);
    for (const f of ['date', 'category', 'difficulty', 'points', 'tags', 'summary', 'cover']) {
      expect(fields).toContain(f);
    }
    const dateWarning = warnings.find((w) => w.field === 'date')!;
    expect(dateWarning.value).toBe('not-a-date');
    expect(dateWarning.fallback).toBeDefined();
  });

  it('unknown keys → warning only (13)', () => {
    const { data, warnings } = run('---\ntitle: a\nfoo: bar\nlang: vi\n---\n');
    expect(data.title).toBe('a');
    expect(warnings.map((w) => w.field)).toEqual(['foo']);
  });

  it('points accepts numeric strings', () => {
    expect(run('---\npoints: "500"\n---\n').data.points).toBe(500);
    expect(run('---\npoints: 12.5\n---\n').data.points).toBeNull();
  });

  it('description is accepted as summary', () => {
    expect(run('---\ndescription: hello\n---\n').data.summary).toBe('hello');
    expect(run('---\nsummary: a\ndescription: b\n---\n').data.summary).toBe('a');
  });
});

describe('getPathInfo', () => {
  const root = '/repo/src/content/posts';
  it('derives slug and CTF from path (8)', () => {
    expect(getPathInfo(root, `${root}/csaw/dino2auth/index.md`)).toMatchObject({ slug: 'dino2auth', folderCtf: 'csaw', baseName: 'dino2auth' });
    expect(getPathInfo(root, `${root}/dom-xss/index.md`)).toMatchObject({ slug: 'dom-xss', folderCtf: '' });
    expect(getPathInfo(root, `${root}/another-writeup.md`)).toMatchObject({ slug: 'another-writeup', folderCtf: '' });
    expect(getPathInfo(root, `${root}/csaw/foo.md`)).toMatchObject({ slug: 'foo', folderCtf: 'csaw' });
    expect(getPathInfo(root, `${root}/CSAW Quals 2026/Bài Viết Đầu/index.md`)).toMatchObject({
      slug: 'bai-viet-dau',
      folderCtf: 'CSAW Quals 2026',
      baseName: 'Bài Viết Đầu',
    });
  });
});
