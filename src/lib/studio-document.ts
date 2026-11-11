import { parseDocument } from 'yaml';
import { splitFrontmatter } from './content/frontmatter';
import { formatIsoDate, parseSiteDate } from './content/dates';

export interface EditorFields {
  summary?: string;
  title: string;
  date: string;
  ctf: string;
  category: string;
  difficulty: string;
  tags: string;
}

function frontmatterDocument(source: string) {
  const split = splitFrontmatter(source);
  if (split.error) throw new Error(`Không thể lưu frontmatter: ${split.error}`);
  const header = split.hasFrontmatter ? source.slice(0, source.length - split.body.length) : '';
  const yaml = header.replace(/^\uFEFF?---[ \t]*\r?\n/, '').replace(/(?:^|\r?\n)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)$/, '');
  const doc = parseDocument(yaml || '{}', { schema: 'core' });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  return { split, header, doc };
}

function serializeFrontmatter(source: string, { split, header, doc }: ReturnType<typeof frontmatterDocument>): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const opening = header.match(/^\uFEFF?---[ \t]*\r?\n/)?.[0]
    ?? `${source.startsWith('\uFEFF') ? '\uFEFF' : ''}---${newline}`;
  const closing = header.match(/(?:^|\r?\n)((?:---|\.\.\.)[ \t]*(?:\r?\n|$))$/)?.[1] ?? `---${newline}`;
  return `${opening}${doc.toString().replace(/\n/g, newline)}${closing}${split.body}`;
}

/** Chỉ đổi trạng thái ẩn; giữ nguyên body và các field/comment khác trong YAML. */
export function withDraftFlag(source: string, hidden: boolean): string {
  const document = frontmatterDocument(source);
  if (hidden ? document.doc.get('draft') === true : !document.doc.has('draft')) return source;
  if (hidden) document.doc.set('draft', true);
  else document.doc.delete('draft');
  return serializeFrontmatter(source, document);
}

/** Đổi tên giải theo folder mà không ghi đè tên CTF do tác giả đặt riêng. */
export function retargetCtf(source: string, from: string, to: string): string {
  const document = frontmatterDocument(source);
  if (from === to || document.doc.get('ctf') !== from) return source;
  document.doc.set('ctf', to);
  return serializeFrontmatter(source, document);
}

/** Giữ YAML Document để không làm rơi field lạ, comment, cover hoặc summary. */
export function composeDocument(
  original: string,
  fields: EditorFields,
  body: string,
  draft?: boolean,
): string {
  const { doc } = frontmatterDocument(original);
  for (const key of ['title', 'date', 'ctf', 'category', 'difficulty'] as const) {
    const value = fields[key].trim();
    if (key === 'date' && value) {
      const originalDate = parseSiteDate(doc.get(key));
      if (originalDate && formatIsoDate(originalDate) === value) continue;
    }
    if (value) doc.set(key, value);
    else doc.delete(key);
  }
  if (fields.summary !== undefined) {
    if (fields.summary.trim()) doc.set('summary', fields.summary.trim());
    else doc.delete('summary');
  }
  const tags = fields.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length) doc.set('tags', tags);
  else doc.delete('tags');
  if (draft !== undefined) {
    if (draft) doc.set('draft', true);
    else doc.delete('draft');
  }
  return `---\n${doc.toString()}---\n\n${body.trim()}\n`;
}

export function readDocument(source: string) {
  const split = splitFrontmatter(source);
  if (split.error) throw new Error(`Frontmatter không hợp lệ: ${split.error}`);
  return { fields: split.data, body: split.body };
}
