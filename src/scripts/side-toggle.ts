/**
 * Nút thu gọn / mở lại sidebar (desktop) để đọc write-up rộng hơn.
 * Trạng thái đặt ở `<html data-side="collapsed">` và nhớ trong localStorage.
 * View Transitions thay thuộc tính của <html> khi đổi trang nên phải đặt lại sau mỗi lần swap.
 */

const KEY = 'side-collapsed';

function readSaved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function apply(collapsed: boolean): void {
  document.documentElement.toggleAttribute('data-side-collapsed', collapsed);
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-side-toggle]')) {
    btn.setAttribute('aria-pressed', String(collapsed));
    btn.title = collapsed ? 'Hiện danh sách write-up' : 'Thu gọn danh sách write-up';
  }
}

function toggle(): void {
  const collapsed = !document.documentElement.hasAttribute('data-side-collapsed');
  apply(collapsed);
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
  // Sidebar tính lại đường cong của danh sách theo kích thước mới.
  window.dispatchEvent(new Event('resize'));
}

apply(readSaved());
document.addEventListener('astro:after-swap', () => apply(readSaved()));
document.addEventListener('astro:page-load', () => {
  apply(readSaved());
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-side-toggle]')) {
    if (btn.dataset.ready) continue;
    btn.dataset.ready = '1';
    btn.addEventListener('click', toggle);
  }
});
