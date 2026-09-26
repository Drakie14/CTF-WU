import { describe, expect, it } from 'vitest';
import { renderMd } from './render';

describe('HackMD syntax', () => {
  it('single newline → <br> (remark-breaks)', async () => {
    const { html } = await renderMd('line one\nline two');
    expect(html).toMatch(/line one<br>\s*line two/);
  });

  it.each(['info', 'success', 'warning', 'danger'])(':::%s callout', async (type) => {
    const { html } = await renderMd(`:::${type}\nHello **bold**\n:::`);
    expect(html).toContain(`<div class="callout callout-${type}">`);
    expect(html).toContain('<strong>bold</strong>');
  });

  it('GitHub alerts > [!NOTE] / [!TIP] / [!WARNING]', async () => {
    const { html } = await renderMd('> [!NOTE]\n> note body\n\n> [!TIP]\n> tip\n\n> [!WARNING]\n> careful');
    expect(html).toMatch(/<div class="callout callout-info">\s*<p class="callout-title">Note<\/p>/);
    expect(html).toContain('note body');
    expect(html).toContain('callout-success');
    expect(html).toContain('callout-warning');
    expect(html).not.toContain('[!NOTE]');
    expect(html).not.toContain('<blockquote');
  });

  it.each(['info', 'success', 'warning', 'danger'])(':::%s → callout-%s with Markdown content', async (type) => {
    const { html } = await renderMd(`:::${type}\n**Nội dung** \`code\`\n:::`);
    expect(html).toMatch(new RegExp(`<div class="callout callout-${type}">`));
    expect(html).toContain('<strong>Nội dung</strong>');
    expect(html).not.toContain(`:::${type}`);
  });

  it(':::spoiler → collapsed <details>', async () => {
    const { html } = await renderMd(':::spoiler Flag here\n`flag{x}`\n:::');
    expect(html).toMatch(/<details class="spoiler"[^>]*><summary>Flag here<\/summary>/);
    // Nội dung spoiler (flag) không được đưa vào chỉ mục Pagefind.
    expect(html).toContain('<details class="spoiler" data-pagefind-ignore="all">');
    expect(html).toContain('<code>flag{x}</code>');
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it('spoiler without title gets a default summary', async () => {
    expect((await renderMd(':::spoiler\nx\n:::')).html).toContain('<summary>Spoiler</summary>');
  });

  it('nested spoilers and callouts (same and longer markers)', async () => {
    const same = (await renderMd(':::spoiler Outer\nA\n:::spoiler Inner\nB\n:::\nC\n:::')).html;
    expect(same).toMatch(/<details class="spoiler"[^>]*><summary>Outer<\/summary>[\s\S]*<details class="spoiler"[^>]*><summary>Inner<\/summary>[\s\S]*B[\s\S]*<\/details>[\s\S]*C[\s\S]*<\/details>/);
    const longer = (await renderMd('::::info\nout\n:::spoiler s\nin\n:::\n::::')).html;
    expect(longer).toMatch(/<div class="callout callout-info">[\s\S]*<details class="spoiler"[^>]*>[\s\S]*in[\s\S]*<\/details>[\s\S]*<\/div>/);
  });

  it('spoiler title is escaped', async () => {
    const { html } = await renderMd(':::spoiler <img src=x onerror=alert(1)>\nbody\n:::');
    expect(html).not.toMatch(/<img[^>]*onerror/);
    expect(html).toContain('&#x3C;img');
  });

  it('::: inside code fences is untouched', async () => {
    const { html } = await renderMd('```\n:::info\n:::\n```');
    expect(html).not.toContain('callout');
    expect(html).toContain(':::info');
  });

  it('==highlight== → <mark>', async () => {
    expect((await renderMd('a ==hi there== b')).html).toContain('a <mark>hi there</mark> b');
    expect((await renderMd('==**bold** mark==')).html).toContain('<mark><strong>bold</strong> mark</mark>');
    expect((await renderMd('a === b and x == y')).html).not.toContain('<mark>');
    expect((await renderMd('`==code==`')).html).not.toContain('<mark>');
  });

  it('[TOC] and [toc] are removed', async () => {
    const { html } = await renderMd('[TOC]\n\nText\n\n[toc]\n\n## H');
    expect(html).not.toMatch(/\[toc\]/i);
    expect(html).toContain('Text');
  });

  it('emoji shortcodes', async () => {
    expect((await renderMd('hi :smile: :tada:')).html).toContain('hi 😄 🎉');
  });

  it('image sizing =300x and =300x200', async () => {
    const a = (await renderMd('![a](https://example.com/a.png =300x)')).html;
    expect(a).toMatch(/<img[^>]*width="300"/);
    expect(a).not.toMatch(/height=/);
    expect(a).not.toContain('=300x');
    const b = (await renderMd('![b](https://example.com/b.png =300x200)')).html;
    expect(b).toMatch(/width="300"/);
    expect(b).toMatch(/height="200"/);
    expect((await renderMd('`![c](x.png =300x)`')).html).toContain('=300x');
  });

  it('title-duplicate h1 is hidden, different h1 is kept', async () => {
    expect((await renderMd('# My Title\n\nBody', { title: 'My Title' })).html).not.toContain('<h1');
    expect((await renderMd('# Other\n\nBody', { title: 'My Title' })).html).toContain('<h1');
    expect((await renderMd('# My Title\n\nBody')).html).toContain('<h1');
  });

  it('{%youtube%} → link, {% ... %} ignored, never an iframe, with warnings', async () => {
    const { html, warnings } = await renderMd('{%youtube dQw4w9WgXcQ %}\n\n{%gist user/abc123 %}\n\n{% something weird %}');
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).toContain('href="https://gist.github.com/user/abc123"');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('{%');
    expect(warnings.filter((w) => w.includes('[markdown]'))).toHaveLength(3);
  });

  it('GFM tables are wrapped for horizontal scroll', async () => {
    expect((await renderMd('| a | b |\n|---|---|\n| 1 | 2 |')).html).toMatch(/<div class="table-wrap"><table>/);
  });

  it('footnote anchors match ids after sanitize', async () => {
    const { html } = await renderMd('x[^1]\n\n[^1]: note');
    const href = /href="#([^"]+)"[^>]*data-footnote-ref/.exec(html)?.[1];
    expect(href).toBeDefined();
    expect(html).toContain(`id="${href}"`);
  });

  it('external links get rel="noopener noreferrer"', async () => {
    expect((await renderMd('[x](https://example.com)')).html).toContain('rel="noopener noreferrer"');
    expect((await renderMd('[x](/about)')).html).not.toContain('rel=');
  });
});
