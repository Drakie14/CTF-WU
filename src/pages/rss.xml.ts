import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { SITE } from '../config/site';
import { categoryLabel } from '../lib/categories';
import { getSiteContent, postUrl } from '../lib/posts';

/**
 * `/rss.xml` — sinh lúc build từ toàn bộ bài (mới nhất trước).
 * Chỉ đưa summary (không đưa toàn văn): summary tự động không bao giờ chứa nội dung
 * spoiler/callout, nên flag không bị lộ qua RSS reader.
 */
export const GET: APIRoute = async (context) => {
  const { posts } = await getSiteContent();
  return rss({
    title: SITE.name,
    description: SITE.description,
    site: context.site ?? context.url.origin,
    trailingSlash: true,
    items: posts.map((post) => ({
      title: post.data.ctf ? `${post.data.title} - ${post.data.ctf}` : post.data.title,
      link: postUrl(post),
      pubDate: post.data.date,
      description: post.data.summary,
      categories: [
        ...(post.data.category ? [categoryLabel(post.data.category)] : []),
        ...(post.data.ctf ? [post.data.ctf] : []),
        ...post.data.tags,
      ],
    })),
    customData: `<language>${SITE.lang}</language>`,
  });
};
