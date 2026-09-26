import { slugifyOrHash } from './slug';

/**
 * Tags hoàn toàn dynamic (mục 10 + 66.5-A): không có danh sách tag cố định.
 */

/**
 * Chuẩn hóa `tags` của MỘT bài: chấp nhận array hoặc chuỗi "a, b".
 * Trim, bỏ rỗng, bỏ trùng không phân biệt hoa thường (giữ cách viết đầu tiên).
 */
export function normalizeTagInput(input: unknown): { tags: string[]; invalid: boolean } {
  if (input === undefined || input === null || input === '') return { tags: [], invalid: false };

  let items: unknown[];
  let invalid = false;
  // Phần tử mảng cũng được tách theo dấu phẩy: Sveltia CMS lưu lại `tags: "a, b"` thành `["a, b"]`.
  const split = (s: string) => s.split(/[,;\n]/);
  if (Array.isArray(input)) items = input.flatMap((v) => (typeof v === 'string' ? split(v) : [v]));
  else if (typeof input === 'string') items = split(input);
  else if (typeof input === 'number') items = [input];
  else return { tags: [], invalid: true };

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string' && typeof item !== 'number') {
      if (item !== null && item !== undefined) invalid = true;
      continue;
    }
    const tag = String(item).trim().replace(/^#(?=\S)/, '').replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return { tags, invalid };
}

interface TaxonomyTerm {
  slug: string;
  /** Tên hiển thị: cách viết xuất hiện nhiều nhất. */
  name: string;
  /** Mọi cách viết đã gặp (để map ngược từ giá trị trong bài). */
  variants: string[];
  count: number;
}

export interface Taxonomy {
  terms: TaxonomyTerm[];
  /** Map từ cách viết gốc (đã trim) → slug. */
  slugOf: (value: string) => string;
  bySlug: Map<string, TaxonomyTerm>;
  /** Thông báo khi hai giá trị khác nhau cho ra cùng slug. */
  warnings: string[];
}

/**
 * Xây taxonomy toàn cục từ danh sách giá trị (mỗi phần tử là giá trị trong một bài).
 * - Gộp theo slug (nên "SQLi" và "sqli" là một).
 * - Tên hiển thị = cách viết xuất hiện nhiều nhất (hòa thì lấy cách gặp trước).
 * - Hai giá trị khác nhau (không chỉ khác hoa/thường) ra cùng slug → warning + gộp.
 */
export function buildTaxonomy(values: Iterable<string>, kind: string): Taxonomy {
  const bySlugCounts = new Map<string, Map<string, number>>();
  const order: string[] = [];

  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const slug = slugifyOrHash(value, kind);
    let counts = bySlugCounts.get(slug);
    if (!counts) {
      counts = new Map();
      bySlugCounts.set(slug, counts);
      order.push(slug);
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const warnings: string[] = [];
  const bySlug = new Map<string, TaxonomyTerm>();
  const variantToSlug = new Map<string, string>();

  for (const slug of order) {
    const counts = bySlugCounts.get(slug)!;
    let name = '';
    let best = -1;
    let count = 0;
    for (const [variant, n] of counts) {
      count += n;
      if (n > best) {
        best = n;
        name = variant;
      }
      variantToSlug.set(variant, slug);
    }
    const distinct = new Set([...counts.keys()].map((v) => v.toLowerCase()));
    if (distinct.size > 1) {
      warnings.push(
        `[content] ${kind} values ${[...counts.keys()].map((v) => JSON.stringify(v)).join(', ')} share slug "${slug}" — merged as ${JSON.stringify(name)}`,
      );
    }
    bySlug.set(slug, { slug, name, variants: [...counts.keys()], count });
  }

  return {
    terms: [...bySlug.values()],
    bySlug,
    slugOf: (value: string) => variantToSlug.get(value.trim()) ?? slugifyOrHash(value.trim(), kind),
    warnings,
  };
}
