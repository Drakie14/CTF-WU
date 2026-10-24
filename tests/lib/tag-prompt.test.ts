import { describe, expect, it } from 'vitest';
import { compactBody, parseTagReply, parseTagSummary, tagPromptData } from '../../src/lib/tag-prompt';

describe('parseTagReply', () => {
  it('reads JSON, fenced JSON and JSON mixed with chat text', () => {
    expect(parseTagReply('{"tags": ["SSTI", "Jinja2"]}')).toEqual(['SSTI', 'Jinja2']);
    expect(parseTagReply('```json\n{"tags": ["XSS"]}\n```')).toEqual(['XSS']);
    expect(parseTagReply('Here you go:\n{"tags": ["JWT", "alg none"]}\nHope it helps!')).toEqual(['JWT', 'alg none']);
    expect(parseTagReply('["CSRF", "SameSite"]')).toEqual(['CSRF', 'SameSite']);
  });

  it('falls back to comma or bullet lists', () => {
    expect(parseTagReply('SSTI, Jinja2, #Flask')).toEqual(['SSTI', 'Jinja2', 'Flask']);
    expect(parseTagReply('- Prototype Pollution\n2. "Handlebars"\n')).toEqual(['Prototype Pollution', 'Handlebars']);
    expect(parseTagReply('   ')).toEqual([]);
  });
});

describe('compactBody / tagPromptData', () => {
  it('drops images and shortens long code blocks', () => {
    const code = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const out = compactBody(`Ta thấy:\n![image](https://i.imgur.com/a.png)\n\n\n\n\`\`\`python!\n${code}\n\`\`\`\n-> Flag`);
    expect(out).not.toContain('imgur');
    expect(out).toContain('line 11');
    expect(out).not.toContain('line 12');
    expect(out).toContain('… (18 more lines)');
    expect(out).toContain('-> Flag');
    expect(out).not.toMatch(/\n{3}/);
  });

  it('includes the blog vocabulary, typed tags and an escaped title', () => {
    const prompt = tagPromptData({ title: 'A "quoted" title', body: 'Body', vocabulary: ['XSS', 'CSRF'], current: ['dset'] });
    expect(prompt).toContain('XSS, CSRF');
    expect(prompt).toContain("title=\"A 'quoted' title\"");
    expect(prompt).toContain('dset');
  });

  it('sorts vocabulary by usage and adds tagged examples except the post itself', () => {
    const prompt = tagPromptData({
      title: 'CSRF-2',
      body: 'Body',
      vocabulary: [{ name: 'Cookie', count: 1 }, { name: 'XSS', count: 9 }],
      current: [],
      examples: [{ title: 'CSRF-2', tags: ['csrf'] }, { title: 'XSS-1', category: 'web', tags: ['XSS', 'innerHTML'] }],
    });
    expect(prompt).toContain('XSS (9), Cookie (1)');
    expect(prompt).toContain('- XSS-1 [web]: XSS, innerHTML');
    expect(prompt).not.toContain('- CSRF-2');
  });

  it('keeps both the start and the end of very long write-ups', () => {
    const out = compactBody(`## Đề bài\n${'a'.repeat(20_000)}\n-> Flag: DH{x}`);
    expect(out.startsWith('## Đề bài')).toBe(true);
    expect(out).toContain('… (middle truncated)');
    expect(out.endsWith('-> Flag: DH{x}')).toBe(true);
  });
});

describe('parseTagSummary', () => {
  it('reads the summary field and ignores replies without one', () => {
    expect(parseTagSummary('{"summary": " SSTI in Jinja2 ", "tags": ["SSTI"]}')).toBe('SSTI in Jinja2');
    expect(parseTagSummary('{"tags": ["SSTI"]}')).toBe('');
    expect(parseTagSummary('SSTI, Jinja2')).toBe('');
  });
});
