/**
 * Sidebar: highlight bài hiện tại, cuộn bài đó vào giữa danh sách khi mở trực
 * tiếp, nút thu gọn/mở rộng, fallback JS cho danh sách cong, khôi phục vị trí
 * cuộn (mobile Back). Sidebar được `transition:persist` nên script này chỉ gắn
 * listener một lần cho mỗi phần tử danh sách.
 */

import { setupSidebarSearch } from './search';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const supportsScrollTimeline = CSS.supports('animation-timeline: view()');
const initialized = new WeakSet<Element>();
let firstLoad = true;

function getList(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-list]');
}

function persistKey(): string {
  return document.querySelector<HTMLElement>('[data-persist-key]')?.dataset.persistKey ?? 'sidebar';
}

function currentSlug(): string | null {
  const m = /^\/posts\/([^/]+)\/?$/.exec(location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

// ---- Danh sách dài (mục 22): dòng > 50 nằm trong <template data-more>, hiện dần khi cuộn gần cuối ----
function materializeNext(list: HTMLElement, count = 1): boolean {
  const templates = list.querySelectorAll<HTMLTemplateElement>('[data-list-groups] template[data-more]');
  let done = 0;
  for (const tpl of templates) {
    if (done >= count) break;
    tpl.replaceWith(tpl.content);
    done++;
  }
  const remaining = list.querySelector('[data-list-groups] template[data-more]') !== null;
  if (!remaining) list.querySelector('[data-more-sentinel]')?.remove();
  return remaining;
}

function materializeAll(list: HTMLElement): void {
  while (materializeNext(list, 100));
}

function setupLazyRows(list: HTMLElement): void {
  const sentinel = list.querySelector('[data-more-sentinel]');
  if (!sentinel) return;
  // Link "Xem toàn bộ" chỉ dành cho khi tắt JS.
  sentinel.setAttribute('aria-hidden', 'true');
  (sentinel as HTMLElement).style.visibility = 'hidden';
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (!materializeNext(list, 2)) return io.disconnect();
      // Quan sát lại để nhận callback mới nếu sentinel vẫn còn trong vùng nhìn thấy.
      io.unobserve(sentinel);
      io.observe(sentinel);
    },
    { root: list, rootMargin: '0px 0px 800px 0px' },
  );
  io.observe(sentinel);
}

// ---- Nút đổi cách nhóm: theo CTF (mặc định, render sẵn) ↔ theo category ----
const CATEGORY_ORDER = ['web', 'pwn', 'crypto', 'rev', 'forensics', 'misc', 'osint', 'mobile', 'cloud'];
const CATEGORY_LABELS: Record<string, string> = {
  web: 'Web', pwn: 'Pwn', crypto: 'Crypto', rev: 'Reverse', forensics: 'Forensics',
  misc: 'Misc', osint: 'OSINT', mobile: 'Mobile', cloud: 'Cloud', '': 'Chưa có category',
};

function buildCategoryGroups(list: HTMLElement): void {
  const alt = list.querySelector<HTMLElement>('[data-list-alt]');
  if (!alt || alt.dataset.built) return;
  materializeAll(list);
  const rows = [...list.querySelectorAll<HTMLElement>('[data-list-groups] li.row-item')];
  const byCat = new Map<string, HTMLElement[]>();
  for (const li of rows) {
    const cat = li.querySelector<HTMLElement>('a.row')?.dataset.category ?? '';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(li);
  }
  // Giữ thứ tự mới nhất trước trong mỗi nhóm (theo ngày ISO của dòng).
  const dateOf = (li: HTMLElement) => li.querySelector('time')?.getAttribute('datetime') ?? '';
  const keys = [...CATEGORY_ORDER.filter((c) => byCat.has(c)), ...(byCat.has('') ? [''] : [])];
  alt.innerHTML = '';
  for (const key of keys) {
    const details = document.createElement('details');
    details.className = key ? 'group' : 'group group-unsorted';
    details.open = true;
    details.dataset.group = `cat-${key || 'none'}`;
    const items = byCat.get(key)!.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    details.innerHTML =
      `<summary class="group-head"><span class="group-diamond" aria-hidden="true"></span>` +
      `<span class="group-label"></span><span class="group-line" aria-hidden="true"></span>` +
      `<span class="group-count">${items.length}</span><span class="group-chevron" aria-hidden="true"></span></summary><ul class="rows"></ul>`;
    details.querySelector('.group-label')!.textContent = CATEGORY_LABELS[key] ?? key;
    const ul = details.querySelector('ul')!;
    for (const li of items) ul.append(li.cloneNode(true));
    alt.append(details);
  }
  alt.dataset.built = '1';
}

function setGrouping(root: HTMLElement, list: HTMLElement, byCategory: boolean): void {
  const groups = list.querySelector<HTMLElement>('[data-list-groups]');
  const alt = list.querySelector<HTMLElement>('[data-list-alt]');
  if (!groups || !alt) return;
  if (byCategory) buildCategoryGroups(list);
  groups.hidden = byCategory;
  alt.hidden = !byCategory;
  root.querySelector('[data-group-toggle]')?.setAttribute('aria-pressed', String(byCategory));
  markCurrent(list);
  try {
    sessionStorage.setItem('group-by', byCategory ? 'category' : 'ctf');
  } catch {
    /* ignore */
  }
}

function setupGroupToggle(root: HTMLElement, list: HTMLElement): void {
  const btn = root.querySelector<HTMLButtonElement>('[data-group-toggle]');
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener('click', () => setGrouping(root, list, btn.getAttribute('aria-pressed') !== 'true'));
  let saved: string | null = null;
  try {
    saved = sessionStorage.getItem('group-by');
  } catch {
    /* ignore */
  }
  if (saved === 'category') setGrouping(root, list, true);
}

function markCurrent(list: HTMLElement): HTMLElement | null {
  const slug = currentSlug();
  // Bài hiện tại có thể nằm trong phần chưa render → hiện dần tới khi thấy.
  if (slug) {
    while (!list.querySelector(`a.row[data-slug="${CSS.escape(slug)}"]`) && materializeNext(list, 1));
  }
  let current: HTMLElement | null = null;
  for (const row of list.querySelectorAll<HTMLElement>('a.row')) {
    if (slug && row.dataset.slug === slug) {
      row.setAttribute('aria-current', 'page');
      current = row;
    } else {
      row.removeAttribute('aria-current');
    }
  }
  return current;
}

function centerRow(list: HTMLElement, row: HTMLElement): void {
  const details = row.closest('details');
  if (details && !details.open) details.open = true;
  const listRect = list.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  list.scrollTop += rowRect.top - listRect.top - (list.clientHeight - rowRect.height) / 2;
}

// ---- Danh sách cong: fallback requestAnimationFrame khi không có scroll-driven animations ----
function setupCurveFallback(list: HTMLElement): void {
  if (supportsScrollTimeline || reducedMotion.matches) return;
  list.dataset.curveJs = '';
  const visible = new Set<HTMLElement>();
  let frame = 0;

  const update = () => {
    frame = 0;
    const rect = list.getBoundingClientRect();
    const half = rect.height / 2;
    const center = rect.top + half;
    const curve = parseFloat(getComputedStyle(list).getPropertyValue('--curve')) || 48;
    // Đọc hết vị trí trước rồi mới ghi style: tránh reflow cưỡng bức xen kẽ khi scroll nhanh.
    const rows = [...visible];
    const ks = rows.map((row) => {
      const r = row.getBoundingClientRect();
      const d = Math.min(1, Math.abs(r.top + r.height / 2 - center) / (half + r.height / 2));
      return Math.sqrt(1 - d * d); // cung tròn: 1 ở giữa, 0 ở mép
    });
    rows.forEach((row, i) => {
      row.style.transform = `translate3d(${(curve * ks[i]).toFixed(1)}px,0,0)`;
      row.style.opacity = (0.35 + 0.65 * ks[i]).toFixed(3);
    });
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const row = e.target as HTMLElement;
        if (e.isIntersecting) visible.add(row);
        else visible.delete(row);
      }
      schedule();
    },
    { root: list },
  );
  const observeRows = () => list.querySelectorAll<HTMLElement>('a.row').forEach((row) => io.observe(row));
  observeRows();
  new MutationObserver(observeRows).observe(list, { childList: true, subtree: true });
  list.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  list.addEventListener('toggle', schedule, true);
}

function setupCollapseAll(root: HTMLElement): void {
  const btn = root.querySelector<HTMLButtonElement>('[data-collapse-all]');
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const groups = [...root.querySelectorAll<HTMLDetailsElement>('[data-list-groups]:not([hidden]) details.group, [data-list-alt]:not([hidden]) details.group')];
    const collapse = groups.some((g) => g.open);
    for (const g of groups) g.open = !collapse;
    btn.setAttribute('aria-pressed', String(collapse));
  });
}

function setupScrollMemory(list: HTMLElement): void {
  list.addEventListener('click', (e) => {
    const row = (e.target as Element).closest('a.row');
    if (!row) return;
    try {
      sessionStorage.setItem(`scroll:${persistKey()}`, String(list.scrollTop));
      sessionStorage.setItem('from-list', '1');
    } catch {
      /* storage bị chặn: bỏ qua */
    }
  });
}

function restoreScroll(list: HTMLElement): boolean {
  try {
    const saved = sessionStorage.getItem(`scroll:${persistKey()}`);
    if (saved === null) return false;
    list.scrollTop = Number(saved);
    return true;
  } catch {
    return false;
  }
}

function onPageLoad(): void {
  const list = getList();
  const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
  if (!list || !sidebar) return;

  if (!initialized.has(list)) {
    initialized.add(list);
    setupCurveFallback(list);
    setupCollapseAll(sidebar);
    setupScrollMemory(list);
    setupLazyRows(list);
    setupGroupToggle(sidebar, list);
    setupSidebarSearch(sidebar);
  }

  const current = markCurrent(list);
  const view = document.querySelector<HTMLElement>('.shell')?.dataset.view;
  const listVisible = list.offsetParent !== null;
  if (firstLoad && current && listVisible) {
    // Mở trực tiếp một bài: đưa bài đó vào khoảng giữa danh sách.
    centerRow(list, current);
  } else if ((view === 'home' || view === 'filter') && listVisible && list.scrollTop === 0) {
    // Mobile: quay lại danh sách → khôi phục vị trí cuộn trước đó.
    restoreScroll(list);
  }
  firstLoad = false;
}

// Khi ClientRouter chuyển phần tử `transition:persist` sang document mới, trình duyệt
// reset vị trí cuộn của nó (DOM được gắn lại) → lưu trước khi swap, khôi phục ngay sau.
let swapState: { list: HTMLElement; scrollTop: number } | null = null;
document.addEventListener('astro:before-swap', () => {
  const list = getList();
  swapState = list ? { list, scrollTop: list.scrollTop } : null;
});
document.addEventListener('astro:after-swap', () => {
  const list = getList();
  if (swapState && list === swapState.list) list.scrollTop = swapState.scrollTop;
  swapState = null;
});

document.addEventListener('astro:page-load', onPageLoad);
