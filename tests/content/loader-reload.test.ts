import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { LoaderContext } from 'astro/loaders';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatIsoDate } from '../../src/lib/content/dates';
import { postsLoader } from '../../src/lib/content/loader';
import { activityGrid } from '../../src/lib/stats';

describe('live content updates', () => {
  let root = '';

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
    if (root) await rm(root, { recursive: true, force: true });
  });

  async function setup() {
    root = await mkdtemp(path.join(tmpdir(), 'blog-reload-'));
    await writeFile(path.join(root, 'old.md'), '---\ntitle: Old\ndate: 2026-11-07\n---\nOld post');
    vi.useFakeTimers();
    const watcher = Object.assign(new EventEmitter(), { add: vi.fn() });
    const entries = new Map<string, { data: { date: Date; title: string } }>();
    const renderMarkdown = vi.fn(async () => ({ html: '<p>Post</p>', metadata: {} }));
    const error = vi.fn();
    const context = {
      config: { root: pathToFileURL(`${root}/`) },
      watcher,
      store: {
        keys: () => entries.keys(),
        set: (entry: { id: string; data: { date: Date; title: string } }) => entries.set(entry.id, entry),
        delete: (id: string) => entries.delete(id),
      },
      logger: { info: vi.fn(), warn: vi.fn(), error },
      parseData: async ({ data }: { data: unknown }) => data,
      generateDigest: (value: string) => value,
      renderMarkdown,
    } as unknown as LoaderContext;
    await postsLoader({ base: '.' }).load(context);
    return { watcher, entries, renderMarkdown, error };
  }

  it('polls for a new post even when the filesystem watcher misses it', async () => {
    const { entries } = await setup();
    await writeFile(path.join(root, 'new.md'), '---\ntitle: New\ndate: 2026-11-08\n---\nNew post');
    await vi.advanceTimersByTimeAsync(3100);
    await vi.waitFor(() => expect(entries.has('new')).toBe(true));
    const activity = activityGrid(
      [...entries.values()].map(({ data }) => ({ iso: formatIsoDate(data.date), title: data.title })),
      '2026-11-08', 1,
    );
    expect(activity.total).toBe(2);
    expect(activity.columns[0]!.at(-1)!.items.map((post) => post.title)).toEqual(['New']);
  });

  it('retries a failed reload without requiring another edit or watcher event', async () => {
    const { watcher, entries, renderMarkdown, error } = await setup();
    const file = path.join(root, 'new.md');
    await writeFile(file, '---\ntitle: New\ndate: 2026-11-08\n---\nNew post');
    renderMarkdown.mockRejectedValueOnce(new Error('ENOENT: file temporarily unavailable during sync'));
    watcher.emit('add', file);
    await vi.advanceTimersByTimeAsync(100);
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(entries.has('new')).toBe(false);

    await vi.advanceTimersByTimeAsync(3100);
    await vi.waitFor(() => expect(entries.has('new')).toBe(true));
    expect(entries.get('new')!.data.title).toBe('New');
  });
});
