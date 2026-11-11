import { describe, expect, it } from 'vitest';
import { composeDocument, readDocument } from '../../src/lib/studio-document';
const fields = {
  title: 'Bài đã sửa',
  date: '2026-11-03',
  ctf: 'Dreamhack',
  category: 'web',
  difficulty: 'Bronze 3',
  tags: 'XSS, DOM',
};
describe('Studio mở và lưu tài liệu', () => {
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
