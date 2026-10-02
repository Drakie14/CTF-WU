/**
 * Hạt nền nghiêng nhẹ theo con trỏ (chiều sâu). Chỉ chạy với chuột thật và khi
 * người dùng không bật reduced-motion. Ghi thẳng CSS variable, không đụng layout.
 */
const motionOk = matchMedia('(prefers-reduced-motion: no-preference)');
const fine = matchMedia('(hover: hover) and (pointer: fine)');

if (motionOk.matches && fine.matches) {
  let frame = 0;
  let nx = 0;
  let ny = 0;
  window.addEventListener(
    'pointermove',
    (e) => {
      nx = e.clientX / innerWidth - 0.5;
      ny = e.clientY / innerHeight - 0.5;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = document.querySelector<HTMLElement>('.particles');
        if (!el) return;
        el.style.setProperty('--px', nx.toFixed(3));
        el.style.setProperty('--py', ny.toFixed(3));
      });
    },
    { passive: true },
  );
}
