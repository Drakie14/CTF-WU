import { getCollection, type CollectionEntry } from 'astro:content';
import { buildTaxonomy, type Taxonomy } from './content/tags';

export type Post = CollectionEntry<'posts'>;

/** Bài thiếu title, CTF hoặc category → nhóm "Chưa phân loại" (mục 41). */
export function isUnsorted(post: Post): boolean {
  return post.data.titleInferred || !post.data.ctf || !post.data.category;
}

export interface PostGroup {
  /** Khóa ổn định (dùng cho id/aria). */
  key: string;
  label: string;
  unsorted: boolean;
  posts: Post[];
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

/**
 * Nhóm sidebar (mục 18): "Chưa phân loại" ở đầu (nếu có), sau đó theo CTF;
 * nhóm có bài mới nhất đứng trước, trong nhóm bài mới nhất trước.
 * `posts` phải đã được sắp xếp mới nhất trước.
 */
export function groupPosts(posts: Post[], ctfs: Taxonomy): PostGroup[] {
  const unsorted: Post[] = [];
  const byCtf = new Map<string, PostGroup>();
  for (const post of posts) {
    if (isUnsorted(post)) {
      unsorted.push(post);
      continue;
    }
    const slug = ctfs.slugOf(post.data.ctf);
    let group = byCtf.get(slug);
    if (!group) {
      group = { key: `ctf-${slug}`, label: ctfs.bySlug.get(slug)?.name ?? post.data.ctf, unsorted: false, posts: [] };
      byCtf.set(slug, group);
    }
    group.posts.push(post);
  }
  const groups = [...byCtf.values()];
  return unsorted.length ? [{ key: 'unsorted', label: 'Chưa phân loại', unsorted: true, posts: unsorted }, ...groups] : groups;
}

export const postUrl = (post: Post) => `/posts/${post.id}/`;
