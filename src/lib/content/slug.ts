/**
 * Slug helpers dùng chung cho bài viết, tag, CTF và category.
 *
 * Quy tắc (mục 16 + 66.5-A):
 * - lowercase, bỏ dấu tiếng Việt (kể cả "đ" → "d");
 * - một số ký tự đặc biệt được chuyển có nghĩa: "c++" → "cpp", "c#" → "csharp", ...;
 * - khoảng trắng và ký tự không hợp lệ → "-";
 * - gộp nhiều "-" liên tiếp, bỏ "-" ở đầu/cuối.
 */

/** Các thay thế "có nghĩa" áp dụng trước khi bỏ ký tự đặc biệt. Thứ tự quan trọng. */
const MEANINGFUL_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/c\+\+/g, 'cpp'],
  [/c#/g, 'csharp'],
  [/f#/g, 'fsharp'],
  [/\.net\b/g, 'dotnet'],
  [/&/g, ' and '],
  [/\+/g, ' plus '],
  [/@/g, ' at '],
];

/** Bỏ dấu (NFD + xóa combining marks) và xử lý riêng đ/Đ. */
function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Slug hóa một chuỗi bất kỳ. Trả về chuỗi rỗng nếu không còn ký tự hợp lệ nào;
 * dùng {@link slugifyOrHash} nếu cần luôn có slug.
 */
export function slugify(input: string): string {
  let s = stripDiacritics(String(input)).toLowerCase().trim();
  for (const [pattern, replacement] of MEANINGFUL_REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }
  return s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/** FNV-1a 32-bit, đủ để tạo hậu tố ổn định cho chuỗi không slug hóa được. */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (const ch of input) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Như {@link slugify} nhưng luôn trả về slug không rỗng (ví dụ tag toàn ký tự CJK). */
export function slugifyOrHash(input: string, prefix = 'x'): string {
  const s = slugify(input);
  return s || `${prefix}-${shortHash(String(input))}`;
}
