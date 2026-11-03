import { describe, expect, it } from 'vitest';
import { renderStudioMarkdown } from '../../src/lib/studio-renderer';
import { renderMd } from '../markdown/render';
const examples = [
  [':::info\nMột **ý** với `code`\n:::', 'callout-info'],
  [':::spoiler Flag\n`flag{sample}`\n:::', '<details'],
  ['==đánh dấu== và [tham khảo](https://example.com)', '<mark>đánh dấu</mark>'],
  ['| tên | giá trị |\n|---|---|\n| x | 1 |', 'table-wrap'],
  ['$x^2$\n\n$$\n\\frac{a}{b}\n$$', 'class="katex"'],
  ['{%youtube dQw4w9WgXcQ %}', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
] as const;
describe('cú pháp chung giữa Studio và public', () => {
  it.each(examples)('%s', async (source, expected) => {
    expect(await renderStudioMarkdown(source)).toContain(expected);
    expect((await renderMd(source)).html).toContain(expected);
  });
  it('cùng loại bỏ script và event của raw HTML', async () => {
    const source = '<script>alert(1)</script><img src="x" onerror="alert(1)">';
    for (const html of [await renderStudioMarkdown(source), (await renderMd(source)).html]) {
      expect(html).not.toMatch(/<script|onerror=/);
    }
  });
  it('công thức và dấu == trong code không bị render thành markup', async () => {
    const html = await renderStudioMarkdown('```php!\n$x = 1; $y = 2;\n$x == $y;\n```');
    expect(html).not.toContain('class="katex"');
    expect(html).not.toContain('<mark>');
    expect(html).toContain('data-wrap="true"');
  });
  it('giữ source Mermaid để client render an toàn', async () => {
    expect(await renderStudioMarkdown('```mermaid\ngraph TD\nA-->B\n```')).toContain('data-lang="mermaid"');
    expect((await renderMd('```mermaid\ngraph TD\nA-->B\n```')).html).toContain('class="mermaid"');
  });
});
it('giữ dòng nguồn sau callout khi preprocess thêm dòng HTML', async () => {
  const html = await renderStudioMarkdown(':::info\nNội dung\n:::\n\nSau callout');
  expect(html).toMatch(/data-line="4"[^>]*>Sau callout/);
});

it('preview bỏ heading trùng title như public',async()=>{
 const source='# Tiêu đề\n\nNội dung';
 expect(await renderStudioMarkdown(source,'Tiêu đề')).not.toContain('<h1');
 expect((await renderMd(source,{title:'Tiêu đề'})).html).not.toContain('<h1');
});
