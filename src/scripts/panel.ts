/**
 * Panel nội dung: nút Copy cho code block, highlight heading đang đọc trong TOC,
 * nút Back trên mobile. Chạy lại sau mỗi lần View Transitions đổi trang.
 */

let tocAbort: AbortController | undefined;

function setupCopyButtons(root: ParentNode): void {
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.copy-btn[data-copy]')) {
    if (btn.dataset.ready) continue;
    btn.dataset.ready = '1';
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      const code = btn.closest('.code-block')?.querySelector('pre code');
      if (!code) return;
      try {
        await navigator.clipboard.writeText(code.textContent ?? '');
        btn.textContent = 'Copied';
        btn.dataset.copied = '';
      } catch {
        btn.textContent = 'Failed';
      }
      setTimeout(() => {
        btn.textContent = 'Copy';
        delete btn.dataset.copied;
      }, 1600);
    });
  }
}

function setupToc(panel: HTMLElement): void {
  tocAbort?.abort();
  const links = new Map<string, HTMLAnchorElement>();
  for (const a of panel.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')) links.set(a.dataset.tocLink!, a);
  if (!links.size) return;
  const headings = [...links.keys()]
    .map((id) => document.getElementById(id))
    .filter((h): h is HTMLElement => h !== null);
  const bars = panel.querySelectorAll<HTMLElement>('[data-toc-bar]');

  // Desktop: panel tự cuộn; mobile: trang cuộn.
  const root = getComputedStyle(panel).overflowY === 'auto' ? panel : null;
  // Heading đang đọc = heading cuối cùng đã qua mốc 35% chiều cao vùng nhìn thấy.
  const setActive = () => {
    const top = root?.getBoundingClientRect().top ?? 0;
    const limit = top + (root?.clientHeight ?? window.innerHeight) * 0.35;
    let active: string | undefined;
    for (const h of headings) {
      if (h.getBoundingClientRect().top > limit) break;
      active = h.id;
    }
    for (const [id, a] of links) {
      if (id === active) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
    for (const bar of bars) bar.toggleAttribute('data-active', bar.dataset.tocBar === active);
  };

  tocAbort = new AbortController();
  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      setActive();
    });
  };
  (root ?? window).addEventListener('scroll', onScroll, { passive: true, signal: tocAbort.signal });
  setActive();
  setupTocPopup(panel);
}

/** TOC thu gọn: hover/focus mở bằng CSS; chạm (không có hover) thì bật/tắt `data-open`. */
function setupTocPopup(panel: HTMLElement): void {
  const toc = panel.querySelector<HTMLElement>('[data-toc]');
  const toggle = toc?.querySelector<HTMLButtonElement>('[data-toc-toggle]');
  const pop = toc?.querySelector<HTMLElement>('[data-toc-pop]');
  if (!toc || !toggle || !pop || toc.dataset.ready) return;
  toc.dataset.ready = '1';

  // Mở ra thì cuộn danh sách tới mục đang đọc (TOC dài).
  const revealActive = () => {
    const a = pop.querySelector<HTMLElement>('a[aria-current="true"]');
    if (a) pop.scrollTop = a.offsetTop - pop.clientHeight / 3;
  };
  const setOpen = (open: boolean) => {
    toc.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) revealActive();
  };
  toc.addEventListener('mouseenter', revealActive);
  toggle.addEventListener('click', () => setOpen(!toc.hasAttribute('data-open')));
  pop.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('a')) return;
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  });
  document.addEventListener('click', (e) => {
    if (toc.hasAttribute('data-open') && !toc.contains(e.target as Node)) setOpen(false);
  });
  toc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  });
}

function setupBack(panel: HTMLElement): void {
  const back = panel.querySelector<HTMLAnchorElement>('[data-back]');
  if (!back) return;
  back.addEventListener('click', (e) => {
    let fromList = false;
    try {
      fromList = sessionStorage.getItem('from-list') === '1';
    } catch {
      /* ignore */
    }
    if (fromList && history.length > 1) {
      e.preventDefault();
      history.back();
    }
  });
}

document.addEventListener('astro:page-load', () => {
  const panel = document.querySelector<HTMLElement>('[data-panel]');
  if (!panel) return;
  setupCopyButtons(panel);
  setupToc(panel);
  setupBack(panel);
});
