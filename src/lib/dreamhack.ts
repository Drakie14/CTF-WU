import { DIFFICULTIES, toDifficulty, type Difficulty } from './content/constants';

/** ID challenge Dreamhack đầu tiên trong bài (link đề thường nằm ở Đề bài, trước mọi link khác). */
export function dreamhackChallengeId(body: string): string | undefined {
  return /dreamhack\.io\/wargame\/challenges\/(\d{1,7})/.exec(body)?.[1];
}

/** Tier Dreamhack → thang của blog: `tier_display` ("Bronze 3"), dự phòng số `tier` (Sprout = 1). Unrated (0) thì `undefined`. */
export function dreamhackDifficulty(data: { tier?: unknown; tier_display?: unknown }): Difficulty | undefined {
  const named = typeof data.tier_display === 'string' ? toDifficulty(data.tier_display) : undefined;
  if (named) return named;
  return typeof data.tier === 'number' && Number.isInteger(data.tier) && data.tier >= 1 ? DIFFICULTIES[data.tier - 1] : undefined;
}

/**
 * Proxy dùng chung cho Pages Function và dev server: API Dreamhack không trả CORS nên trình duyệt không gọi thẳng được.
 * Host cố định, ID chỉ là số, chỉ trả vài field công khai.
 */
export async function dreamhackProxy(id: string, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': status === 200 ? 'public, max-age=86400' : 'no-store' } });
  if (!/^\d{1,7}$/.test(id)) return json(400, { error: 'ID không hợp lệ' });
  try {
    const upstream = await fetchImpl(`https://dreamhack.io/api/v1/wargame/challenges/${id}/`, { headers: { accept: 'application/json' } });
    if (!upstream.ok) return json(upstream.status === 404 ? 404 : 502, { error: `Dreamhack ${upstream.status}` });
    const data = (await upstream.json()) as { title?: unknown; tier?: unknown; tier_display?: unknown };
    return json(200, { title: typeof data.title === 'string' ? data.title : '', difficulty: dreamhackDifficulty(data) ?? null });
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : String(error) });
  }
}
