interface RelatedPost {
  id: string;
  data: { tags: string[]; category: string };
}

/**
 * Bài liên quan: điểm là tổng `1 / số bài có tag đó` của các tag chung, nên tag hiếm (GraphQL) nặng hơn
 * tag chung chung (Web); cùng category cộng thêm chút để phân xử. `posts` đã sắp mới nhất trước và sort
 * ổn định, nên điểm bằng nhau thì bài mới hơn đứng trước.
 */
export function relatedPosts<T extends RelatedPost>(post: T, posts: T[], tagKey: (tag: string) => string, limit = 3): T[] {
  const keys = (p: T) => new Set(p.data.tags.map(tagKey));
  const frequency = new Map<string, number>();
  for (const p of posts) for (const key of keys(p)) frequency.set(key, (frequency.get(key) ?? 0) + 1);
  const mine = keys(post);
  return posts
    .filter((other) => other.id !== post.id)
    .map((other) => {
      const shared = [...keys(other)].filter((key) => mine.has(key));
      const sameCategory = post.data.category !== '' && other.data.category === post.data.category;
      return { other, shared: shared.length, score: shared.reduce((sum, key) => sum + 1 / frequency.get(key)!, 0) + (sameCategory ? 0.01 : 0) };
    })
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ other }) => other);
}
