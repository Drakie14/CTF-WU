/** Category hợp lệ (mục 9). Không phân biệt hoa thường. */
export const CATEGORIES = ['web', 'pwn', 'crypto', 'rev', 'forensics', 'misc', 'osint', 'mobile', 'cloud'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Một vài cách viết phổ biến được map về category chuẩn. */
const CATEGORY_ALIASES: Readonly<Record<string, Category>> = {
  reverse: 'rev',
  reversing: 'rev',
  're': 'rev',
  forensic: 'forensics',
  binary: 'pwn',
  cryptography: 'crypto',
};

/** Bậc độ khó kiểu Dreamhack: Sprout rồi mỗi bậc chia 4 → 1 (số nhỏ hơn là khó hơn). */
export const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'] as const;
export type TierName = (typeof TIER_NAMES)[number];
export type Difficulty = 'Sprout' | `${TierName} ${1 | 2 | 3 | 4}`;
/** Từ dễ đến khó; vị trí + 1 là số tier của Dreamhack (Sprout = 1, Master 1 = 25). */
export const DIFFICULTIES = ['Sprout', ...TIER_NAMES.flatMap((t) => ([4, 3, 2, 1] as const).map((n) => `${t} ${n}` as const))] as [Difficulty, ...Difficulty[]];

/** "gold 2", "Gold-2", "GOLD2" → "Gold 2"; không khớp → `undefined`. */
export function toDifficulty(input: string): Difficulty | undefined {
  const m = /^([a-z]+)[\s_-]*([1-4])?$/.exec(input.trim().toLowerCase());
  if (!m) return undefined;
  const label = `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)}${m[2] ? ` ${m[2]}` : ''}`;
  return (DIFFICULTIES as readonly string[]).includes(label) ? (label as Difficulty) : undefined;
}

/** Họ của độ khó ("Gold 2" → "gold"), dùng cho class màu `diff-*`. */
export const difficultyFamily = (d: string) => d.split(' ')[0]!.toLowerCase();

/** Chuỗi bất kỳ ("Web ", "WEB", "Reversing"…) → category chuẩn, hoặc `undefined` nếu không khớp. */
export function toCategory(input: string): Category | undefined {
  const c = input.trim().toLowerCase();
  return (CATEGORIES as readonly string[]).includes(c) ? (c as Category) : CATEGORY_ALIASES[c];
}
