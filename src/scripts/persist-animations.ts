/**
 * Giữ nguyên CSS animation của các phần tử `transition:persist` (sidebar, hạt nền, mèo pixel) khi
 * chuyển trang. ClientRouter gỡ phần tử ra rồi gắn lại vào <body> mới; trình duyệt coi đó là phần tử
 * mới và chạy lại mọi CSS animation từ đầu (kể cả khi dùng moveBefore) → sidebar mờ về 0 rồi "rise"
 * lại, hạt nền nhảy về vị trí xuất phát mỗi lần click sang bài khác.
 * Trước khi swap ghi lại `startTime` của từng animation; ngay sau swap (chưa vẽ frame nào) đặt lại
 * `startTime` cũ cho animation đang chạy dở, và cho kết thúc luôn animation đã chạy xong từ trước.
 */

const PERSIST = '[data-astro-transition-persist]';

let roots: Element[] = [];
let saved = new Map<Element, Map<string, number>>();

function cssAnimations(root: Element): CSSAnimation[] {
  return root
    .getAnimations({ subtree: true })
    .filter((a): a is CSSAnimation => a instanceof CSSAnimation && a.timeline === document.timeline);
}

function animKey(a: CSSAnimation): string {
  return `${(a.effect as KeyframeEffect | null)?.pseudoElement ?? ''}|${a.animationName}`;
}

document.addEventListener('astro:before-swap', (e) => {
  // Chỉ những phần tử còn được giữ ở trang mới; phần còn lại bị thay hẳn, animation chạy mới là đúng.
  roots = [...document.querySelectorAll(PERSIST)].filter((el) =>
    e.newDocument.querySelector(`[data-astro-transition-persist="${CSS.escape(el.getAttribute('data-astro-transition-persist')!)}"]`),
  );
  saved = new Map();
  for (const root of roots) {
    for (const a of cssAnimations(root)) {
      const target = (a.effect as KeyframeEffect | null)?.target;
      if (!target || a.startTime === null || a.playState !== 'running') continue;
      if (!saved.has(target)) saved.set(target, new Map());
      saved.get(target)!.set(animKey(a), Number(a.startTime));
    }
  }
});

document.addEventListener('astro:after-swap', () => {
  for (const root of roots) {
    if (!root.isConnected) continue;
    for (const a of cssAnimations(root)) {
      const target = (a.effect as KeyframeEffect | null)?.target;
      const start = target ? saved.get(target)?.get(animKey(a)) : undefined;
      if (start !== undefined) {
        if (a.startTime !== start) a.startTime = start;
      } else if (a.effect?.getComputedTiming().endTime !== Infinity) {
        // Animation có hồi kết (intro "rise") đã chạy xong trước khi chuyển trang → không chạy lại.
        a.finish();
      }
    }
  }
  roots = [];
  saved = new Map();
});
