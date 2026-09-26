import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderMd } from './render';

describe('auto summary', () => {
  it('uses the first top-level paragraph', async () => {
    expect((await renderMd('# T\n\n![img](https://example.com/a.png)\n\nFirst **real** paragraph.\n\nSecond.')).summary).toBe(
      'First real paragraph.',
    );
  });

  it('never leaks spoiler or callout content (flags!)', async () => {
    const { summary } = await renderMd(':::spoiler Flag\nflag{secret}\n:::\n\n> [!NOTE]\n> note\n\n:::info\ninfo text\n:::\n\nIntro text.');
    expect(summary).toBe('Intro text.');
    expect(summary).not.toContain('flag{');
  });
});

describe('HackMD directives containing URLs', () => {
  it('{%pdf https://... %} becomes a plain link with a warning', async () => {
    const { html, warnings } = await renderMd('{%pdf https://example.com/a.pdf %}');
    expect(html).toContain('<a href="https://example.com/a.pdf"');
    expect(html).not.toContain('{%');
    expect(warnings).toHaveLength(1);
  });

  it('{% embed https://foo %} is dropped with a warning', async () => {
    const { html, warnings } = await renderMd('before {% embed https://foo.example/x %} after');
    expect(html).not.toContain('{%');
    expect(html).not.toContain('%}');
    expect(html).not.toContain('<iframe');
    expect(warnings.some((w) => w.includes('unsupported HackMD directive'))).toBe(true);
  });

  it('directives inside code are left alone', async () => {
    const { html, warnings } = await renderMd('`{%youtube abcdefgh %}`\n\n```\n{% raw %}\n```');
    expect(html).toContain('{%youtube abcdefgh %}');
    expect(html).toContain('{% raw %}');
    expect(warnings).toHaveLength(0);
  });
});

describe('fences, containers and code inside wrappers', () => {
  it('inline ```x``` is not treated as a fence opener', async () => {
    const { html } = await renderMd('Run ```ls``` first\n\n:::info\nstill a callout\n:::');
    expect(html).toContain('callout-info');
  });

  it('```python! inside a spoiler and inside a callout is highlighted and wraps', async () => {
    const { html } = await renderMd(
      ':::spoiler Solve\n```python!\nprint("x" * 500)\n```\n:::\n\n:::info\n```py!\nx = 1\n```\n:::',
    );
    expect(html).toMatch(/<details class="spoiler"[^>]*>[\s\S]*<figure class="code-block" data-wrap="true">[\s\S]*<\/details>/);
    expect(html).toMatch(/<div class="callout callout-info">[\s\S]*<figure class="code-block" data-wrap="true">[\s\S]*PYTHON[\s\S]*<\/div>/);
  });

  it('CRLF files work', async () => {
    const { html } = await renderMd(':::warning\r\nwin\r\n:::\r\n\r\n```py!\r\nx\r\n```\r\n');
    expect(html).toContain('callout-warning');
    expect(html).toContain('data-wrap="true"');
  });

  it('raw <picture>/<source srcset> is removed', async () => {
    const { html } = await renderMd('<picture><source srcset="https://i.imgur.com/a.png"><img src="x.png" alt=""></picture>');
    expect(html).not.toContain('srcset');
    expect(html).not.toContain('imgur');
  });
});

describe('attachments', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ctf-att-'));
    mkdirSync(path.join(dir, 'post'), { recursive: true });
    writeFileSync(path.join(dir, 'post', 'solve.py'), 'print("pwn")\n');
    process.env.ATTACHMENTS_STAGING_DIR = path.join(dir, 'staging');
  });
  afterAll(() => {
    delete process.env.ATTACHMENTS_STAGING_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('copies linked local files and renders an attachment link', async () => {
    const fileURL = pathToFileURL(path.join(dir, 'post', 'index.md'));
    const { html } = await renderMd('[solve.py](./solve.py)', { fileURL });
    const href = /href="(\/attachments\/[0-9a-f]{12}\/solve\.py)"/.exec(html)?.[1];
    expect(href).toBeDefined();
    expect(html).toContain('class="attachment"');
    expect(html).toContain('data-filename="solve.py"');
    const copied = path.join(dir, 'staging', href!.split('/')[2]!, 'solve.py');
    expect(readFileSync(copied, 'utf8')).toBe('print("pwn")\n');
  });

  it('missing linked files → warning, href removed (no broken link)', async () => {
    const fileURL = pathToFileURL(path.join(dir, 'post', 'index.md'));
    const { html, warnings } = await renderMd('[gone](./gone.zip)', { fileURL });
    expect(html).not.toContain('href=');
    expect(warnings.some((w) => w.includes('gone.zip'))).toBe(true);
  });
});
