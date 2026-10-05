/**
 * Con trỏ Reze cỡ lớn (80px ≈ Windows "size 4" = 32 + 3×16) vẽ bằng phần tử HTML bám theo chuột.
 * Không dùng `cursor: url()` ở cỡ này vì Chrome bỏ cursor tùy chỉnh > 32px khi chuột ở gần
 * mép cửa sổ. Khi bật, `html.reze-cursor-on` ẩn con trỏ thật; cursor CSS 32px trong global.css
 * vẫn là fallback cho màn cảm ứng / khi JS không chạy.
 * `.reze-cursor` được transition:persist (BaseLayout) nên không nháy khi chuyển trang.
 */

/** Cỡ hiển thị (CSS px). Ảnh gốc 128px (256px cho màn 2x), trình duyệt tự thu nhỏ. */
const SIZE = 80;
const SCALE = SIZE / 128;

type Kind = 'normal' | 'link' | 'text';

// Hotspot theo khung 128px trong file .cur gốc (nhân SCALE khi vẽ).
const KINDS: Record<Kind, { src: string; src2x: string; hx: number; hy: number }> = {
  normal: { src: '/cursors/reze-128.png', src2x: '/cursors/reze-256.png', hx: 5, hy: 4 },
  link: { src: '/cursors/reze-link-128.png', src2x: '/cursors/reze-link-256.png', hx: 5, hy: 4 },
  text: { src: '/cursors/reze-text-128.png', src2x: '/cursors/reze-text-256.png', hx: 17, hy: 20 },
};

const LINK_SELECTOR = 'a[href], button, summary, select, label[for], [role="button"], .rbar-thumb';
const TEXT_SELECTOR =
  'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"]), textarea, [contenteditable="true"]';

const mousePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
let kind: Kind = 'normal';
let x = -999;
let y = -999;

function root(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('.reze-cursor');
  if (el && !el.childElementCount) {
    for (const [name, k] of Object.entries(KINDS)) {
      const img = document.createElement('img');
      img.src = k.src;
      img.srcset = `${k.src} 1x, ${k.src2x} 2x`;
      img.width = 128;
      img.height = 128;
      img.alt = '';
      img.decoding = 'async';
      img.dataset.kind = name;
      el.append(img);
    }
  }
  return el;
}

function kindOf(target: EventTarget | null): Kind {
  if (!(target instanceof Element)) return 'normal';
  if (target.closest(TEXT_SELECTOR)) return 'text';
  if (target.closest(LINK_SELECTOR)) return 'link';
  return 'normal';
}

function render(): void {
  const el = root();
  if (!el) return;
  const k = KINDS[kind];
  el.dataset.kind = kind;
  el.style.transform = `translate(${x - k.hx * SCALE}px, ${y - k.hy * SCALE}px)`;
}

function show(on: boolean): void {
  document.documentElement.classList.toggle('reze-cursor-on', on);
}

document.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse' || !mousePointer.matches) {
      show(false);
      return;
    }
    x = e.clientX;
    y = e.clientY;
    kind = kindOf(e.target);
    show(true);
    render();
  },
  { passive: true },
);
// Chuột rời khỏi cửa sổ → ẩn hình, để con trỏ hệ thống tự lo bên ngoài.
document.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget) show(false);
});
window.addEventListener('blur', () => show(false));
mousePointer.addEventListener('change', () => show(false));
// View Transitions thay class của <html> khi swap → gắn lại trạng thái đang bật.
document.addEventListener('astro:before-swap', () => {
  const on = document.documentElement.classList.contains('reze-cursor-on');
  document.addEventListener('astro:after-swap', () => show(on), { once: true });
});
// Sau khi chuyển trang, phần tử dưới chuột đã đổi → chọn lại hình (link/text/thường).
document.addEventListener('astro:page-load', () => {
  kind = kindOf(document.elementFromPoint(x, y));
  render();
});
