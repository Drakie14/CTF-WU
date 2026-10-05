/**
 * Click chuột → bung một chùm hoa anh đào pixel art rồi rơi xuống.
 * Sprite vẽ bằng canvas thành data: URL (CSP cho phép img-src data:), phóng to bằng
 * `image-rendering: pixelated`. Cánh hoa nằm trong `.sakura-layer` (transition:persist) nên vẫn
 * rơi tiếp khi chuyển trang bằng View Transitions. Vị trí được làm tròn theo lưới pixel và chạy ~24fps
 * để chuyển động có chất "giật" kiểu game 8-bit. Tắt khi người dùng bật reduced-motion.
 */

// Phong cách "sakura pixel": không viền, hồng phấn phẳng, đối xứng 4 phía, nhụy vàng/xanh lá.
const PALETTE: Record<string, string> = {
  w: '#fff4f6',
  l: '#fbd0da',
  p: '#f6a5b8',
  m: '#f0809c',
  d: '#e8466d',
  y: '#f6c142',
  g: '#9ccb8f',
};

/** Chỉ vẽ góc trên-trái (đối xứng qua đường chéo) rồi lật ra 4 phía. */
function mirror(quarter: string[]): string[] {
  const rows = quarter.map((r) => r + [...r.slice(0, -1)].reverse().join(''));
  return [...rows, ...rows.slice(0, -1).reverse()];
}

interface Sprite {
  rows: string[];
  /** Hệ số phóng so với PIXEL (đốm nhỏ vẽ 3×3 nên phóng to hơn). */
  zoom: number;
  weight: number;
}

const SPRITES: Sprite[] = [
  // bông tròn, tâm trắng
  { rows: mirror(['...dmm', '.dmppp', '.mppll', 'dppllw', 'mpllww', 'mplwww']), zoom: 1, weight: 1 },
  // bông 4 cánh khía, nhụy vàng
  { rows: mirror(['...dd.', '..dmpm', '.dppll', 'dmpmlw', 'dpllww', '.mlwwy']), zoom: 1, weight: 2 },
  // bông 4 cánh chéo
  { rows: mirror(['.ll...', 'lwlp..', 'llpm..', '.pmdd.', '...dpw', '....wy']), zoom: 1, weight: 2 },
  // bông nhỏ
  { rows: mirror(['..dp', '.dpl', 'dplw', 'plwy']), zoom: 1, weight: 3 },
  // đốm lấp lánh
  { rows: ['plp', 'lyl', 'plp'], zoom: 2, weight: 2 },
  { rows: ['.p.', 'pgp', '.p.'], zoom: 2, weight: 2 },
  { rows: ['m.m', '.l.', 'm.m'], zoom: 2, weight: 2 },
];

const PIXEL = 2; // 1 pixel sprite = 2px màn hình
const MAX_PETALS = 140;
const FRAME_MS = 1000 / 24;

interface Petal {
  el: HTMLDivElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  sway: number;
  age: number;
  life: number;
}

const petals: Petal[] = [];
let urls: string[] | null = null;
let rafId = 0;
let last = 0;
let acc = 0;

function spriteUrls(): string[] {
  if (urls) return urls;
  urls = SPRITES.map(({ rows }) => {
    const canvas = document.createElement('canvas');
    canvas.width = rows[0].length;
    canvas.height = rows.length;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const color = PALETTE[ch];
        if (!color) return;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      });
    });
    return canvas.toDataURL('image/png');
  });
  return urls;
}

function pickSprite(): number {
  const total = SPRITES.reduce((a, b) => a + b.weight, 0);
  let n = Math.random() * total;
  for (let i = 0; i < SPRITES.length; i++) {
    n -= SPRITES[i].weight;
    if (n < 0) return i;
  }
  return 0;
}

function snap(v: number): number {
  return Math.round(v / PIXEL) * PIXEL;
}

function spawn(cx: number, cy: number): void {
  const sprites = spriteUrls();
  const count = 10 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    if (petals.length >= MAX_PETALS) petals.shift()?.el.remove();
    const idx = pickSprite();
    const { rows, zoom } = SPRITES[idx];
    const scale = (Math.random() < 0.35 ? PIXEL + 1 : PIXEL) * zoom;
    const el = document.createElement('div');
    el.className = 'sakura-petal';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = `${rows[0].length * scale}px`;
    el.style.height = `${rows.length * scale}px`;
    el.style.backgroundImage = `url(${sprites[idx]})`;
    el.style.backgroundSize = '100% 100%';
    const x = cx - (rows[0].length * scale) / 2;
    const y = cy - (rows.length * scale) / 2;
    // Đặt vị trí ngay khi tạo: nếu chờ tick() (~24fps) thì cánh hoa nằm ở góc trên-trái
    // (left/top = 0) trong vài chục ms → nháy ở góc màn hình khi click liên tục.
    el.style.transform = `translate(${snap(x)}px, ${snap(y)}px)`;
    (document.querySelector('.sakura-layer') ?? document.body).append(el);

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 80 + Math.random() * 130;
    petals.push({
      el,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      phase: Math.random() * Math.PI * 2,
      sway: 25 + Math.random() * 35,
      age: 0,
      life: 2.2 + Math.random() * 1.2,
    });
  }
  if (!rafId) {
    last = performance.now();
    acc = 0;
    rafId = requestAnimationFrame(tick);
  }
}

function tick(now: number): void {
  // Timestamp của rAF có thể sớm hơn performance.now() lúc spawn → kẹp về 0.
  acc += Math.max(0, Math.min(now - last, 100));
  last = now;
  if (acc >= FRAME_MS) {
    const dt = acc / 1000;
    acc = 0;
    for (let i = petals.length - 1; i >= 0; i--) {
      const p = petals[i];
      p.age += dt;
      if (p.age >= p.life || !p.el.isConnected) {
        p.el.remove();
        petals.splice(i, 1);
        continue;
      }
      // Bung lên rồi chậm dần, rơi với vận tốc giới hạn như cánh hoa thật.
      p.vx *= 0.9;
      p.vy = Math.min(p.vy + 320 * dt, 55);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const swayX = Math.sin(p.age * 2.4 + p.phase) * p.sway * Math.min(p.age, 1);
      const remain = p.life - p.age;
      const opacity = remain > 0.75 ? 1 : remain > 0.4 ? 0.66 : 0.33;
      p.el.style.transform = `translate(${snap(p.x + swayX)}px, ${snap(p.y)}px)`;
      p.el.style.opacity = String(opacity);
    }
  }
  rafId = petals.length ? requestAnimationFrame(tick) : 0;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.addEventListener('pointerdown', (event) => {
  if (reduceMotion.matches || event.button !== 0) return;
  spawn(event.clientX, event.clientY);
});
