import { DIFFICULTIES, TIER_NAMES, type Difficulty, type TierName } from './content/constants';

/**
 * Điểm một bài theo cách Dreamhack chấm: round(10 · 1.2^tier), tier = 1 (Sprout) … 25 (Master 1).
 * Khớp các mức đo từ API Dreamhack: Sprout 12, Bronze 4 14, Bronze 1 25, Silver 4 30, Gold 3 74.
 */
export const difficultyPoints = (d: Difficulty) => Math.round(10 * 1.2 ** (DIFFICULTIES.indexOf(d) + 1));

export type Family = 'Sprout' | TierName;

export const FAMILY_COLORS: Record<Family, string> = {
  Sprout: '#86efac',
  Bronze: '#d6a274',
  Silver: '#cbd5e1',
  Gold: '#fcd34d',
  Platinum: '#5eead4',
  Diamond: '#7dd3fc',
  Master: '#f472b6',
};

/**
 * Điểm tối thiểu của từng rank nhỏ (4 → 1). Dreamhack không có bậc người chơi theo điểm wargame nên
 * ngưỡng này tự đặt: top ~1% web của Dreamhack (~3,300 pts) rơi vào Diamond, top 1 (~13,000) là Master 1.
 */
const RANK_MINS: Record<TierName, readonly [number, number, number, number]> = {
  Bronze: [0, 30, 60, 100],
  Silver: [150, 220, 300, 400],
  Gold: [500, 650, 800, 1000],
  Platinum: [1200, 1450, 1700, 2000],
  Diamond: [2400, 2900, 3400, 4000],
  Master: [5000, 6500, 8000, 10000],
};

export interface Rank {
  name: string;
  family: TierName;
  min: number;
  color: string;
}

export const RANKS: Rank[] = TIER_NAMES.flatMap((family) =>
  RANK_MINS[family].map((min, i) => ({ name: `${family} ${4 - i}`, family, min, color: FAMILY_COLORS[family] })),
);

export interface WebRank {
  score: number;
  solved: number;
  byFamily: Record<Family, number>;
  rank: Rank;
  next: Rank | undefined;
  /** 0..1, tiến độ từ rank hiện tại tới rank kế (1 khi đã ở rank cao nhất). */
  progress: number;
}

/** Bài chưa ghi độ khó vẫn tính là đã giải nhưng không có điểm. */
export function webRank(difficulties: Array<Difficulty | ''>): WebRank {
  const byFamily = Object.fromEntries(Object.keys(FAMILY_COLORS).map((f) => [f, 0])) as Record<Family, number>;
  let score = 0;
  for (const d of difficulties) {
    if (!d) continue;
    byFamily[d.split(' ')[0] as Family]++;
    score += difficultyPoints(d);
  }
  const index = RANKS.findLastIndex((r) => score >= r.min);
  const rank = RANKS[index]!;
  const next = RANKS[index + 1];
  return { score, solved: difficulties.length, byFamily, rank, next, progress: next ? (score - rank.min) / (next.min - rank.min) : 1 };
}

export interface ActivityDay<T> {
  iso: string;
  items: T[];
}

const DAY = 86_400_000;
const isoOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * Lưới kiểu GitHub contribution: `weeks` cột (tuần bắt đầu thứ Hai), cột cuối chứa `todayIso`; ngày sau
 * hôm nay không có trong cột cuối. Ngày được tính theo lịch (`YYYY-MM-DD` đã quy về giờ Việt Nam).
 */
export function activityGrid<T extends { iso: string }>(entries: T[], todayIso: string, weeks = 53) {
  const byDay = new Map<string, T[]>();
  for (const e of entries) byDay.set(e.iso, [...(byDay.get(e.iso) ?? []), e]);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  const start = monday - (weeks - 1) * 7 * DAY;
  const columns: ActivityDay<T>[][] = [];
  let total = 0, longest = 0, run = 0;
  for (let time = start; time <= today; time += DAY) {
    const iso = isoOf(time);
    const items = byDay.get(iso) ?? [];
    if ((time - start) % (7 * DAY) === 0) columns.push([]);
    columns.at(-1)!.push({ iso, items });
    total += items.length;
    run = items.length ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { columns, total, longest };
}
