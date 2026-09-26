/**
 * Search trong sidebar bằng Pagefind (mục 23):
 * - debounce 200ms; Pagefind chỉ được dynamic import khi người dùng gõ;
 * - kết quả thay thế danh sách hiện tại; xóa ô search → trả lại danh sách;
 * - không có JS: form submit tới /search (HTML thuần).
 */
import type { SidebarItem } from '../pages/sidebar.json';
import { rowHtml } from './rows';

interface PagefindResult {
  data: () => Promise<{ url: string; excerpt: string; meta: Record<string, string> }>;
}
interface Pagefind {
  options: (o: Record<string, unknown>) => Promise<void>;
  search: (q: string) => Promise<{ results: PagefindResult[] } | null>;
}

let pagefindPromise: Promise<Pagefind> | undefined;
let itemsPromise: Promise<Map<string, SidebarItem>> | undefined;

function loadPagefind(): Promise<Pagefind> {
  // URL nằm trong biến để Vite không cố bundle file chỉ có sau khi chạy `pagefind`.
  const url = '/pagefind/pagefind.js';
  pagefindPromise ??= (import(/* @vite-ignore */ url) as Promise<Pagefind>).then(async (pf) => {
    await pf.options({ excerptLength: 18 });
    return pf;
  });
  pagefindPromise.catch(() => (pagefindPromise = undefined));
  return pagefindPromise;
}

function loadItems(): Promise<Map<string, SidebarItem>> {
  itemsPromise ??= fetch('/sidebar.json')
    .then((r) => r.json() as Promise<SidebarItem[]>)
    .then((items) => new Map(items.map((i) => [i.url, i])));
  itemsPromise.catch(() => (itemsPromise = undefined));
  return itemsPromise;
}

const normalizeUrl = (u: string) => new URL(u, location.origin).pathname.replace(/(index\.html)?$/, '').replace(/\/?$/, '/');

export async function searchItems(q: string, limit = 50): Promise<Array<{ item: SidebarItem; excerpt: string }>> {
  const [pf, items] = await Promise.all([loadPagefind(), loadItems()]);
  const res = await pf.search(q);
  if (!res) return [];
  const data = await Promise.all(res.results.slice(0, limit).map((r) => r.data()));
  return data.flatMap((d) => {
    const item = items.get(normalizeUrl(d.url));
    return item ? [{ item, excerpt: d.excerpt }] : [];
  });
}

export function setupSidebarSearch(sidebar: HTMLElement): void {
  const form = sidebar.querySelector<HTMLFormElement>('[data-search-form]');
  const input = sidebar.querySelector<HTMLInputElement>('[data-search-input]');
  const results = sidebar.querySelector<HTMLElement>('[data-list-results]');
  const list = sidebar.querySelector<HTMLElement>('[data-list]');
  if (!form || !input || !results || !list) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const showList = () => {
    results.hidden = true;
    results.innerHTML = '';
    delete list.dataset.searching;
  };

  const run = async () => {
    const q = input.value.trim();
    const my = ++seq;
    if (!q) return showList();
    list.dataset.searching = '';
    results.hidden = false;
    results.innerHTML = '<p class="sb-status">Đang tìm…</p>';
    try {
      const found = await searchItems(q);
      if (my !== seq) return; // đã có truy vấn mới hơn
      results.innerHTML =
        `<p class="sb-status">${found.length} kết quả</p>` +
        (found.length ? `<ul class="rows">${found.map((f) => rowHtml(f.item, f.excerpt)).join('')}</ul>` : '');
      list.scrollTop = 0;
    } catch {
      if (my !== seq) return;
      results.innerHTML =
        '<p class="sb-status">Không tải được chỉ mục tìm kiếm (chỉ có sau <code>npm run build</code>).</p>';
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    void run();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      showList();
    }
  });
  // Giữ kết quả nếu ô search đã có chữ (ví dụ sau khi quay lại trang).
  if (input.value.trim()) void run();
}
