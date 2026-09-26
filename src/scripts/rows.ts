import type { SidebarItem } from '../pages/sidebar.json';

/** Render một dòng sidebar giống hệt `PostRow.astro` (dùng cho kết quả search). */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function rowHtml(item: SidebarItem, excerpt?: string): string {
  const current = location.pathname.replace(/\/?$/, '/') === item.url;
  const sub = [
    item.unsorted ? '<span class="unsorted-label">UNSORTED</span>' : '',
    item.ctf ? `<span class="row-ctf">${esc(item.ctf)}</span>` : '',
    ...item.tags.map((t) => `<span class="pill">${esc(t)}</span>`),
  ].join('');
  return (
    `<li class="row-item"><a class="row${item.unsorted ? ' unsorted' : ''}" href="${esc(item.url)}" data-slug="${esc(item.slug)}"` +
    ` data-category="${esc(item.category)}"${current ? ' aria-current="page"' : ''} style="--tag-c:${esc(item.color)}">` +
    `<span class="diamond" aria-hidden="true"></span><span class="row-main"><span class="row-title">${esc(item.title)}</span>` +
    `<span class="row-sub">${sub}</span>` +
    // Excerpt của Pagefind đã escape sẵn, chỉ chứa <mark> quanh từ khóa.
    (excerpt ? `<span class="row-excerpt">${excerpt}</span>` : '') +
    `</span><span class="row-side">${item.points !== null ? `<span class="pts"><b>${item.points}</b> pts</span>` : ''}` +
    `<span class="row-meta"><time datetime="${esc(item.iso)}">${esc(item.date)}</time>${item.difficulty ? ` · ${esc(item.difficulty)}` : ''}</span>` +
    `</span></a></li>`
  );
}
