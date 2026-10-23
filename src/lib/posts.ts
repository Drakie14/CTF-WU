import { getCollection, type CollectionEntry } from 'astro:content';
import { buildTaxonomy, type Taxonomy } from './content/tags';

export type Post = CollectionEntry<'posts'>;

/** Bài thiếu title, CTF hoặc category → nhóm "Chưa phân loại" (mục 41). */
export function isUnsorted(post: Post): boolean {
  return post.data.titleInferred || !post.data.ctf || !post.data.category;
}

export interface SiteContent {
  /** Mọi bài, mới nhất trước. */
  posts: Post[];
  tags: Taxonomy;
  ctfs: Taxonomy;
}

let cache: Promise<SiteContent> | undefined;

/** Tính toàn bộ dữ liệu dùng chung một lần mỗi build. */
export function getSiteContent(): Promise<SiteContent> {
  cache ??= (async () => {
    const posts = (await getCollection('posts')).sort(
      (a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id),
    );
    const tags = buildTaxonomy(posts.flatMap((p) => p.data.tags), 'tag');
    const ctfs = buildTaxonomy(posts.map((p) => p.data.ctf).filter(Boolean), 'ctf');
    for (const w of [...tags.warnings, ...ctfs.warnings]) console.warn(w);
    return { posts, tags, ctfs };
  })();
  return cache;
}

export const postUrl = (post: Post) => `/posts/${post.id}/`;
