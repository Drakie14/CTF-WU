import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { generateLowPolySvg } from '../lib/background';

/** `/og.png` — ảnh Open Graph mặc định 1200×630, render từ nền low-poly lúc build. */
export const GET: APIRoute = async () => {
  const svg = generateLowPolySvg({ width: 1200, height: 630, cols: 12, rows: 7 });
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
