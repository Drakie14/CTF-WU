import { describe, expect, it } from 'vitest';
import { dreamhackChallengeId, dreamhackDifficulty, dreamhackProxy } from '../../src/lib/dreamhack';

describe('dreamhack', () => {
  it('takes the first challenge link in the write-up', () => {
    expect(dreamhackChallengeId('## Đề bài\nhttps://dreamhack.io/wargame/challenges/1151\n…/challenges/9')).toBe('1151');
    expect(dreamhackChallengeId('https://dreamhack.io/lecture/courses/1')).toBeUndefined();
  });

  it('maps the tier to the blog scale and leaves unrated challenges empty', () => {
    expect(dreamhackDifficulty({ tier: 3, tier_display: 'Bronze 3' })).toBe('Bronze 3');
    expect(dreamhackDifficulty({ tier: 6 })).toBe('Silver 4');
    expect(dreamhackDifficulty({ tier: 1 })).toBe('Sprout');
    expect(dreamhackDifficulty({ tier: 0, tier_display: 'Unrated' })).toBeUndefined();
  });

  it('proxies only numeric IDs to the fixed host and returns just the public fields', async () => {
    const urls: string[] = [];
    const impl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ title: 'BypassIF', tier: 3, tier_display: 'Bronze 3', description: 'x' }));
    }) as unknown as typeof fetch;
    expect((await dreamhackProxy('../evil', impl)).status).toBe(400);
    const reply = await dreamhackProxy('1151', impl);
    expect(urls).toEqual(['https://dreamhack.io/api/v1/wargame/challenges/1151/']);
    expect(await reply.json()).toEqual({ title: 'BypassIF', difficulty: 'Bronze 3' });
  });
});
