import { stringify as stringifyYaml } from 'yaml';
import { toCategory, type Category } from './constants';
import { formatIsoDate, parseSiteDate } from './dates';
import { splitFrontmatter } from './frontmatter';
import { slugifyOrHash } from './slug';
import { normalizeTagInput } from './tags';

/**
 * Tách MỘT file Markdown gom cả giải CTF thành nhiều bài nhỏ (dùng bởi /admin/import/).
 *
 * Cấu trúc mong đợi (như file export từ HackMD):
 *   # Web                 ← heading cấp 1 = category (map qua toCategory; không khớp → '')
 *   ## Tên challenge      ← heading cấp 2 = một bài
 *   ...nội dung...
 *
 * - Heading trong code block (``` / ~~~, kể cả ```! của HackMD) bị bỏ qua: `# comment` trong
 *   script không bao giờ bị hiểu nhầm là category.
 * - `## Tên (misc)`: hậu tố trong ngoặc là category hợp lệ → ghi đè category của nhóm.
 * - `## ` rỗng không tách bài; nội dung giữa `#` và `##` đầu tiên được ghép vào đầu bài đầu tiên
 *   của nhóm (nhóm không có `##` nào thì chính nhóm đó thành một bài).
 * - Module chạy được cả trên trình duyệt (không dùng API của Node).
 */

export interface SplitPost {
  title: string;
  category: Category | '';
  /** Text của heading `#` chứa bài (hiển thị trong preview). */
  section: string;
  body: string;
}

export interface SplitDocument {
  /** Tên CTF: frontmatter `ctf` → `title` → tên file. */
  ctf: string;
  /** Ngày `YYYY-MM-DD` lấy từ frontmatter của file gốc, hoặc '' (khi đó dùng ngày commit). */
  date: string;
  tags: string[];
  posts: SplitPost[];
}

export interface SplitOptions {
  /** Tên CTF dự phòng (thường là tên file). */
  fallbackCtf?: string;
  /** Nâng heading để heading nông nhất của mỗi bài thành `##` (mục lục chỉ lấy #–###). Mặc định: true. */
  promoteHeadings?: boolean;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^( {0,3})(#{1,6})(?=[ \t]|$)(.*)$/;

interface Line {
  text: string;
  /** Độ sâu heading ATX (0 = không phải heading, hoặc nằm trong code block). */
  depth: number;
  /** Text của heading (đã bỏ `#` đóng ở cuối). */
  heading: string;
}

function scanLines(markdown: string): Line[] {
  let fence: { char: string; len: number } | undefined;
  return markdown.split(/\r?\n/).map((text) => {
    if (fence) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text);
      if (close?.[1]?.[0] === fence.char && close[1].length >= fence.len) fence = undefined;
      return { text, depth: 0, heading: '' };
    }
    const open = FENCE_OPEN_RE.exec(text);
    if (open?.[1]) {
      fence = { char: open[1][0] ?? '`', len: open[1].length };
      return { text, depth: 0, heading: '' };
    }
    const h = HEADING_RE.exec(text);
    if (!h) return { text, depth: 0, heading: '' };
    const heading = (h[3] ?? '').replace(/[ \t]+#+[ \t]*$/, '').replace(/^[ \t]*#+[ \t]*$/, '').trim();
    return { text, depth: h[2]?.length ?? 0, heading };
  });
}

/** Bỏ ký hiệu Markdown đơn giản trong title (`code`, **đậm**). */
function plainTitle(s: string): string {
  return s.replace(/`/g, '').replace(/(\*\*|__)(.+?)\1/g, '$2').trim();
}

/** Nâng mọi heading (ngoài code block) sao cho heading nông nhất thành `##`. */
export function promoteHeadings(markdown: string): string {
  const lines = scanLines(markdown);
  const depths = lines.filter((l) => l.depth > 0).map((l) => l.depth);
  if (!depths.length) return markdown;
  const shift = Math.min(...depths) - 2;
  if (shift <= 0) return markdown;
  return lines
    .map((l) => (l.depth > 0 ? l.text.replace(/^( {0,3})#+/, (_, indent: string) => indent + '#'.repeat(l.depth - shift)) : l.text))
    .join('\n');
}

function trimBlankLines(lines: string[]): string {
  return lines.join('\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd();
}

export function splitCtfMarkdown(raw: string, options: SplitOptions = {}): SplitDocument {
  const { data, body } = splitFrontmatter(raw);
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  const ctf = str(data.ctf) || str(data.title) || (options.fallbackCtf ?? '').trim();
  const parsedDate = parseSiteDate(data.date);

  const posts: SplitPost[] = [];
  let group = { section: '', category: '' as Category | '', intro: [] as string[], count: 0 };
  let current: { title: string; category: Category | ''; section: string; lines: string[] } | undefined;

  const flushPost = () => {
    if (!current) return;
    posts.push({ title: current.title, category: current.category, section: current.section, body: trimBlankLines(current.lines) });
    current = undefined;
  };
  const flushGroup = () => {
    flushPost();
    const intro = trimBlankLines(group.intro);
    // Nhóm không có `##` nào nhưng có nội dung → chính nhóm là một bài.
    if (group.count === 0 && intro) {
      posts.push({ title: group.section || ctf || 'Untitled', category: group.category, section: group.section, body: intro });
    }
  };

  for (const line of scanLines(body)) {
    if (line.depth === 1) {
      flushGroup();
      group = { section: line.heading, category: toCategory(line.heading) ?? '', intro: [], count: 0 };
      continue;
    }
    if (line.depth === 2) {
      if (!line.heading) continue; // `## ` rỗng: bỏ dòng, không tách bài
      flushPost();
      let title = plainTitle(line.heading);
      let category = group.category;
      const hint = /^(.*?)\s*\(([^()]+)\)$/.exec(title);
      const hinted = hint ? toCategory(hint[2] ?? '') : undefined;
      if (hint?.[1] && hinted) {
        title = hint[1];
        category = hinted;
      }
      // Phần mở đầu của nhóm (giữa `#` và `##` đầu tiên) được ghép vào đầu bài đầu tiên.
      current = { title, category, section: group.section, lines: group.count === 0 ? [...group.intro, ''] : [] };
      group.count++;
      continue;
    }
    (current?.lines ?? group.intro).push(line.text);
  }
  flushGroup();

  const promote = options.promoteHeadings ?? true;
  return {
    ctf,
    date: parsedDate ? formatIsoDate(parsedDate) : '',
    tags: normalizeTagInput(data.tags).tags,
    posts: promote ? posts.map((p) => ({ ...p, body: promoteHeadings(p.body) })) : posts,
  };
}

// ---------------------------------------------------------------------------
// Slug + file output
// ---------------------------------------------------------------------------

/** Slug của bài theo đường dẫn trong repo — cùng quy tắc với `getPathInfo` (không cần node:path). */
export function slugFromRepoPath(repoPath: string): string | undefined {
  const m = /(?:^|\/)src\/content\/posts\/(.+\.md)$/i.exec(repoPath);
  if (!m?.[1]) return undefined;
  const segments = m[1].split('/').filter(Boolean);
  const file = segments.at(-1) ?? '';
  const base = /^index\.md$/i.test(file) && segments.length >= 2 ? (segments.at(-2) ?? '') : file.replace(/\.md$/i, '');
  return slugifyOrHash(base, 'post');
}

/**
 * Slug cho từng bài, không trùng với `taken` (slug đã có trong repo) và không trùng nhau.
 * Trùng thì thêm tiền tố CTF (`nns-ctf-baby`), vẫn trùng thì thêm số (`-2`, `-3`…).
 * Trùng slug là lỗi làm build fail, nên bước này bắt buộc.
 */
export function assignSlugs(titles: string[], ctf: string, taken: Iterable<string>): string[] {
  const used = new Set(taken);
  const ctfSlug = slugifyOrHash(ctf, 'ctf');
  return titles.map((title) => {
    const base = slugifyOrHash(title, 'post');
    let slug = used.has(base) ? `${ctfSlug}-${base}` : base;
    for (let n = 2; used.has(slug); n++) slug = `${ctfSlug}-${base}-${n}`;
    used.add(slug);
    return slug;
  });
}

/** Tên thư mục CTF hợp lệ trên mọi hệ điều hành (giữ nguyên chữ hoa, dấu, khoảng trắng). */
export function ctfFolderName(ctf: string): string {
  const name = ctf
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return name && !name.startsWith('.') ? name : slugifyOrHash(ctf, 'ctf');
}

export interface PostFileInput {
  title: string;
  slug: string;
  category: Category | '';
  body: string;
  ctf: string;
  date?: string;
  tags?: string[];
}

/** Đường dẫn + nội dung `index.md` của một bài: src/content/posts/<CTF>/<slug>/index.md */
export function buildPostFile(post: PostFileInput): { path: string; content: string } {
  const fm: Record<string, unknown> = { title: post.title };
  if (post.date) fm.date = post.date;
  if (post.ctf) fm.ctf = post.ctf;
  if (post.category) fm.category = post.category;
  if (post.tags?.length) fm.tags = post.tags;
  const folder = post.ctf ? `${ctfFolderName(post.ctf)}/` : '';
  return {
    path: `src/content/posts/${folder}${post.slug}/index.md`,
    content: `---\n${stringifyYaml(fm, { lineWidth: 0 })}---\n\n${post.body.trim()}\n`,
  };
}
