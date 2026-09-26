/**
 * Nền low-poly tự tạo lúc build (mục 45): lưới điểm jitter → tam giác,
 * màu nội suy theo gradient tím → hồng → vàng nhạt. Không dùng ảnh bên ngoài.
 * Deterministic (PRNG có seed) nên output ổn định giữa các build.
 */

type RGB = [number, number, number];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Gradient theo vị trí (0..1): tím đậm → tím → hồng → vàng nhạt (góc dưới phải). */
const STOPS: Array<[number, RGB]> = [
  [0, [26, 16, 40]],
  [0.35, [72, 40, 92]],
  [0.65, [150, 72, 128]],
  [0.85, [196, 118, 140]],
  [1, [232, 196, 150]],
];

function gradient(t: number): RGB {
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i]!;
    const [p0, c0] = STOPS[i - 1]!;
    if (t <= p1) return mix(c0, c1, (t - p0) / (p1 - p0));
  }
  return STOPS.at(-1)![1];
}

export interface BackgroundOptions {
  width?: number;
  height?: number;
  cols?: number;
  rows?: number;
  seed?: number;
}

export function generateLowPolySvg({ width = 1600, height = 1000, cols = 14, rows = 9, seed = 1337 }: BackgroundOptions = {}): string {
  const rand = mulberry32(seed);
  const cw = width / cols;
  const ch = height / rows;
  const pts: Array<Array<[number, number]>> = [];
  for (let r = 0; r <= rows; r++) {
    const row: Array<[number, number]> = [];
    for (let c = 0; c <= cols; c++) {
      const edgeX = c === 0 || c === cols;
      const edgeY = r === 0 || r === rows;
      const x = c * cw + (edgeX ? 0 : (rand() - 0.5) * cw * 0.8);
      const y = r * ch + (edgeY ? 0 : (rand() - 0.5) * ch * 0.8);
      row.push([Math.round(x), Math.round(y)]);
    }
    pts.push(row);
  }

  const polys: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = pts[r]![c]!;
      const b = pts[r]![c + 1]!;
      const d = pts[r + 1]![c]!;
      const e = pts[r + 1]![c + 1]!;
      const tris = rand() > 0.5 ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]];
      for (const tri of tris) {
        const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3;
        const cy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3;
        // Hướng gradient: từ góc trên trái (tối) sang góc dưới phải (sáng), cộng nhiễu nhẹ.
        const t = Math.max(0, Math.min(1, (cx / width) * 0.55 + (cy / height) * 0.45 + (rand() - 0.5) * 0.16));
        const shade = 0.88 + rand() * 0.2;
        const [R, G, B] = gradient(t);
        polys.push(`<path d="M${tri.map((p) => p.join(' ')).join('L')}Z" fill="${hex([R * shade, G * shade, B * shade])}"/>`);
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">` +
    polys.join('') +
    '</svg>'
  );
}
