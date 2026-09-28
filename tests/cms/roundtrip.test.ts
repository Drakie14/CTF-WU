// Round-trip Sveltia CMS (mục 66.5-B): mô phỏng đúng cách Sveltia CMS 0.221 đọc và ghi
// file `yaml-frontmatter`, rồi xác nhận thân bài HackMD giữ nguyên từng byte.
//
// Logic dưới đây chép theo bundle @sveltia/cms (dist/sveltia-cms.js):
//   - đọc: `text.trim().replace(/\r\n?/g, '\n')`, tách bằng
//     /^---\n(?<head>[\s\S]*?)\n---(?:\n(?<body>[\s\S]*))?$/, bỏ MỘT dòng trống đầu thân bài;
//   - ghi: `---\n${yaml}\n---\n\n${body}\n`, YAML bằng thư viện `yaml` với
//     { indent: 2, indentSeq: true, lineWidth: 0, defaultKeyType: 'PLAIN',
//       defaultStringType: 'PLAIN', singleQuote: true } rồi `.trim()`.
// Đã kiểm chứng thêm bằng Sveltia thật trong trình duyệt (xem báo cáo Phase 7).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { normalizeFrontmatter, splitFrontmatter } from '../../src/lib/content/frontmatter';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

type Entry = Record<string, unknown> & { body: string };

function cmsParse(text: string): Entry {
  const t = text.trim().replace(/\r\n?/g, '\n');
  const m = /^---\n(?<head>[\s\S]*?)\n---(?:\n(?<body>[\s\S]*))?$/.exec(t);
  if (!m?.groups) return { body: t };
  const data = (parseYaml(m.groups.head ?? '') ?? {}) as Record<string, unknown>;
  return { ...data, body: (m.groups.body ?? '').replace(/^\n/, '') };
}

function cmsSerialize(entry: Entry): string {
  const { body, ...data } = entry;
  const yaml = stringifyYaml(data, null, {
    indent: 2,
    indentSeq: true,
    lineWidth: 0,
    defaultKeyType: 'PLAIN',
    defaultStringType: 'PLAIN',
    singleQuote: true,
  }).trim();
  return `---\n${yaml}\n---\n${body ? `\n${body}\n` : ''}`;
}

/** Thân bài như pipeline Astro nhìn thấy (sau khối frontmatter, bỏ dòng trống đầu). */
const bodyOf = (text: string) => splitFrontmatter(text.replace(/\r\n?/g, '\n')).body.replace(/^\n/, '');

// Chỉ dùng fixture cố định trong tests/: bài thật trong src/content/posts thay đổi theo nội dung blog.
const SAMPLES = ['tests/cms/hackmd-sample.md'];

describe('Sveltia CMS round-trip giữ nguyên Markdown HackMD', () => {
  for (const file of SAMPLES) {
    it(`${file}: sửa frontmatter → thân bài giống hệt từng byte`, () => {
      const original = read(file);
      const entry = cmsParse(original);
      // Người dùng chỉ sửa title + thêm tag mới trên form CMS.
      entry.title = `${String(entry.title)} (đã sửa)`;
      entry.tags = ['new-tag'];
      const saved = cmsSerialize(entry);

      const before = Buffer.from(bodyOf(original).replace(/\n+$/, ''), 'utf8');
      const after = Buffer.from(bodyOf(saved).replace(/\n+$/, ''), 'utf8');
      expect(after.equals(before)).toBe(true);

      // Lưu lần hai không đổi gì → file giống hệt lần một (idempotent).
      expect(cmsSerialize(cmsParse(saved))).toBe(saved);
    });
  }

  it('giữ các cú pháp nhạy cảm: callout, spoiler, fence ~~~, tab, 2 dấu cách cuối dòng, raw HTML', () => {
    const saved = cmsSerialize(cmsParse(read('tests/cms/hackmd-sample.md')));
    for (const s of [':::info\n', ':::spoiler Bấm để xem flag\n', '~~~python=\n', '\tindented_with_tab', 'cuối  \ndòng',
      '[TOC]', '==highlight==', '{%youtube dQw4w9WgXcQ %}', '![](./flag.png =300x)', '<details><summary>']) {
      expect(saved).toContain(s);
    }
  });

  it('key frontmatter không có trên form (description, lang) được giữ lại', () => {
    const entry = cmsParse(read('tests/cms/hackmd-sample.md'));
    const data = splitFrontmatter(cmsSerialize(entry)).data;
    expect(data.description).toBe('Mô tả kiểu HackMD (key không có trong CMS form)');
    expect(data.lang).toBe('vi-VN');
  });

  it('frontmatter CMS ghi ra vẫn được pipeline đọc đúng (date không lệch, tags là mảng)', () => {
    const saved = cmsSerialize({
      title: 'Bài mới từ CMS', date: '2026-09-25', ctf: 'Brand New CTF', category: 'web',
      tags: ['new-tag', 'SQLi'], cover: 'flag.png', body: 'Nội dung',
    });
    expect(saved.startsWith('---\ntitle: Bài mới từ CMS\ndate: 2026-09-25\n')).toBe(true);
    const { data, body } = splitFrontmatter(saved);
    expect(data).toMatchObject({ date: '2026-09-25', tags: ['new-tag', 'SQLi'], cover: 'flag.png' });
    expect(body).toBe('\nNội dung\n');
  });

  it('frontmatter đầy đủ do CMS ghi (kể cả images) không sinh warning', () => {
    const saved = cmsSerialize({
      title: 'Bài mới', date: '2026-09-25', ctf: 'X', category: 'web', difficulty: 'easy', points: 100,
      tags: ['a'], summary: 's', cover: 'flag.png', images: ['flag.png', 'screenshot.png'], body: 'x',
    });
    const { warnings } = normalizeFrontmatter(splitFrontmatter(saved).data, {
      file: 'src/content/posts/bai-moi/index.md', baseName: 'bai-moi', folderCtf: '',
      fallbackDate: new Date(), fallbackDateSource: 'mtime',
    });
    expect(warnings).toEqual([]);
  });

  it('file không có frontmatter: toàn bộ nội dung là thân bài', () => {
    const entry = cmsParse('# Chỉ có heading\n\n:::success\nok\n:::\n');
    expect(entry.body).toBe('# Chỉ có heading\n\n:::success\nok\n:::');
    entry.title = 'Thêm title';
    expect(bodyOf(cmsSerialize(entry))).toBe('# Chỉ có heading\n\n:::success\nok\n:::\n');
  });
});
