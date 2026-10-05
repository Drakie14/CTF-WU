/**
 * Click chuột → bung một chùm hoa anh đào pixel art rồi rơi xuống.
 * Sprite vẽ bằng canvas thành data: URL (CSP cho phép img-src data:), phóng to bằng
 * `image-rendering: pixelated`. Vị trí được làm tròn theo lưới pixel và chạy ~24fps
 * để chuyển động có chất "giật" kiểu game 8-bit. Tắt khi người dùng bật reduced-motion.
 */

const PALETTE: Record<string, string> = {
  o: '#be185d', // viền
  r: '#9d174d', // tâm hoa
  d: '#ec4899', // gốc cánh
  p: '#f9a8d4',
  l: '#fcd5e5',
  w: '#fff7fa', // mép cánh sáng
  y: '#fde047', // nhụy
};

// Cánh anh đào: đầu có khía chữ V, thuôn dần về gốc hồng đậm.
const SPRITES: string[][] = [
  // bông hoa 5 cánh
  [
    '....oo.oo....',
    '...owlolwo...',
    '.o.olllllo.o.',
    'owo.olplo.owo',
    'olloopdpoollo',
    'ollppdydppllo',
    '.oppdyrydppo.',
    '..oopdddpoo..',
    '...olppplo...',
    '..olpoooplo..',
    '..owlo.olwo..',
    '..ooo...ooo..',
  ],
  // cánh rời
  ['.oo.oo.', 'owwowwo', 'owllllo', 'olllllo', 'olllllo', '.olllo.', '.olplo.', '..opo..', '..odo..', '...o...'],
  // cánh nghiêng
  ['...oo.oo', '..owwowo', '.owlllwo', '.olllllo', 'olllllo.', 'ollllo..', 'olppo...', 'opdo....', 'oo......'],
  // cánh nhỏ
  ['oo.oo', 'owowo', 'olllo', 'olllo', '.opo.', '.odo.', '..o..'],
];
// Tỉ lệ xuất hiện: cánh rời nhiều hơn bông hoa nguyên.
const WEIGHTS = [1, 3, 3, 2];

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
  flipEvery: number;
}

const petals: Petal[] = [];
let urls: string[] | null = null;
let rafId = 0;
let last = 0;
let acc = 0;

function spriteUrls(): string[] {
  if (urls) return urls;
  urls = SPRITES.map((rows) => {
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
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let n = Math.random() * total;
  for (let i = 0; i < WEIGHTS.length; i++) {
    n -= WEIGHTS[i];
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
    const rows = SPRITES[idx];
    const scale = Math.random() < 0.35 ? PIXEL + 1 : PIXEL;
    const el = document.createElement('div');
    el.className = 'sakura-petal';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = `${rows[0].length * scale}px`;
    el.style.height = `${rows.length * scale}px`;
    el.style.backgroundImage = `url(${sprites[idx]})`;
    el.style.backgroundSize = '100% 100%';
    document.body.append(el);

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 80 + Math.random() * 130;
    petals.push({
      el,
      x: cx - (rows[0].length * scale) / 2,
      y: cy - (rows.length * scale) / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      phase: Math.random() * Math.PI * 2,
      sway: 25 + Math.random() * 35,
      age: 0,
      life: 2.2 + Math.random() * 1.2,
      flipEvery: 0.18 + Math.random() * 0.25,
    });
  }
  if (!rafId) {
    last = performance.now();
    acc = 0;
    rafId = requestAnimationFrame(tick);
  }
}

function tick(now: number): void {
  acc += Math.min(now - last, 100);
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
      // Lật ngang theo bước để giả lập cánh hoa xoay — giữ nguyên lưới pixel, không rotate.
      const flip = Math.floor(p.age / p.flipEvery) % 2 === 0 ? 1 : -1;
      const remain = p.life - p.age;
      const opacity = remain > 0.75 ? 1 : remain > 0.4 ? 0.66 : 0.33;
      p.el.style.transform = `translate(${snap(p.x + swayX)}px, ${snap(p.y)}px) scaleX(${flip})`;
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
