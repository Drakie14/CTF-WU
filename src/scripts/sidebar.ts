/**
 * Sidebar: highlight bài hiện tại, cuộn bài đó vào giữa danh sách khi mở trực
 * tiếp, nút thu gọn/mở rộng, fallback JS cho danh sách cong, khôi phục vị trí
 * cuộn (mobile Back). Sidebar được `transition:persist` nên script này chỉ gắn
 * listener một lần cho mỗi phần tử danh sách.
 */

import { setupSidebarSearch } from './search';
import { STUDIO_REPO, STUDIO_TOKEN_KEY } from '../lib/studio';

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

// ---- Cây thư mục: nhớ nhánh nào đang mở giữa các lần ghé (trang chủ, không lọc) ----
const OPEN_KEY = 'sidebar-open-folders';

function treeFolders(list: HTMLElement): HTMLDetailsElement[] {
  return [...list.querySelectorAll<HTMLDetailsElement>('[data-list-groups] details.group')];
}

function saveOpenFolders(list: HTMLElement): void {
  if (persistKey() !== 'sidebar-all') return;
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(treeFolders(list).filter((d) => d.open).map((d) => d.dataset.group)));
  } catch {
    /* ignore */
  }
}

function setupFolderMemory(list: HTMLElement): void {
  // Trang lọc ít bài và mở sẵn tất cả; chỉ cây đầy đủ mới khôi phục trạng thái.
  if (persistKey() !== 'sidebar-all') return;
  let saved: unknown = null;
  try {
    saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? 'null');
  } catch {
    /* ignore */
  }
  if (Array.isArray(saved)) {
    const keys = new Set(saved);
    // Nhánh của bài đang đọc vẫn mở (server đã đánh dấu), cộng thêm nhánh đã lưu.
    const current = list.querySelector('a.row[aria-current="page"]');
    for (const d of treeFolders(list)) d.open = keys.has(d.dataset.group) || (current !== null && d.contains(current));
  }
  list.addEventListener('toggle', (e) => {
    if ((e.target as Element).matches?.('[data-list-groups] details.group')) saveOpenFolders(list);
  }, true);
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
  // Mở mọi thư mục cha (Dreamhack ▸ Class / C1) để dòng thật sự hiện ra.
  for (let details = row.closest('details'); details; details = details.parentElement?.closest('details') ?? null) {
    details.open = true;
  }
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
      sessionStorage.setItem('from-list-url', `${location.pathname}${location.search}${location.hash}`);
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
    setupFolderMemory(list);
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

function savedAdminTokens(): string[] {
  const values: string[] = [];
  try {
    const studioToken = localStorage.getItem(STUDIO_TOKEN_KEY);
    if (studioToken) values.push(studioToken);
  } catch {
    // localStorage có thể bị chặn; lúc đó yêu cầu nhập PAT trong form.
  }
  return values;
}

async function verifyAdminToken(token: string): Promise<void> {
  const repo = STUDIO_REPO.name;

  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const userResponse = await fetch('https://api.github.com/user', { headers });
  if (!userResponse.ok) {
    const result = await userResponse.json().catch(() => ({})) as { message?: string };
    throw new Error(`GitHub ${userResponse.status}: ${result.message ?? 'PAT không hợp lệ.'}`);
  }

  const response = await fetch(`https://api.github.com/repos/${repo}`, {
    headers,
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(`GitHub ${response.status}: ${result.message ?? response.statusText}`);
  }
  const result = await response.json() as { permissions?: { push?: boolean } };
  if (result.permissions?.push !== true) {
    throw new Error('PAT hợp lệ nhưng chưa có quyền ghi repository. Hãy cấp Contents: Read and write rồi thử lại.');
  }
}

function setupAdminGate(): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-admin-auth]');
  const form = dialog?.querySelector<HTMLFormElement>('[data-admin-auth-form]');
  const input = dialog?.querySelector<HTMLInputElement>('[data-admin-token]');
  const error = dialog?.querySelector<HTMLElement>('[data-admin-auth-error]');
  const submit = dialog?.querySelector<HTMLButtonElement>('[data-admin-auth-submit]');
  const close = dialog?.querySelector<HTMLButtonElement>('[data-admin-auth-close]');
  if (!dialog || !form || !input || !error || !submit || !close || dialog.dataset.ready) return;
  dialog.dataset.ready = 'true';

  const openDialog = (message = '') => {
    error.textContent = message;
    if (!dialog.open) dialog.showModal();
    input.focus();
  };
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const token = input.value.trim();
    if (!token) { input.focus(); return; }
    submit.disabled = true;
    submit.textContent = 'Đang xác thực…';
    error.textContent = '';
    try {
      await verifyAdminToken(token);
      localStorage.setItem(STUDIO_TOKEN_KEY, token);
      dialog.close();
      window.location.assign('/admin/studio/');
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
      input.focus();
    } finally {
      submit.disabled = false;
      submit.textContent = 'Kiểm tra và tiếp tục';
    }
  });

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>('[data-admin-link]');
    if (!link) return;
    // Ctrl/Cmd/Shift+click: để trình duyệt tự mở tab mới; trang studio tự đọc PAT đã lưu trong localStorage.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();

    const tokens = savedAdminTokens();
    for (const token of tokens) {
      try {
        await verifyAdminToken(token);
        localStorage.setItem(STUDIO_TOKEN_KEY, token);
        window.location.assign(link.href);
        return;
      } catch {
        // Nếu không có PAT đã xác thực, mở form để đăng nhập hoặc sửa token cũ.
      }
    }
    openDialog(tokens.length ? 'Phiên GitHub cũ không còn quyền truy cập. Nhập lại PAT để tiếp tục.' : '');
  });
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

setupAdminGate();
document.addEventListener('astro:page-load', onPageLoad);
