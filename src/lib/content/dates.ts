/**
 * Ngày giờ (mục 66.5-F): mọi ngày trong frontmatter được hiểu theo múi giờ
 * Asia/Ho_Chi_Minh (UTC+7, không có DST). Hiển thị cũng luôn dùng múi giờ này,
 * nên kết quả không phụ thuộc múi giờ của máy build.
 */

const SITE_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const SITE_OFFSET = '+07:00';

const pad = (n: number) => String(n).padStart(2, '0');

function isValidYmd(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Parse giá trị `date` trong frontmatter. Trả về `null` nếu không hợp lệ.
 *
 * Chấp nhận:
 * - `2026-09-25` (ngày theo giờ Việt Nam);
 * - `2026-09-25 14:30`, `2026-09-25T14:30:00` (giờ Việt Nam nếu không ghi múi giờ);
 * - ISO có múi giờ, ví dụ `2026-09-25T14:30:00Z`;
 * - `25/09/2026`, `25-09-2026`, `25.09.2026` (ngày/tháng/năm);
 * - Date object (phòng khi YAML parser trả về Date — hiểu là ngày UTC ghi trong file).
 */
export function parseSiteDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // YAML timestamp `2026-09-25` → 2026-09-25T00:00Z: giữ nguyên ngày/giờ ghi trong file.
    const iso =
      `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}` +
      `T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
    return parseSiteDate(iso);
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (m) {
    const [, y, mo, d, hh = '0', mi = '0', ss = '0', zone] = m;
    if (!isValidYmd(+y!, +mo!, +d!) || +hh > 23 || +mi > 59 || +ss > 59) return null;
    let offset = SITE_OFFSET;
    if (zone) offset = zone.toUpperCase() === 'Z' ? 'Z' : zone.includes(':') ? zone : `${zone.slice(0, 3)}:${zone.slice(3)}`;
    const date = new Date(`${y}-${pad(+mo!)}-${pad(+d!)}T${pad(+hh)}:${pad(+mi)}:${pad(+ss)}${offset}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const [, d, mo, y] = m;
    if (!isValidYmd(+y!, +mo!, +d!)) return null;
    return new Date(`${y}-${pad(+mo!)}-${pad(+d!)}T00:00:00${SITE_OFFSET}`);
  }
  return null;
}

const displayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SITE_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `25/09/2026` theo giờ Việt Nam. */
export function formatDisplayDate(date: Date): string {
  return displayFormatter.format(date);
}

/** `2026-09-25` theo giờ Việt Nam (dùng cho `<time datetime>`). */
export function formatIsoDate(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: SITE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}
