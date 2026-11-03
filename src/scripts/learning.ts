let dispose: (() => void) | undefined;

function setupLearning() {
  dispose?.();
  const root = document.querySelector<HTMLElement>('[data-learning]');
  if (!root) return;
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-learning-stop]')];
  const tabs = [...root.querySelectorAll<HTMLAnchorElement>('[data-track-tab]')];
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let active: HTMLButtonElement | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let suppressFocus = false;
  const panelOf = (button: HTMLButtonElement) => document.getElementById(button.getAttribute('aria-controls')!)!;
  const cancelTimers = () => { clearTimeout(openTimer); clearTimeout(closeTimer); };

  function position() {
    frame = 0;
    if (!active) return;
    const panel = panelOf(active);
    const r = active.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const left = r.left + r.width / 2 - width / 2;
    // Đặt trên/dưới để cửa sổ không che các điểm liền kề trên cùng hàng.
    const top = r.top >= height + 24 ? r.top - height - 12 : r.bottom + 12;
    panel.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`;
    panel.style.top = `${Math.max(12, Math.min(top, innerHeight - height - 12))}px`;
  }

  function close(restoreFocus = false) {
    cancelTimers();
    const previous = active;
    active = undefined;
    if (!previous) return;
    previous.setAttribute('aria-expanded', 'false');
    const panel = panelOf(previous);
    if (panel.matches(':popover-open')) panel.hidePopover();
    if (restoreFocus) {
      suppressFocus = true;
      previous.focus({ preventScroll: true });
      suppressFocus = false;
    }
  }

  function open(button: HTMLButtonElement) {
    cancelTimers();
    if (active !== button) close();
    active = button;
    const panel = panelOf(button);
    panel.style.inset = 'auto';
    panel.style.margin = '0';
    if (!panel.matches(':popover-open')) panel.showPopover();
    button.setAttribute('aria-expanded', 'true');
    position();
  }

  function scheduleClose() {
    clearTimeout(closeTimer);
    clearTimeout(openTimer);
    closeTimer = setTimeout(() => {
      if (!active) return;
      const panel = panelOf(active);
      const focused = document.activeElement;
      if (active.matches(':hover') || panel.matches(':hover') || active === focused || panel.contains(focused)) return;
      close();
    }, 220);
  }

  function selectTrack(id: string) {
    close();
    const selected = tabs.some(tab => tab.dataset.trackTab === id) ? id : tabs[0].dataset.trackTab;
    for (const panel of root!.querySelectorAll<HTMLElement>('[data-track-panel]')) panel.hidden = panel.id !== selected;
    for (const tab of tabs) {
      if (tab.dataset.trackTab === selected) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }
  }

  function restore() {
    const hash = location.hash.slice(1);
    const stop = buttons.find(button => button.id === hash);
    selectTrack(stop?.dataset.track ?? hash);
    if (stop) requestAnimationFrame(() => {
      if (!stop.isConnected) return;
      stop.scrollIntoView({ block: 'nearest' });
      open(stop);
    });
  }

  for (const button of buttons) {
    const panel = panelOf(button);
    button.setAttribute('aria-expanded', String(panel.matches(':popover-open')));
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch' || !finePointer.matches) return;
      cancelTimers();
      openTimer = setTimeout(() => open(button), 120);
    }, options);
    button.addEventListener('pointerleave', scheduleClose, options);
    button.addEventListener('focus', () => {
      if (!suppressFocus && button.matches(':focus-visible')) open(button);
    }, options);
    button.addEventListener('blur', scheduleClose, options);
    button.addEventListener('click', event => {
      event.preventDefault();
      if (event.detail === 0) {
        open(button);
        panel.querySelector<HTMLElement>('a')?.focus();
      } else if (active === button && !finePointer.matches) close();
      else open(button);
    }, options);
    panel.addEventListener('pointerenter', cancelTimers, options);
    panel.addEventListener('pointerleave', scheduleClose, options);
    panel.addEventListener('focusin', cancelTimers, options);
    panel.addEventListener('focusout', scheduleClose, options);
    panel.addEventListener('toggle', () => {
      if (panel.matches(':popover-open')) return;
      button.setAttribute('aria-expanded', 'false');
      if (active === button) active = undefined;
    }, options);
    panel.querySelector('.popover-close')?.addEventListener('click', event => {
      event.preventDefault();
      close(true);
    }, options);
    panel.addEventListener('click', event => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-lesson]')) return;
      const returnTo = `${location.pathname}${location.search}#${button.id}`;
      history.replaceState(history.state, '', returnTo);
      try { sessionStorage.setItem('from-list-url', returnTo); } catch { /* Storage có thể bị chặn. */ }
    }, options);
  }
  for (const tab of tabs) tab.addEventListener('click', event => {
    event.preventDefault();
    selectTrack(tab.dataset.trackTab!);
    history.replaceState(history.state, '', `#${tab.dataset.trackTab}`);
  }, options);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      close(true);
    }
  }, options);
  document.addEventListener('scroll', event => {
    if (!active || panelOf(active).contains(event.target as Node)) return;
    if (!frame) frame = requestAnimationFrame(position);
  }, { ...options, capture: true, passive: true });
  window.addEventListener('resize', position, options);
  window.addEventListener('hashchange', restore, options);
  root.dataset.enhanced = '';
  restore();
  dispose = () => { close(); cancelAnimationFrame(frame); controller.abort(); };
}
setupLearning();
document.addEventListener('astro:page-load', setupLearning);
document.addEventListener('astro:before-swap', () => dispose?.());
