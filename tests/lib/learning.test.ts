import { describe, expect, it } from 'vitest';
import { TRACKS, journeyLayout, learningStages } from '../../src/lib/learning';

const post = (id: string, tags: string[], difficulty = '', date = '2026-01-01') => ({ id, data: { tags, difficulty, date: new Date(date) } });

describe('learningStages', () => {
  it('đưa một bài vào các kỹ thuật liên quan, không lặp trong cùng chặng', () => {
    const guide = post('guide', ['Reflected XSS', 'Stored XSS']);
    const stages = learningStages(TRACKS[0], [guide, post('unrelated', ['SQL Injection'])]);
    expect(stages.find(s => s.id === 'xss-stage-1')!.posts).toEqual([guide]);
    expect(stages.find(s => s.id === 'xss-reflected')!.posts).toEqual([guide]);
    expect(stages.find(s => s.id === 'xss-stored')!.posts).toEqual([guide]);
    expect(stages.find(s => s.id === 'xss-stage-2')!.posts).toEqual([]);
  });
  it('sắp theo tier, ngày và đưa bài thiếu tier xuống cuối', () => {
    const stages = learningStages(TRACKS[0], [
      post('unknown', ['Filter Bypass']), post('silver', ['Filter Bypass'], 'Silver 4'),
      post('newer', ['filter-bypass'], 'Bronze 4', '2026-02-01'), post('older', ['Filter Bypass'], 'Bronze 4'),
    ]);
    expect(stages.find(s => s.id === 'xss-stage-2')!.posts.map(p => p.id)).toEqual(['older', 'newer', 'silver', 'unknown']);
  });
  it('giữ các anchor cũ và bảo đảm mọi điểm có ID duy nhất', () => {
    const ids = TRACKS.flatMap(t => t.stages.map(s => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const track of TRACKS) for (const n of [1, 2]) expect(ids).toContain(`${track.id}-stage-${n}`);
  });
});

describe('journeyLayout', () => {
  it.each([7, 8, 12])('đặt %i điểm trong khung, nối cả đoạn thẳng và khúc cua', count => {
    const layout = journeyLayout(count);
    expect(layout.points).toHaveLength(count);
    expect(new Set(layout.points.map(p => `${p.x},${p.y}`)).size).toBe(count);
    expect(layout.points.every(p => p.x > 40 && p.x < 560 && p.y > 0 && p.y + 70 < layout.height)).toBe(true);
    expect(layout.path).toContain('H ');
    expect(layout.path).toContain('C ');
  });
  it('không tạo đường giả nếu không có điểm dừng', () => {
    expect(journeyLayout(0).points).toEqual([]);
    expect(journeyLayout(0).path).toBe('');
  });
});
