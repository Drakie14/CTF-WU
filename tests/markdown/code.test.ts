import { describe, expect, it } from 'vitest';
import { parseFenceInfo, resolveLanguage } from '../../src/lib/markdown/languages';
import { renderMd } from './render';

describe('code language resolution', () => {
  it.each([
    ['py', 'python', 'PYTHON'],
    ['js', 'javascript', 'JAVASCRIPT'],
    ['ts', 'typescript', 'TYPESCRIPT'],
    ['sh', 'shellscript', 'BASH'],
    ['zsh', 'shellscript', 'BASH'],
    ['console', 'shellscript', 'BASH'],
    ['ps1', 'powershell', 'POWERSHELL'],
    ['pwsh', 'powershell', 'POWERSHELL'],
    ['c++', 'cpp', 'C++'],
    ['CC', 'cpp', 'C++'],
    ['hpp', 'cpp', 'C++'],
    ['h', 'c', 'C'],
    ['yml', 'yaml', 'YAML'],
    ['txt', 'plaintext', 'PLAINTEXT'],
    ['plain', 'plaintext', 'PLAINTEXT'],
    ['cmd', 'bat', 'BATCH FILE'],
    ['x86asm', 'asm', 'ASM'],
    ['nasm', 'asm', 'ASM'],
    ['Python', 'python', 'PYTHON'],
  ])('alias %s → %s', (alias, lang, label) => {
    const r = resolveLanguage(alias);
    expect(r.lang).toBe(lang);
    expect(r.label).toBe(label);
    expect(r.known).toBe(true);
  });

  it('shell aliases with a $ prompt become shellsession', () => {
    expect(resolveLanguage('sh', '$ ls -la\nfile').lang).toBe('shellsession');
    expect(resolveLanguage('bash', '$ ls').lang).toBe('shellscript');
  });

  it('all common CTF languages are known to Shiki', () => {
    const langs = ['python', 'c', 'cpp', 'javascript', 'typescript', 'html', 'css', 'php', 'java', 'go', 'rust', 'ruby', 'perl', 'lua', 'kotlin', 'sql', 'bash', 'shell', 'powershell', 'bat', 'json', 'yaml', 'toml', 'xml', 'markdown', 'dockerfile', 'nginx', 'http', 'diff', 'asm', 'nasm', 'solidity', 'plaintext'];
    for (const l of langs) expect(resolveLanguage(l).known, l).toBe(true);
  });

  it('`!` suffix enables wrap, also with aliases', () => {
    for (const info of ['python!', 'py!', 'c!', 'sh!', 'c++!', 'js!']) {
      expect(resolveLanguage(info).wrap, info).toBe(true);
    }
    expect(resolveLanguage('py!').lang).toBe('python');
    expect(resolveLanguage('python').wrap).toBe(false);
  });

  it('`=` suffix is ignored', () => {
    expect(parseFenceInfo('python=')).toEqual({ name: 'python', wrap: false });
    expect(parseFenceInfo('python=12')).toEqual({ name: 'python', wrap: false });
    expect(parseFenceInfo('python=+')).toEqual({ name: 'python', wrap: false });
    expect(resolveLanguage('=').lang).toBe('plaintext');
    expect(resolveLanguage('').lang).toBe('plaintext');
    expect(resolveLanguage(undefined).lang).toBe('plaintext');
  });

  it('unknown language → plaintext keeping its label', () => {
    expect(resolveLanguage('abcxyz')).toMatchObject({ lang: 'plaintext', label: 'ABCXYZ', known: false });
  });
});

describe('code blocks rendering', () => {
  it('highlights with Shiki, shows label and a Copy button, no line numbers', async () => {
    const { html } = await renderMd('```python\nprint("hi")\n```');
    expect(html).toContain('<figure class="code-block">');
    expect(html).toContain('<span class="code-lang">PYTHON</span>');
    expect(html).toContain('class="copy-btn"');
    expect(html).toMatch(/<pre class="shiki github-dark-default"/);
    expect(html).toMatch(/style="color:#[0-9A-F]{6}"/i);
    expect(html).not.toMatch(/line-number|data-line-number/);
  });

  it.each(['python!', 'py!', 'c!', 'sh!'])('```%s wraps', async (info) => {
    const { html } = await renderMd(`\`\`\`${info}\nx = 1\n\`\`\``);
    expect(html).toContain('<figure class="code-block" data-wrap="true">');
  });

  it('plain ```lang does not wrap', async () => {
    expect((await renderMd('```c\nint x;\n```')).html).not.toContain('data-wrap');
  });

  it.each(['python=', 'python=12', '='])('```%s does not fail', async (info) => {
    const { html } = await renderMd(`\`\`\`${info}\nx = 1\n\`\`\``);
    expect(html).toContain('code-block');
  });

  it('code block without language → plaintext', async () => {
    expect((await renderMd('```\nhello\n```')).html).toContain('<span class="code-lang">PLAINTEXT</span>');
  });

  it('unknown language → plaintext + warning, build continues', async () => {
    const { html, warnings } = await renderMd('```abcxyz\nfoo\n```');
    expect(html).toContain('<span class="code-lang">ABCXYZ</span>');
    expect(html).toContain('data-lang="plaintext"');
    expect(warnings.some((w) => w.includes('unknown code language "abcxyz"'))).toBe(true);
  });

  it('XSS payloads inside code blocks are displayed as text', async () => {
    const { html } = await renderMd('```html\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n```');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<img[^>]*onerror/);
    expect(html).toContain('&#x3C;');
    expect(html.replace(/<[^>]+>/g, '')).toContain('alert(1)');
  });
});
