import type { Difficulty } from './content/constants';

/** Điểm mỗi bài web theo độ khó; bài chưa ghi độ khó vẫn tính là đã giải nhưng không có điểm. */
export const DIFFICULTY_POINTS: Record<Difficulty, number> = { easy: 100, medium: 250, hard: 500, insane: 1000 };

/** Bậc rank (kiểu Dreamhack), tăng dần theo điểm tối thiểu. */
export const TIERS = [
  { name: 'Bronze', min: 0, color: '#d6a274' },
  { name: 'Silver', min: 1000, color: '#cbd5e1' },
  { name: 'Gold', min: 3000, color: '#fcd34d' },
  { name: 'Platinum', min: 6000, color: '#5eead4' },
  { name: 'Diamond', min: 10000, color: '#7dd3fc' },
  { name: 'Master', min: 16000, color: '#f472b6' },
] as const;

export type Tier = (typeof TIERS)[number];

export interface WebRank {
  score: number;
  solved: number;
  byDifficulty: Record<Difficulty, number>;
  tier: Tier;
  next: Tier | undefined;
  /** 0..1, tiến độ từ bậc hiện tại tới bậc kế (1 khi đã ở bậc cao nhất). */
  progress: number;
}

export function webRank(difficulties: Array<Difficulty | ''>): WebRank {
  const byDifficulty: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, insane: 0 };
  let score = 0;
  for (const d of difficulties) {
    if (!d) continue;
    byDifficulty[d]++;
    score += DIFFICULTY_POINTS[d];
  }
  const index = TIERS.findLastIndex((t) => score >= t.min);
  const tier = TIERS[index]!;
  const next = TIERS[index + 1];
  return { score, solved: difficulties.length, byDifficulty, tier, next, progress: next ? (score - tier.min) / (next.min - tier.min) : 1 };
}

export interface ActivityDay {
  iso: string;
  count: number;
}

const DAY = 86_400_000;
const isoOf = (time: number) => new Date(time).toISOString().slice(0, 10);

/**
 * Lưới kiểu GitHub contribution: `weeks` cột (tuần bắt đầu thứ Hai), cột cuối chứa `todayIso`; ngày sau
 * hôm nay không có trong cột cuối. Ngày được tính theo lịch (`YYYY-MM-DD` đã quy về giờ Việt Nam).
 */
export function activityGrid(isoDates: string[], todayIso: string, weeks = 53) {
  const counts = new Map<string, number>();
  for (const iso of isoDates) counts.set(iso, (counts.get(iso) ?? 0) + 1);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  const start = monday - (weeks - 1) * 7 * DAY;
  const columns: ActivityDay[][] = [];
  let total = 0, longest = 0, run = 0;
  for (let time = start; time <= today; time += DAY) {
    const iso = isoOf(time);
    const count = counts.get(iso) ?? 0;
    if ((time - start) % (7 * DAY) === 0) columns.push([]);
    columns.at(-1)!.push({ iso, count });
    total += count;
    run = count ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { columns, total, longest };
}
