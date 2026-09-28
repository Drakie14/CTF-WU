import { describe, expect, it } from 'vitest';
import { splitFrontmatter } from '../../src/lib/content/frontmatter';
import { assignSlugs, buildPostFile, ctfFolderName, promoteHeadings, slugFromRepoPath, splitCtfMarkdown } from '../../src/lib/content/split-ctf';

const SAMPLE = `---
title: NNS CTF
date: 2026-09-20
tags: [ctf, 2026]
---

# WEB
## NNS Travel
#### Đề bài
Find the tickets.

\`\`\`Bash!
# không phải category
## cũng không phải bài
\`\`\`

#### Solution
flag{a}

## File monster (misc)
##### Đề bài
text

# Reversing
Ghi chú chung cho rev.
## Crackme
#### Solution
xor

# Web 
## 
`;

describe('splitCtfMarkdown', () => {
  const doc = splitCtfMarkdown(SAMPLE, { fallbackCtf: 'file-name' });

  it('reads CTF metadata from the source frontmatter', () => {
    expect(doc.ctf).toBe('NNS CTF');
    expect(doc.date).toBe('2026-09-20');
    expect(doc.tags).toEqual(['ctf', '2026']);
  });

  it('splits on ## and maps # to categories, ignoring headings inside code fences', () => {
    expect(doc.posts.map((p) => [p.title, p.category])).toEqual([
      ['NNS Travel', 'web'],
      ['File monster', 'misc'],
      ['Crackme', 'rev'],
    ]);
    expect(doc.posts[0]?.body).toContain('# không phải category');
    expect(doc.posts[0]?.body).toContain('flag{a}');
  });

  it('promotes headings so the shallowest becomes ## (code untouched)', () => {
    expect(doc.posts[0]?.body).toMatch(/^## Đề bài/);
    expect(doc.posts[0]?.body).toContain('\n## Solution');
    expect(doc.posts[0]?.body).toContain('\n## cũng không phải bài');
    expect(doc.posts[1]?.body).toMatch(/^## Đề bài/);
  });

  it('prepends group intro text to the first post of the group', () => {
    expect(doc.posts[2]?.body).toMatch(/^Ghi chú chung cho rev\.\n\n## Solution/);
  });

  it('turns an H1 group without ## into a single post, category "" when unknown', () => {
    const d = splitCtfMarkdown('# Introduction\nhello\n# Labs\n## Lab 1\nx', { fallbackCtf: 'XSS' });
    expect(d.ctf).toBe('XSS');
    expect(d.posts.map((p) => [p.title, p.category, p.section])).toEqual([
      ['Introduction', '', 'Introduction'],
      ['Lab 1', '', 'Labs'],
    ]);
  });

  it('handles Windows files (CRLF + BOM) the same as LF', () => {
    expect(splitCtfMarkdown('\uFEFF' + SAMPLE.replace(/\n/g, '\r\n'), { fallbackCtf: 'file-name' })).toEqual(doc);
  });

  it('keeps headings as-is when promoteHeadings is false', () => {
    const d = splitCtfMarkdown('# Pwn\n## a\n#### x', { promoteHeadings: false });
    expect(d.posts[0]?.body).toBe('#### x');
  });
});

describe('promoteHeadings', () => {
  it('does nothing when the shallowest heading is already ## or higher', () => {
    expect(promoteHeadings('## a\n### b')).toBe('## a\n### b');
    expect(promoteHeadings('text only')).toBe('text only');
  });
  it('handles ~~~ fences', () => {
    expect(promoteHeadings('~~~\n#### in\n~~~\n#### out')).toBe('~~~\n#### in\n~~~\n## out');
  });
});

describe('slugs and output files', () => {
  it('derives slugs from repo paths like the loader', () => {
    expect(slugFromRepoPath('src/content/posts/CTF/NNS CTF.md')).toBe('nns-ctf');
    expect(slugFromRepoPath('src/content/posts/NNS CTF/Baby Pwn/index.md')).toBe('baby-pwn');
    expect(slugFromRepoPath('src/content/posts/a/img.png')).toBeUndefined();
  });

  it('avoids collisions with existing slugs and within the batch', () => {
    expect(assignSlugs(['Baby', 'Baby', 'Baby', 'Other'], 'NNS CTF', ['baby'])).toEqual(['nns-ctf-baby', 'nns-ctf-baby-2', 'nns-ctf-baby-3', 'other']);
  });

  it('makes a safe CTF folder name', () => {
    expect(ctfFolderName("CSAW' 26 QUALS")).toBe("CSAW' 26 QUALS");
    expect(ctfFolderName('a/b: c?')).toBe('a b c');
    expect(ctfFolderName('...')).toMatch(/^ctf-/);
  });

  it('builds index.md whose frontmatter round-trips', () => {
    const f = buildPostFile({ title: '12345678', slug: 'x', category: 'web', body: 'hi', ctf: 'NNS CTF', date: '2026-09-20', tags: ['a'] });
    expect(f.path).toBe('src/content/posts/NNS CTF/x/index.md');
    const parsed = splitFrontmatter(f.content);
    expect(parsed.data).toEqual({ title: '12345678', date: '2026-09-20', ctf: 'NNS CTF', category: 'web', tags: ['a'] });
    expect(parsed.body.trim()).toBe('hi');
  });
});

