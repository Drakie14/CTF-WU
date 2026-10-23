/** Cây thư mục của sidebar, dựng từ đường dẫn file bài (VD Dreamhack ▸ Class / C1). */

export interface TreeablePost {
  id: string;
  data: { sourcePath: string; ctf: string; date: Date };
}

export interface PostFolder<P extends TreeablePost = TreeablePost> {
  /** Khóa ổn định, dùng cho data-group và lưu trạng thái mở. */
  key: string;
  label: string;
  /** Bài nằm trực tiếp trong thư mục này, mới nhất trước. */
  posts: P[];
  children: PostFolder<P>[];
  /** Tổng số bài trong cả nhánh. */
  count: number;
  /** Ngày của bài mới nhất trong nhánh (để xếp nhánh mới lên trước). */
  latest: number;
}

/**
 * Thư mục chứa bài, tính từ sau `posts/`: `posts/Dreamhack/Class/C1/ptml/index.md`
 * → `['Dreamhack', 'Class', 'C1']`, `posts/PortSwigger/XSS.md` → `['PortSwigger']`.
 * Không có đường dẫn (dữ liệu cũ) thì dùng tên CTF.
 */
export function folderSegments(post: TreeablePost): string[] {
  const rel = /(?:^|\/)posts\/(.+)$/.exec(post.data.sourcePath.replace(/\\/g, '/'))?.[1];
  if (!rel) return post.data.ctf ? [post.data.ctf] : [];
  const segments = rel.split('/').filter(Boolean);
  segments.pop();
  if (/^index\.md$/i.test(rel.split('/').at(-1) ?? '')) segments.pop();
  return segments;
}

/**
 * Dựng cây từ danh sách bài (đã sắp mới nhất trước). Thư mục chỉ có đúng một
 * thư mục con và không có bài được gộp nhãn (`Class / C1`) cho đỡ một tầng bấm.
 */
export function buildPostTree<P extends TreeablePost>(posts: P[]): PostFolder<P>[] {
  const root: PostFolder<P> = { key: '', label: '', posts: [], children: [], count: 0, latest: 0 };
  const loose: P[] = [];
  for (const post of posts) {
    const segments = folderSegments(post);
    if (!segments.length) {
      loose.push(post);
      continue;
    }
    let node = root;
    for (const segment of segments) {
      const key = node.key ? `${node.key}/${segment}` : segment;
      let child = node.children.find((c) => c.key === key);
      if (!child) {
        child = { key, label: segment, posts: [], children: [], count: 0, latest: 0 };
        node.children.push(child);
      }
      node = child;
    }
    node.posts.push(post);
  }

  const finish = (node: PostFolder<P>): PostFolder<P> => {
    node.children = node.children.map(finish);
    while (!node.posts.length && node.children.length === 1 && node !== root) {
      const [only] = node.children as [PostFolder<P>];
      node.label = `${node.label} / ${only.label}`;
      node.key = only.key;
      node.posts = only.posts;
      node.children = only.children;
    }
    node.count = node.posts.length + node.children.reduce((n, c) => n + c.count, 0);
    node.latest = Math.max(0, ...node.posts.map((p) => p.data.date.getTime()), ...node.children.map((c) => c.latest));
    node.children.sort((a, b) => b.latest - a.latest || a.label.localeCompare(b.label));
    return node;
  };
  const tops = finish(root).children;
  // Bài nằm thẳng trong posts/ (không thư mục) gom vào một nhóm riêng ở cuối.
  if (loose.length) {
    tops.push({ key: '~', label: 'Khác', posts: loose, children: [], count: loose.length, latest: loose[0]!.data.date.getTime() });
  }
  return tops;
}

/** Khóa của mọi thư mục chứa bài `id` (từ gốc xuống), để mở sẵn nhánh đang đọc. */
export function branchKeys(tree: PostFolder[], id: string): string[] {
  for (const node of tree) {
    if (node.posts.some((p) => p.id === id)) return [node.key];
    const below = branchKeys(node.children, id);
    if (below.length) return [node.key, ...below];
  }
  return [];
}
