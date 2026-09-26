import type { Category } from './content/constants';

/** Tên hiển thị + màu của từng category (dùng cho badge và tag pill). */
export const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  web: { label: 'Web', color: '#7dd3fc' },
  pwn: { label: 'Pwn', color: '#fca5a5' },
  crypto: { label: 'Crypto', color: '#c4b5fd' },
  rev: { label: 'Reverse', color: '#fdba74' },
  forensics: { label: 'Forensics', color: '#5eead4' },
  misc: { label: 'Misc', color: '#d8d0e6' },
  osint: { label: 'OSINT', color: '#f9a8d4' },
  mobile: { label: 'Mobile', color: '#a5b4fc' },
  cloud: { label: 'Cloud', color: '#93c5fd' },
};

/** Màu tag mặc định khi bài chưa có category. */
const DEFAULT_TAG_COLOR = '#86efac';

export function categoryColor(category: Category | ''): string {
  return category ? CATEGORY_META[category].color : DEFAULT_TAG_COLOR;
}

export function categoryLabel(category: Category | ''): string {
  return category ? CATEGORY_META[category].label : '';
}
