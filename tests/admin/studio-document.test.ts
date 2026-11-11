import { describe, expect, it } from 'vitest';
import { composeDocument, readDocument, retargetCtf, withDraftFlag } from '../../src/lib/studio-document';
const fields = {
  title: 'Bài đã sửa',
  date: '2026-11-03',
  ctf: 'Dreamhack',
  category: 'web',
  difficulty: 'Bronze 3',
  tags: 'XSS, DOM',
};
describe('Studio mở và lưu tài liệu', () => {
  it.each([
    '---\n{ title: Flow, ctf: "CSCTF 2026", tags: [Cookie], points: 42 }\n---\n\n`CSCTF{keep}`\n',
    '---\nctf: \'CSCTF 2026\' # Giữ comment\ncover: ./image.png\n---\n\nPayload\n',
    '\uFEFF---\r\n"ctf": CSCTF 2026\r\ntitle: BOM\r\n...\r\n\r\nPayload\r\n',
  ])('đổi ctf đúng tên giải và giữ nguyên body/metadata với source %s', (source) => {
    const original = readDocument(source);
    const output = retargetCtf(source, 'CSCTF 2026', 'New CTF: "2027"');
    expect(readDocument(output)).toEqual({ fields: { ...original.fields, ctf: 'New CTF: "2027"' }, body: original.body });
    if (source.includes('# Giữ comment')) expect(output).toContain('# Giữ comment');
    if (source.startsWith('\uFEFF')) {
      expect(output).toMatch(/^\uFEFF---\r\n/);
      expect(output).toContain('...\r\n\r\nPayload\r\n');
    }
  });

  it.each([
    '---\nctf: Custom\n---\nBody',
    '---\ntitle: Missing CTF\n---\nBody',
    '---\n---\nBody',
    'Body without frontmatter',
    '---\nctf: 42\n---\nBody',
  ])('không tự đổi ctf khác tên folder hoặc thiếu ctf: %s', (source) => {
    expect(retargetCtf(source, '42', 'New CTF')).toBe(source);
  });

  it('giữ source khi tên CTF không đổi và từ chối YAML hỏng', () => {
    const source = '---\nctf: Same\n---\nBody';
    expect(retargetCtf(source, 'Same', 'Same')).toBe(source);
    expect(() => retargetCtf('---\nctf: [\n---\nPayload', 'Old', 'New')).toThrow();
  });

  it.each([
    '---\n{ title: Flow, ctf: CSCTF 2026, tags: [Cookie], points: 42 }\n---\n\n## Solution\n\n`CSCTF{keep}`\n',
    '\uFEFF---\r\n# Giữ comment\r\ntitle: BOM\r\ncover: ./image.png\r\n...\r\n\r\nPayload\r\n',
    '---\n---\n\nTrước\n\n---\n\nSau\n',
    'Không có frontmatter\n\n`DH{keep}`\n',
  ])('ẩn rồi hiện bài giữ nguyên body và metadata với source %s', (source) => {
    const original = readDocument(source);
    const hidden = withDraftFlag(source, true);
    expect(readDocument(hidden)).toEqual({ fields: { ...original.fields, draft: true }, body: original.body });
    expect(readDocument(withDraftFlag(hidden, false))).toEqual(original);
    if (source.includes('# Giữ comment')) {
      expect(hidden).toContain('# Giữ comment');
      expect(hidden).toMatch(/^\uFEFF---\r\n/);
      expect(hidden).toContain('...\r\n\r\nPayload\r\n');
    }
  });

  it.each([
    '---\n{ title: Flow, draft: true, points: 42 }\n---\n\nBody',
    '---\ntitle: Block\ndraft: true # Đang ẩn\n---\n\nBody',
  ])('hiện bài có draft ở flow YAML hoặc kèm comment', (source) => {
    const output = readDocument(withDraftFlag(source, false));
    expect(output.fields).not.toHaveProperty('draft');
    expect(output.fields.title).toBe(readDocument(source).fields.title);
    expect(output.body).toBe(readDocument(source).body);
  });

  it('không ghi lại source khi trạng thái ẩn đã đúng', () => {
    const shown = '---\n{title: Same}\n---\nBody';
    const hidden = '---\n{title: Same, draft: true}\n---\nBody';
    expect(withDraftFlag(shown, false)).toBe(shown);
    expect(withDraftFlag(hidden, true)).toBe(hidden);
  });

  it('đổi trạng thái ẩn từ chối YAML hỏng', () => {
    expect(() => withDraftFlag('---\ncover: [\n---\nPayload', true)).toThrow();
  });

  it('không nhầm đường kẻ ngang trong body là phần kết frontmatter rỗng', () => {
    const source = '---\n---\n\nTrước\n\n---\n\nSau';
    const output = composeDocument(source, fields, readDocument(source).body);
    expect(readDocument(output).fields.title).toBe(fields.title);
    expect(readDocument(output).body.trim()).toBe('Trước\n\n---\n\nSau');
  });

  it.each(['03/11/2026', '2026-11-02T20:30:00Z'])('giữ date gốc %s nếu tác giả không đổi ngày', (date) => {
    const source = `---\ndate: ${date}\n---\n`;
    expect(readDocument(composeDocument(source, fields, 'body')).fields.date).toBe(date);
    expect(readDocument(composeDocument(source, { ...fields, date: '2026-11-04' }, 'body')).fields.date).toBe('2026-11-04');
  });

  it('sửa body và metadata editor nhưng giữ cover, summary, points, field lạ và comment', () => {
    const source =
      '---\n# ghi chú tác giả\ntitle: Cũ\nsummary: Tóm tắt đã viết\ndescription: Mô tả gốc\ncover: ./cover.png\npoints: 0\nauthor: Hieu\ndraft: true\n---\n\nbody cũ';
    const output = composeDocument(source, fields, 'payload `DH{testflag}`');
    const data = readDocument(output);
    expect(data.fields).toMatchObject({
      ...fields,
      tags: ['XSS', 'DOM'],
      summary: 'Tóm tắt đã viết',
      description: 'Mô tả gốc',
      cover: './cover.png',
      points: 0,
      author: 'Hieu',
      draft: true,
    });
    expect(output).toContain('# ghi chú tác giả');
    expect(data.body.trim()).toBe('payload `DH{testflag}`');
  });
  it('giữ metadata khi đổi bài rồi mở lại bản đã lưu', () => {
    const first = composeDocument('---\ncover: ./a.png\npoints: 12\n---\n', fields, 'một');
    const next = composeDocument(first, { ...fields, title: 'Mới' }, 'hai');
    expect(readDocument(next).fields).toMatchObject({ cover: './a.png', points: 12, title: 'Mới' });
  });
  it('không tự bỏ draft của bài mới mở từ local', () =>
    expect(readDocument(composeDocument('---\ndraft: true\n---\n', fields, 'body')).fields.draft).toBe(true));
  it('không âm thầm bỏ YAML hỏng', () =>
    expect(() => composeDocument('---\ncover: [\n---\n', fields, 'x')).toThrow());
  it('summary có thể sửa và xóa mà không đổi description gốc', () => {
    const source = '---\nsummary: Cũ\ndescription: Gốc\n---\n';
    expect(readDocument(composeDocument(source, { ...fields, summary: 'Mới' }, 'x')).fields.summary).toBe(
      'Mới',
    );
    expect(readDocument(composeDocument(source, { ...fields, summary: '' }, 'x')).fields).toMatchObject({
      description: 'Gốc',
    });
  });
});
