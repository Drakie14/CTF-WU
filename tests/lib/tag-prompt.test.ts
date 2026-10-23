import { describe, expect, it } from 'vitest';
import { chatTagPrompt, compactBody, parseTagReply } from '../../src/lib/tag-prompt';

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

describe('compactBody / chatTagPrompt', () => {
  it('drops images and shortens long code blocks', () => {
    const code = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const out = compactBody(`Ta thấy:\n![image](https://i.imgur.com/a.png)\n\n\n\n\`\`\`python!\n${code}\n\`\`\`\n-> Flag`);
    expect(out).not.toContain('imgur');
    expect(out).toContain('line 19');
    expect(out).not.toContain('line 20');
    expect(out).toContain('… (10 more lines)');
    expect(out).toContain('-> Flag');
    expect(out).not.toMatch(/\n{3}/);
  });

  it('asks for JSON only and includes the blog vocabulary', () => {
    const prompt = chatTagPrompt({ title: 'A "quoted" title', body: 'Body', vocabulary: ['XSS', 'CSRF'], current: ['dset'] });
    expect(prompt).toContain('XSS, CSRF');
    expect(prompt).toContain("title=\"A 'quoted' title\"");
    expect(prompt).toContain('dset');
    expect(prompt.trim().endsWith('{"tags": ["Tag 1", "Tag 2"]}')).toBe(true);
  });
});
