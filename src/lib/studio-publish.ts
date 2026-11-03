export type StudioApi = <T>(path: string, init?: RequestInit) => Promise<T>;
interface ArticleChange {
  path: string;
  source: string;
  expectedSha?: string;
  branch: string;
  message: string;
  blobs: Array<{ path: string; content: string }>;
}
/** Ghi cả bài và asset trong một commit, luôn kiểm lại bản gốc và không force-push. */
export async function publishArticle(api: StudioApi, change: ArticleChange) {
  const ref = await api<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(change.branch)}`);
  const contentsPath = `/contents/${change.path.split('/').map(encodeURIComponent).join('/')}`;
  if (change.expectedSha) {
    const current = await api<{ sha: string }>(`${contentsPath}?ref=${ref.object.sha}`).catch(
      (error: Error) => {
        if (!error.message.startsWith('GitHub 404')) throw error;
        return undefined;
      },
    );
    if (current?.sha !== change.expectedSha)
      throw new Error(
        'Bài trên GitHub đã đổi hoặc bị xoá từ lúc mở. Giữ bản nháp và mở lại bài trước khi Publish để tránh ghi đè.',
      );
  } else {
    const current = await api<{ sha: string }>(`${contentsPath}?ref=${ref.object.sha}`).catch(
      (error: Error) => {
        if (!error.message.startsWith('GitHub 404')) throw error;
        return undefined;
      },
    );
    if (current)
      throw new Error('Đường dẫn bài đã tồn tại trên GitHub; đổi tiêu đề hoặc mở bài có sẵn để sửa.');
  }
  const parent = await api<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
  const blobs = await Promise.all(
    change.blobs.map(async (item) => {
      const blob = await api<{ sha: string }>('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: item.content, encoding: 'base64' }),
      });
      return { path: item.path, mode: '100644', type: 'blob', sha: blob.sha };
    }),
  );
  const tree = await api<{ sha: string }>('/git/trees', {
    method: 'POST',
    body: JSON.stringify({
      base_tree: parent.tree.sha,
      tree: [{ path: change.path, mode: '100644', type: 'blob', content: change.source }, ...blobs],
    }),
  });
  const commit = await api<{ sha: string; html_url: string }>('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message: change.message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await api(`/git/refs/heads/${encodeURIComponent(change.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit;
}
