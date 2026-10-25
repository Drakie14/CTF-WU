import { describe, expect, it } from 'vitest';
import { escapeHtml, lineToTop, normalizeAnchors, normalizeCallouts, prepareExtensions, renderBlocks, topToLine } from '../../src/lib/studio-preview';

const pipeline = (source: string) => renderBlocks(prepareExtensions(normalizeCallouts(source)), source.split('\n').length);
const blocks = (html: string) => [...html.matchAll(/<([a-z][\w-]*) data-line="(\d+)" data-end="(\d+)"/g)].map((m) => ({ tag: m[1], line: Number(m[2]), end: Number(m[3]) }));

const doc = [
  '# Tiêu đề', //                0
  '', //                         1
  'Đoạn đầu có ghi chú[^1].', //  2
  '[ref]: https://example.com', // 3
  '', //                         4
  ':::info Lưu ý', //            5
  'nội dung callout', //         6
  '', //                         7
  'đoạn thứ hai trong callout', // 8
  ':::', //                      9
  '', //                         10
  '$$', //                       11
  'x = 1', //                    12
  '$$', //                       13
  '', //                        14
  '[TOC]', //                   15
  '', //                        16
  '```js', //                   17
  'const a = "$$ ==";', //      18
  '```', //                     19
  '', //                        20
  '- một', //                   21
  '- hai', //                   22
  '', //                        23
  '![image](./a.png)', //       24
  '', //                        25
  '| a | b |', //              26
  '|---|---|', //              27
  '| 1 | 2 |', //              28
  '', //                       29
  '[^1]: Chú thích.', //        30
  '',
].join('\n');

describe('renderBlocks', () => {
  it('gắn data-line đúng dòng gốc dù callout, $$, [TOC], fence và footnote đổi nội dung', () => {
    const found = blocks(pipeline(doc));
    const byLine = new Map(found.map((block) => [block.line, block]));
    expect(byLine.get(0)?.tag).toBe('h1');
    expect(byLine.get(2)?.tag).toBe('p');
    expect(byLine.get(5)?.tag).toBe('blockquote');
    expect(byLine.get(11)?.tag).toBe('p');
    expect(byLine.get(17)?.tag).toBe('pre');
    expect(byLine.get(21)?.tag).toBe('ul');
    expect(byLine.get(24)?.tag).toBe('p');
    expect(byLine.get(26)?.tag).toBe('table');
  });

  it('end là dòng kế sau khối và các khối không chồng nhau', () => {
    const found = blocks(pipeline(doc));
    expect(found.find((block) => block.line === 17)?.end).toBe(20);
    expect(found.find((block) => block.line === 21)?.end).toBe(23);
    for (let i = 1; i < found.length; i++) expect(found[i].line).toBeGreaterThanOrEqual(found[i - 1].end);
  });

  it('không gắn data-line cho khối chú thích chân trang nằm ngoài nguồn', () => {
    const html = pipeline('Có[^1]\n\n[^1]: Chú thích\n');
    expect(html).toContain('<section class="footnotes">');
    expect(blocks(html).map((block) => block.tag)).toEqual(['p']);
  });

  it('giữ link reference và bỏ qua dòng CRLF', () => {
    const html = pipeline('[a][ref]\r\n\r\n[ref]: https://example.com\r\n\r\ncuối');
    expect(html).toContain('href="https://example.com"');
    expect(blocks(html).find((block) => block.tag === 'p' && block.line === 4)).toBeTruthy();
  });
});

describe('tiền xử lý giữ nguyên số dòng', () => {
  const lines = (value: string) => value.split('\n').length;
  it.each([
    [':::warning\nA\n\nB\n:::\nsau'],
    [':::info\nmột dòng\n:::\n\nsau'],
    ['$$\n\\frac{a}{b}\n$$\nsau'],
    ['$$ a $$ và $b$\nsau'],
    ['[TOC]\n\nvăn bản'],
    ['Có[^1]\n\n[^1]: Chú thích\n\nsau'],
    ['```php\n$a = 1; $b = 2;\n==x==\n```\nsau'],
  ])('%j', (source) => {
    expect(lines(prepareExtensions(normalizeCallouts(source)))).toBeGreaterThanOrEqual(lines(source));
    const html = prepareExtensions(normalizeCallouts(source));
    expect(lines(html.replace(/\n\n<section class="footnotes">[\s\S]*$/, ''))).toBe(lines(source));
  });

  it('dòng sau callout không bị nuốt vào blockquote', () => {
    const found = blocks(pipeline(':::info\nnội dung\n:::\nsau'));
    expect(found.map((block) => block.tag)).toEqual(['blockquote', 'p']);
    expect(found[1].line).toBe(3);
  });

  it('escapeHtml', () => expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;'));
});

describe('nội suy mốc', () => {
  const anchors = normalizeAnchors([{ line: 0, top: 0 }, { line: 10, top: 100 }, { line: 12, top: 400 }, { line: 20, top: 480 }], 20, 500);
  it('chiều đi và chiều về khớp nhau', () => {
    expect(lineToTop(anchors, 5)).toBe(50);
    expect(lineToTop(anchors, 11)).toBe(250);
    expect(topToLine(anchors, 250)).toBe(11);
    expect(topToLine(anchors, lineToTop(anchors, 16.5))).toBeCloseTo(16.5);
  });
  it('mốc biên', () => {
    expect(lineToTop(anchors, 0)).toBe(0);
    expect(lineToTop(anchors, 99)).toBe(500);
    expect(topToLine(anchors, 10000)).toBe(20);
  });
  it('mốc trùng dòng hoặc top không chia cho 0 và không giảm', () => {
    const flat = normalizeAnchors([{ line: 3, top: 30 }, { line: 3, top: 30 }, { line: 2, top: 10 }, { line: 8, top: 30 }], 10, 100);
    for (let i = 1; i < flat.length; i++) { expect(flat[i].line).toBeGreaterThanOrEqual(flat[i - 1].line); expect(flat[i].top).toBeGreaterThanOrEqual(flat[i - 1].top); }
    for (const value of [0, 2.5, 3, 5, 8, 10]) expect(Number.isFinite(lineToTop(flat, value))).toBe(true);
    for (const value of [0, 20, 30, 31, 100]) expect(Number.isFinite(topToLine(flat, value))).toBe(true);
  });
  it('không có mốc', () => { expect(lineToTop([], 3)).toBe(0); expect(topToLine([], 3)).toBe(0); });
});
