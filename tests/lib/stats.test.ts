import { describe, expect, it } from 'vitest';
import { activityGrid, webRank } from '../../src/lib/stats';

describe('webRank', () => {
  it('sums difficulty points, counts unrated posts as solved, and finds tier progress', () => {
    const rank = webRank(['easy', 'medium', 'hard', 'hard', '']);
    expect(rank.score).toBe(1350);
    expect(rank.solved).toBe(5);
    expect(rank.byDifficulty).toEqual({ easy: 1, medium: 1, hard: 2, insane: 0 });
    expect(rank.tier.name).toBe('Silver');
    expect(rank.next?.name).toBe('Gold');
    expect(rank.progress).toBeCloseTo(350 / 2000);
  });

  it('starts at Bronze and caps progress at the top tier', () => {
    expect(webRank([]).tier.name).toBe('Bronze');
    const top = webRank(Array(16).fill('insane'));
    expect(top.tier.name).toBe('Master');
    expect(top.next).toBeUndefined();
    expect(top.progress).toBe(1);
  });
});

describe('activityGrid', () => {
  // 2026-10-26 là thứ Hai.
  it('ends the last Monday-first column at today and counts posts per day', () => {
    const { columns, total, longest } = activityGrid(['2026-10-24', '2026-10-25', '2026-10-25', '2026-10-26', '2025-01-01'], '2026-10-26', 2);
    expect(columns).toHaveLength(2);
    expect(columns[0]![0]!.iso).toBe('2026-10-19');
    expect(columns[0]![6]).toEqual({ iso: '2026-10-25', count: 2 });
    expect(columns[1]).toEqual([{ iso: '2026-10-26', count: 1 }]);
    expect(total).toBe(4);
    expect(longest).toBe(3);
  });

  it('handles a Sunday today', () => {
    const { columns } = activityGrid([], '2026-10-25', 1);
    expect(columns[0]!.map((d) => d.iso)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });
});
