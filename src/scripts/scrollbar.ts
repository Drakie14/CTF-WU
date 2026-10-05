/**
 * Thanh cuộn tự vẽ cho các vùng `[data-rbar]` (panel bài viết, danh sách sidebar) và trang.
 * Thanh cuộn native không nhận thuộc tính `cursor` nên không hiện được con trỏ Reze;
 * ta ẩn nó (class `rbar-on`, chỉ gắn khi JS chạy) và vẽ track + thumb `position: fixed`
 * bám theo cạnh phải của vùng cuộn. Chỉ bật với chuột (pointer: fine) — màn cảm ứng giữ native.
 * View Transitions thay <body> nên dựng lại sau mỗi `astro:page-load`.
 */

const MIN_THUMB = 28;

interface Bar {
  el: HTMLElement;
  track: HTMLDivElement;
  thumb: HTMLDivElement;
  ro: ResizeObserver;
  cleanup: () => void;
}

let bars: Bar[] = [];
let queued = false;

function isPage(el: HTMLElement): boolean {
  return el === document.documentElement;
}

function viewRect(el: HTMLElement): { top: number; right: number; height: number; width: number } {
  if (isPage(el)) return { top: 0, right: window.innerWidth, height: window.innerHeight, width: window.innerWidth };
  const r = el.getBoundingClientRect();
  return { top: r.top, right: r.right, height: r.height, width: r.width };
}

function layout(bar: Bar): void {
  const { el, track, thumb } = bar;
  const view = el.clientHeight;
  const total = el.scrollHeight;
  const rect = viewRect(el);
  const visible = total - view > 1 && rect.width > 40 && el.checkVisibility();
  track.hidden = !visible;
  if (!visible) return;
  // Bo theo góc panel để thumb không lòi ra ngoài phần bo tròn.
  const inset = isPage(el) ? 2 : 10;
  const trackH = rect.height - inset * 2;
  const thumbH = Math.max(MIN_THUMB, (view / total) * trackH);
  const maxTop = trackH - thumbH;
  const top = (el.scrollTop / (total - view)) * maxTop;
  track.style.transform = `translate(${rect.right - 12}px, ${rect.top + inset}px)`;
  track.style.height = `${trackH}px`;
  thumb.style.height = `${thumbH}px`;
  thumb.style.transform = `translateY(${top}px)`;
}

function layoutAll(): void {
  queued = false;
  for (const bar of bars) layout(bar);
}

function schedule(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(layoutAll);
}

function attach(el: HTMLElement): Bar {
  const track = document.createElement('div');
  track.className = 'rbar';
  track.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div');
  thumb.className = 'rbar-thumb';
  track.append(thumb);
  document.body.append(track);
  el.classList.add('rbar-on');

  const scrollTarget: HTMLElement | Window = isPage(el) ? window : el;
  const ratio = (): number => {
    const trackH = track.clientHeight;
    const thumbH = thumb.offsetHeight;
    return (el.scrollHeight - el.clientHeight) / Math.max(1, trackH - thumbH);
  };

  let dragStartY = 0;
  let dragStartTop = 0;
  const onThumbDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartY = e.clientY;
    dragStartTop = el.scrollTop;
    thumb.setPointerCapture(e.pointerId);
    thumb.classList.add('is-drag');
  };
  const onThumbMove = (e: PointerEvent): void => {
    if (!thumb.hasPointerCapture(e.pointerId)) return;
    el.scrollTop = dragStartTop + (e.clientY - dragStartY) * ratio();
  };
  const onThumbUp = (e: PointerEvent): void => {
    if (thumb.hasPointerCapture(e.pointerId)) thumb.releasePointerCapture(e.pointerId);
    thumb.classList.remove('is-drag');
  };
  // Click vào track: nhảy một trang về phía điểm click.
  const onTrackDown = (e: PointerEvent): void => {
    if (e.button !== 0 || e.target !== track) return;
    const above = e.clientY < thumb.getBoundingClientRect().top;
    el.scrollBy({ top: (above ? -1 : 1) * el.clientHeight * 0.9, behavior: 'smooth' });
  };
  // Track nằm đè lên mép vùng cuộn: lăn chuột trên track phải cuộn vùng bên dưới.
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    el.scrollBy({ top: e.deltaY, left: e.deltaX });
  };

  thumb.addEventListener('pointerdown', onThumbDown);
  thumb.addEventListener('pointermove', onThumbMove);
  thumb.addEventListener('pointerup', onThumbUp);
  thumb.addEventListener('pointercancel', onThumbUp);
  track.addEventListener('pointerdown', onTrackDown);
  track.addEventListener('wheel', onWheel, { passive: false });
  scrollTarget.addEventListener('scroll', schedule, { passive: true });

  // Nội dung đổi chiều cao (ảnh tải xong, mở <details>...) → đo lại.
  const ro = new ResizeObserver(schedule);
  ro.observe(el);
  for (const child of el.children) ro.observe(child);

  const bar: Bar = {
    el,
    track,
    thumb,
    ro,
    cleanup: () => {
      scrollTarget.removeEventListener('scroll', schedule);
      ro.disconnect();
      track.remove();
      el.classList.remove('rbar-on');
    },
  };
  layout(bar);
  return bar;
}

const finePointer = window.matchMedia('(pointer: fine)');

function init(): void {
  for (const bar of bars) bar.cleanup();
  bars = [];
  if (!finePointer.matches) return;
  const targets = [document.documentElement, ...document.querySelectorAll<HTMLElement>('[data-rbar]')];
  bars = targets.map(attach);
}

window.addEventListener('resize', schedule, { passive: true });
// Thu gọn sidebar / panel chạy transition → đo lại khi xong.
document.addEventListener('transitionend', schedule, { passive: true });
document.addEventListener('animationend', schedule, { passive: true });
finePointer.addEventListener('change', init);
document.addEventListener('astro:page-load', init);
