import type { APIRoute } from 'astro';
import { generateLowPolySvg } from '../lib/background';

/** `/bg.svg` — nền low-poly được sinh lúc build (static). */
export const GET: APIRoute = () =>
  new Response(generateLowPolySvg(), { headers: { 'Content-Type': 'image/svg+xml' } });
