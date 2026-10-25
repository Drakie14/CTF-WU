import { describe, expect, it } from 'vitest';
import { activityGrid, difficultyPoints, RANKS, webRank } from '../../src/lib/stats';

describe('difficultyPoints', () => {
  it('matches the per-challenge points measured on Dreamhack', () => {
    expect(difficultyPoints('Sprout')).toBe(12);
    expect(difficultyPoints('Bronze 4')).toBe(14);
    expect(difficultyPoints('Bronze 1')).toBe(25);
    expect(difficultyPoints('Silver 4')).toBe(30);
    expect(difficultyPoints('Silver 1')).toBe(52);
    expect(difficultyPoints('Gold 3')).toBe(74);
  });
});

describe('webRank', () => {
  it('sums points, counts unrated posts as solved, and finds rank progress', () => {
    const rank = webRank(['Bronze 4', 'Silver 1', 'Gold 3', 'Gold 3', '']);
    expect(rank.score).toBe(14 + 52 + 74 + 74);
    expect(rank.solved).toBe(5);
    expect(rank.byFamily).toMatchObject({ Bronze: 1, Silver: 1, Gold: 2, Sprout: 0 });
    expect(rank.rank.name).toBe('Silver 4');
    expect(rank.next?.name).toBe('Silver 3');
    expect(rank.progress).toBeCloseTo((214 - 150) / (220 - 150));
  });

  it('has 4 ranks per tier, starts at Bronze 4 and caps progress at Master 1', () => {
    expect(RANKS).toHaveLength(24);
    expect(RANKS.slice(0, 5).map((r) => r.name)).toEqual(['Bronze 4', 'Bronze 3', 'Bronze 2', 'Bronze 1', 'Silver 4']);
    expect(webRank([]).rank.name).toBe('Bronze 4');
    const top = webRank(Array(40).fill('Master 1'));
    expect(top.rank.name).toBe('Master 1');
    expect(top.next).toBeUndefined();
    expect(top.progress).toBe(1);
  });
});

describe('activityGrid', () => {
  const at = (iso: string, title = iso) => ({ iso, title });
  // 2026-10-26 là thứ Hai.
  it('ends the last Monday-first column at today and groups posts per day', () => {
    const { columns, total, longest } = activityGrid([at('2026-10-24'), at('2026-10-25', 'a'), at('2026-10-25', 'b'), at('2026-10-26'), at('2025-01-01')], '2026-10-26', 2);
    expect(columns).toHaveLength(2);
    expect(columns[0]![0]!.iso).toBe('2026-10-19');
    expect(columns[0]![6]!.items.map((p) => p.title)).toEqual(['a', 'b']);
    expect(columns[1]).toEqual([{ iso: '2026-10-26', items: [at('2026-10-26')] }]);
    expect(total).toBe(4);
    expect(longest).toBe(3);
  });

  it('handles a Sunday today', () => {
    const { columns } = activityGrid([], '2026-10-25', 1);
    expect(columns[0]!.map((d) => d.iso)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });
});
