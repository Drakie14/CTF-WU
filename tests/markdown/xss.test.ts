import { describe, expect, it } from 'vitest';
import { renderMd } from './render';

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<a href="javascript:alert(1)">click</a>',
  '<iframe src="https://evil.example"></iframe>',
  '<span style="background:url(javascript:alert(1))">styled</span>',
  '<a href="JaVaScRiPt:alert(1)">mixed</a>',
  '<a href="data:text/html,<script>alert(1)</script>">data</a>',
  '<details open ontoggle=alert(1)><summary>x</summary>y</details>',
];

/** Bỏ nội dung text của code block/inline code: ở đó payload được phép xuất hiện dưới dạng chữ. */
function withoutCodeText(html: string): string {
  return html.replace(/<code>[\s\S]*?<\/code>/g, '<code></code>');
}

function assertSafe(rawHtml: string) {
  const html = withoutCodeText(rawHtml);
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<iframe/i);
  expect(html).not.toMatch(/<svg/i);
  expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  expect(html).not.toMatch(/javascript:/i);
  expect(html).not.toMatch(/style="[^"]*url\(/i);
  expect(html).not.toMatch(/href="data:/i);
}

describe('XSS sanitization', () => {
  it.each(PAYLOADS)('strips %s at top level', async (p) => {
    assertSafe((await renderMd(`before\n\n${p}\n\nafter`)).html);
  });

  it.each(PAYLOADS)('strips %s inside a spoiler', async (p) => {
    assertSafe((await renderMd(`:::spoiler T\n${p}\n:::`)).html);
  });

  it.each(PAYLOADS)('strips %s inside a callout', async (p) => {
    assertSafe((await renderMd(`:::danger\n${p}\n:::`)).html);
  });

  it('strips payloads nested spoiler-in-callout', async () => {
    assertSafe((await renderMd(`:::info\n:::spoiler s\n${PAYLOADS.join('\n')}\n:::\n:::`)).html);
  });

  it('markdown javascript: links are removed', async () => {
    assertSafe((await renderMd('[x](javascript:alert(1)) ![y](javascript:alert(2))')).html);
  });

  it('keeps payloads in code blocks and inline code as text', async () => {
    const md = PAYLOADS.map((p) => `\`\`\`html\n${p}\n\`\`\``).join('\n\n') + '\n\n`<script>alert(1)</script>`';
    const { html } = await renderMd(md);
    assertSafe(html);
    const text = html.replace(/<[^>]+>/g, '').replace(/&#x3C;/g, '<').replace(/&#x26;/g, '&').replace(/&lt;/g, '<').replace(/&quot;/g, '"');
    for (const p of PAYLOADS) expect(text).toContain(p);
  });

  it('keeps safe HTML: tables, details, mark, images', async () => {
    const { html } = await renderMd('<details><summary>S</summary>\n\nbody\n\n</details>\n\n<mark>m</mark>\n\n| a |\n|---|\n| 1 |\n\n![alt](https://example.com/x.png)');
    expect(html).toContain('<details><summary>S</summary>');
    expect(html).toContain('<mark>m</mark>');
    expect(html).toContain('<table>');
    expect(html).toContain('<img');
  });
});
