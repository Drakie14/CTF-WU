import { parse as parseYaml } from 'yaml';
import { CATEGORIES, CATEGORY_ALIASES, DIFFICULTIES, type Category, type Difficulty } from './constants';
import { parseSiteDate } from './dates';
import { normalizeTagInput } from './tags';

/**
 * Pipeline frontmatter (mục 13):
 *   Raw Markdown → Parse frontmatter → Normalize → Validate → Warning → Defaults → Normalized data
 *
 * Mọi hàm ở đây là thuần (không import `astro:*`) để test được bằng Vitest.
 * Không hàm nào throw vì dữ liệu sai: thay vào đó trả về warning + giá trị mặc định.
 */

export interface ContentWarning {
  file: string;
  field: string;
  value?: unknown;
  fallback?: unknown;
  message: string;
}

export function formatWarning(w: ContentWarning): string {
  const parts = [`[content] ${w.file}`, `field "${w.field}"`, w.message];
  if (w.value !== undefined) parts.push(`value: ${safeStringify(w.value)}`);
  if (w.fallback !== undefined) parts.push(`default: ${safeStringify(w.fallback)}`);
  return parts.join(' — ');
}

function safeStringify(v: unknown): string {
  try {
    const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v) ?? String(v);
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  } catch {
    return String(v);
  }
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

export interface SplitResult {
  /** Dữ liệu YAML (object) hoặc `{}` nếu không có/không hợp lệ. */
  data: Record<string, unknown>;
  /** Thân bài (không gồm khối frontmatter). */
  body: string;
  hasFrontmatter: boolean;
  /** Lỗi parse YAML nếu có. */
  error?: string;
}

const FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
const EMPTY_FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(raw: string): SplitResult {
  const empty = EMPTY_FRONTMATTER_RE.exec(raw);
  if (empty) return { data: {}, body: raw.slice(empty[0].length), hasFrontmatter: true };

  const m = FRONTMATTER_RE.exec(raw);
  if (!m) return { data: {}, body: raw.replace(/^﻿/, ''), hasFrontmatter: false };

  const body = raw.slice(m[0].length);
  try {
    // Schema "core": không tự chuyển `2026-09-25` thành Date (tránh lệch múi giờ).
    const parsed: unknown = parseYaml(m[1] ?? '', { schema: 'core', uniqueKeys: false });
    if (parsed === null || parsed === undefined) return { data: {}, body, hasFrontmatter: true };
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, body, hasFrontmatter: true, error: 'frontmatter is not a key/value object' };
    }
    return { data: parsed as Record<string, unknown>, body, hasFrontmatter: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return { data: {}, body, hasFrontmatter: true, error: `invalid YAML (${msg})` };
  }
}

// ---------------------------------------------------------------------------
// Normalize
// ---------------------------------------------------------------------------

export interface NormalizeContext {
  /** Đường dẫn hiển thị trong warning (tương đối so với project). */
  file: string;
  /** Tên file/thư mục gốc — title tạm khi thiếu title. */
  baseName: string;
  /** Tên thư mục CTF suy ra từ đường dẫn ('' nếu không có). */
  folderCtf: string;
  /** Ngày fallback (Git commit đầu tiên hoặc mtime). */
  fallbackDate: Date;
  fallbackDateSource: 'git' | 'mtime';
}

export interface NormalizedFrontmatter {
  title: string;
  titleInferred: boolean;
  date: Date;
  dateSource: 'frontmatter' | 'git' | 'mtime';
  ctf: string;
  ctfInferred: boolean;
  category: Category | '';
  difficulty: Difficulty | '';
  points: number | null;
  tags: string[];
  /** Summary từ frontmatter (`summary` hoặc `description`); '' nếu không có. */
  summary: string;
  /** Đường dẫn cover như ghi trong file (chưa kiểm tra tồn tại). */
  cover: string;
}

const KNOWN_KEYS = new Set([
  'title', 'date', 'ctf', 'category', 'difficulty', 'points', 'tags', 'summary', 'description', 'cover',
]);

/** Metadata HackMD hay xuất hiện: bỏ qua im lặng (không phải lỗi của người viết). */
const IGNORED_HACKMD_KEYS = new Set([
  'lang', 'langs', 'breaks', 'robots', 'ga', 'disqus', 'type', 'slideoptions', 'dir', 'image', 'opengraph',
  'author', 'authors',
  // Danh sách ảnh do Sveltia CMS quản lý (field "Ảnh trong bài"); website không dùng.
  'images',
]);

function asTrimmedString(v: unknown): string | null {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

export function normalizeFrontmatter(
  raw: Record<string, unknown>,
  ctx: NormalizeContext,
): { data: NormalizedFrontmatter; warnings: ContentWarning[] } {
  const warnings: ContentWarning[] = [];
  const warn = (field: string, message: string, value?: unknown, fallback?: unknown) =>
    warnings.push({ file: ctx.file, field, message, value, fallback });

  // Key lạ → warning, bỏ qua.
  for (const key of Object.keys(raw)) {
    const k = key.toLowerCase();
    if (KNOWN_KEYS.has(key)) continue;
    if (IGNORED_HACKMD_KEYS.has(k)) continue;
    warn(key, 'unknown key, ignored', raw[key]);
  }

  // title
  let title = '';
  let titleInferred = false;
  if (raw.title === undefined || raw.title === null) {
    titleInferred = true;
  } else {
    const t = asTrimmedString(raw.title);
    if (t === null) {
      warn('title', 'must be a string', raw.title, ctx.baseName);
      titleInferred = true;
    } else if (!t) {
      warn('title', 'is empty', raw.title, ctx.baseName);
      titleInferred = true;
    } else {
      title = t;
    }
  }
  if (titleInferred) {
    title = ctx.baseName;
    if (raw.title === undefined || raw.title === null) {
      warn('title', 'missing, using file/folder name as temporary title', undefined, ctx.baseName);
    }
  }

  // date
  let date = ctx.fallbackDate;
  let dateSource: NormalizedFrontmatter['dateSource'] = ctx.fallbackDateSource;
  if (raw.date !== undefined && raw.date !== null && raw.date !== '') {
    const parsed = parseSiteDate(raw.date);
    if (parsed) {
      date = parsed;
      dateSource = 'frontmatter';
    } else {
      warn('date', 'invalid date', raw.date, `${ctx.fallbackDate.toISOString()} (${ctx.fallbackDateSource})`);
    }
  }

  // ctf
  let ctf = '';
  let ctfInferred = false;
  if (raw.ctf !== undefined && raw.ctf !== null && raw.ctf !== '') {
    const c = asTrimmedString(raw.ctf);
    if (c) ctf = c;
    else warn('ctf', 'must be a string', raw.ctf, ctx.folderCtf || '');
  }
  if (!ctf && ctx.folderCtf) {
    ctf = ctx.folderCtf;
    ctfInferred = true;
  }

  // category
  let category: NormalizedFrontmatter['category'] = '';
  if (raw.category !== undefined && raw.category !== null && raw.category !== '') {
    const c = asTrimmedString(raw.category)?.toLowerCase() ?? '';
    const mapped = (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : CATEGORY_ALIASES[c];
    if (mapped) category = mapped;
    else warn('category', `must be one of ${CATEGORIES.join(', ')}`, raw.category, '');
  }

  // difficulty
  let difficulty: NormalizedFrontmatter['difficulty'] = '';
  if (raw.difficulty !== undefined && raw.difficulty !== null && raw.difficulty !== '') {
    const d = asTrimmedString(raw.difficulty)?.toLowerCase() ?? '';
    if ((DIFFICULTIES as readonly string[]).includes(d)) difficulty = d as Difficulty;
    else warn('difficulty', `must be one of ${DIFFICULTIES.join(', ')}`, raw.difficulty, '');
  }

  // points
  let points: number | null = null;
  if (raw.points !== undefined && raw.points !== null && raw.points !== '') {
    const p = typeof raw.points === 'number' ? raw.points : typeof raw.points === 'string' ? Number(raw.points.trim()) : NaN;
    if (Number.isInteger(p) && p >= 0) points = p;
    else warn('points', 'must be a non-negative integer', raw.points, null);
  }

  // tags
  const tagResult = normalizeTagInput(raw.tags);
  if (tagResult.invalid) warn('tags', 'must be a list or a comma-separated string', raw.tags, tagResult.tags);
  const tags = tagResult.tags;

  // summary / description
  let summary = '';
  for (const key of ['summary', 'description'] as const) {
    if (summary || raw[key] === undefined || raw[key] === null) continue;
    const s = asTrimmedString(raw[key]);
    if (s === null) warn(key, 'must be a string', raw[key], '');
    else summary = s;
  }

  // cover
  let cover = '';
  if (raw.cover !== undefined && raw.cover !== null && raw.cover !== '') {
    if (typeof raw.cover === 'string') cover = raw.cover.trim();
    else warn('cover', 'must be a string path', raw.cover, '');
  }

  return {
    data: { title, titleInferred, date, dateSource, ctf, ctfInferred, category, difficulty, points, tags, summary, cover },
    warnings,
  };
}
