import type { APIRoute } from 'astro';
import { categoryColor } from '../lib/categories';
import { formatDisplayDate, formatIsoDate } from '../lib/content/dates';
import { getSiteContent, isUnsorted, postUrl } from '../lib/posts';

/**
 * `/sidebar.json` — dữ liệu tối thiểu của mọi bài, tạo lúc build (static).
 * Chỉ được tải khi người dùng search (để hiển thị kết quả Pagefind dạng dòng sidebar).
 */
export interface SidebarItem {
  slug: string;
  url: string;
  title: string;
  ctf: string;
  category: string;
  color: string;
  tags: string[];
  date: string;
  iso: string;
  difficulty: string;
  unsorted: boolean;
}

export const GET: APIRoute = async () => {
  const { posts } = await getSiteContent();
  const items: SidebarItem[] = posts.map((p) => ({
    slug: p.id,
    url: postUrl(p),
    title: p.data.title,
    ctf: p.data.ctf,
    category: p.data.category,
    color: categoryColor(p.data.category),
    tags: p.data.tags.slice(0, 3),
    date: formatDisplayDate(p.data.date),
    iso: formatIsoDate(p.data.date),
    difficulty: p.data.difficulty,
    unsorted: isUnsorted(p),
  }));
  return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
};
