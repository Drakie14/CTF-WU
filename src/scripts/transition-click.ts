/**
 * Trong lúc View Transitions chạy (~400ms, xem `panel-in`), lớp ::view-transition phủ toàn trang và
 * Chrome dồn mọi click về <html> (kể cả khi đặt `pointer-events: none`) → bấm sang bài khác lúc
 * đang chuyển trang thì "không ăn". Bắt click đó: bỏ qua phần animation còn lại rồi phát lại click
 * vào đúng phần tử nằm dưới chuột trên trang mới.
 */

let active: ViewTransition | null = null;

document.addEventListener('astro:before-swap', (e) => {
  const vt = e.viewTransition;
  if (!vt) return;
  active = vt;
  vt.finished.finally(() => {
    if (active === vt) active = null;
  });
});

function isCurrentPage(el: Element): boolean {
  const a = el.closest<HTMLAnchorElement>('a[href]');
  if (!a || a.hash) return false;
  return a.origin === location.origin && a.pathname === location.pathname && a.search === location.search;
}

document.addEventListener(
  'click',
  (e) => {
    const vt = active;
    if (!vt || e.target !== document.documentElement || !e.isTrusted) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const { clientX, clientY } = e;
    vt.skipTransition();
    vt.finished.finally(() => {
      const el = document.elementFromPoint(clientX, clientY);
      // Spam click vào chính bài vừa mở → không tải lại trang.
      if (!el || el === document.documentElement || isCurrentPage(el)) return;
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX, clientY }));
    });
  },
  true,
);
