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

/** Giữ YAML Document để không làm rơi field lạ, comment, cover hoặc summary. */
export function composeDocument(
  original: string,
  fields: EditorFields,
  body: string,
  draft?: boolean,
): string {
  const split = splitFrontmatter(original);
  if (split.error) throw new Error(`Không thể lưu frontmatter: ${split.error}`);
  const header = split.hasFrontmatter ? original.slice(0, original.length - split.body.length) : '';
  const yaml = header.replace(/^\uFEFF?---[ \t]*\r?\n/, '').replace(/(?:^|\r?\n)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)$/, '');
  const doc = parseDocument(yaml || '{}', { schema: 'core' });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
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
