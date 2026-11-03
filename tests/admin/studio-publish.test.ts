import { expect, it, vi } from 'vitest';
import { publishArticle, type StudioApi } from '../../src/lib/studio-publish';
const change = {
  path: 'src/content/posts/Dreamhack/a/index.md',
  source: 'body',
  expectedSha: 'old',
  branch: 'main',
  message: 'content: sửa bài',
  blobs: [],
};
it('dừng trước khi ghi nếu bài trên remote đã đổi', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce({ object: { sha: 'head' } })
    .mockResolvedValueOnce({ sha: 'new' });
  await expect(publishArticle(api as StudioApi, change)).rejects.toThrow('đã đổi');
  expect(api).toHaveBeenCalledTimes(2);
});
it('chặn bài mới trùng đường dẫn dù danh sách Studio đã cũ', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce({ object: { sha: 'head' } })
    .mockResolvedValueOnce({ sha: 'exists' });
  await expect(publishArticle(api as StudioApi, { ...change, expectedSha: undefined })).rejects.toThrow(
    'đã tồn tại',
  );
  expect(api).toHaveBeenCalledTimes(2);
});
it('commit dùng head vừa đọc, chứa nguyên source và không force-push', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce({ object: { sha: 'head' } })
    .mockResolvedValueOnce({ sha: 'old' })
    .mockResolvedValueOnce({ tree: { sha: 'base' } })
    .mockResolvedValueOnce({ sha: 'tree' })
    .mockResolvedValueOnce({ sha: 'commit', html_url: 'https://example.com' })
    .mockResolvedValue({});
  await publishArticle(api as StudioApi, change);
  expect(JSON.parse(api.mock.calls[3][1].body).tree[0].content).toBe('body');
  expect(JSON.parse(api.mock.calls[4][1].body).parents).toEqual(['head']);
  expect(JSON.parse(api.mock.calls[5][1].body)).toEqual({ sha: 'commit', force: false });
});
