/** Category hợp lệ (mục 9). Không phân biệt hoa thường. */
export const CATEGORIES = ['web', 'pwn', 'crypto', 'rev', 'forensics', 'misc', 'osint', 'mobile', 'cloud'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Một vài cách viết phổ biến được map về category chuẩn. */
export const CATEGORY_ALIASES: Readonly<Record<string, Category>> = {
  reverse: 'rev',
  reversing: 'rev',
  're': 'rev',
  forensic: 'forensics',
  binary: 'pwn',
  cryptography: 'crypto',
};

export const DIFFICULTIES = ['easy', 'medium', 'hard', 'insane'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
