/**
 * Prefetch HTML của trang khi rê chuột / focus vào link (sau 65ms) hoặc ngay khi nhấn chuột / chạm,
 * rồi đưa đúng bản đó cho ClientRouter lúc click → không phải chờ mạng khi chuyển bài.
 * Prefetch có sẵn của Astro (`<link rel="prefetch">`) không giúp được: khi click router lại tự
 * `fetch()` trang, mà HTML có `Cache-Control: max-age=0, must-revalidate` nên vẫn mất trọn một
 * vòng request. Prefetch của Astro được tắt (`prefetch: false` trong astro.config.mjs) để không tải hai lần.
 * Mỗi bản prefetch chỉ dùng cho một lần chuyển trang và hết hạn sau 5 phút (giống Chrome).
 */

interface Page {
  body: string;
  type: string;
}

const TTL = 5 * 60_000;
const MAX = 30;
const HOVER_DELAY = 65;

const cache = new Map<string, { at: number; page: Promise<Page | null> }>();

function pageKey(url: URL): string {
  return url.origin + url.pathname + url.search;
}

function isSlowConnection(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!conn && (!!conn.saveData || /2g/.test(conn.effectiveType ?? ''));
}

/** Link tới một trang HTML khác của site mà ClientRouter sẽ tự chuyển tới. */
function pageLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const a = target.closest<HTMLAnchorElement>('a[href]');
  if (!a || a.origin !== location.origin || a.hasAttribute('download')) return null;
  if ((a.target && a.target !== '_self') || a.hasAttribute('data-astro-reload') || a.dataset.astroPrefetch === 'false') return null;
  if (a.pathname === location.pathname && a.search === location.search) return null;
  if (/^\/(admin|attachments|pagefind)(\/|$)/.test(a.pathname)) return null;
  // File (ảnh, rss.xml, .json…) không phải trang.
  if (/\.(?!html?$)[^/.]+$/.test(a.pathname)) return null;
  return a;
}

function fetchPage(url: string): Promise<Page | null> {
  return fetch(url, { credentials: 'same-origin', priority: 'low' } as RequestInit)
    .then(async (res) => {
      const type = res.headers.get('content-type') ?? '';
      // Redirect / lỗi: để router tự fetch và xử lý như bình thường.
      if (!res.ok || res.redirected || !/^(text\/html|application\/xhtml\+xml)\b/.test(type)) return null;
      return { body: await res.text(), type };
    })
    .catch(() => null);
}

function prefetch(a: HTMLAnchorElement): void {
  if (!navigator.onLine) return;
  const key = pageKey(new URL(a.href));
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return;
  cache.delete(key);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
  const entry = { at: Date.now(), page: fetchPage(key) };
  cache.set(key, entry);
  // Lỗi thì bỏ khỏi cache để lần sau thử lại.
  void entry.page.then((p) => p === null && cache.get(key) === entry && cache.delete(key));
}

/** Lấy (và xóa) bản prefetch còn hạn của URL. */
function take(url: URL): Promise<Page | null> | null {
  const key = pageKey(url);
  const hit = cache.get(key);
  cache.delete(key);
  return hit && Date.now() - hit.at < TTL ? hit.page : null;
}

let hovered: HTMLAnchorElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

function hoverIn(a: HTMLAnchorElement | null): void {
  if (!a || a === hovered || isSlowConnection()) return;
  hovered = a;
  clearTimeout(timer);
  timer = setTimeout(() => prefetch(a), HOVER_DELAY);
}

function hoverOut(): void {
  hovered = null;
  clearTimeout(timer);
}

document.addEventListener('pointerover', (e) => e.pointerType === 'mouse' && hoverIn(pageLink(e.target)), { passive: true });
document.addEventListener(
  'pointerout',
  (e) => {
    if (hovered && !(e.relatedTarget instanceof Node && hovered.contains(e.relatedTarget))) hoverOut();
  },
  { passive: true },
);
document.addEventListener('focusin', (e) => hoverIn(pageLink(e.target)), { passive: true });
document.addEventListener('focusout', hoverOut, { passive: true });
// Nhấn chuột / chạm: click sẽ tới sau ~100ms, tải ngay.
document.addEventListener(
  'pointerdown',
  (e) => {
    if (e.button !== 0) return;
    const a = pageLink(e.target);
    if (a) prefetch(a);
  },
  { passive: true },
);

document.addEventListener('astro:before-preparation', (e) => {
  if (e.formData) return;
  const cached = take(e.to);
  if (!cached) return;
  const loader = e.loader;
  // Dùng lại loader gốc của Astro (parse, kiểm tra trang, preload CSS, redirect…), chỉ thay
  // lần gọi fetch() đầu tiên tới đúng URL đó bằng bản đã prefetch.
  e.loader = async () => {
    const page = await cached;
    if (!page || e.signal.aborted) return loader();
    const realFetch = window.fetch;
    window.fetch = (input, init) => {
      window.fetch = realFetch;
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (pageKey(url) !== pageKey(e.to) || (init?.method && init.method !== 'GET')) return realFetch(input, init);
      return Promise.resolve(new Response(page.body, { headers: { 'content-type': page.type } }));
    };
    // Loader gốc gọi fetch() ngay (đồng bộ); trả lại fetch thật luôn để không ảnh hưởng chỗ khác.
    let done: Promise<void>;
    try {
      done = loader();
    } finally {
      window.fetch = realFetch;
    }
    return done;
  };
});
