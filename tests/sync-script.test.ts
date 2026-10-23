import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sync } from '../scripts/sync.mjs';

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'sync-'));
  const origin = join(base, 'origin.git'), work = join(base, 'work'), other = join(base, 'other');
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  git(base, 'clone', '-q', origin, work);
  mkdirSync(join(work, 'src/content/posts'), { recursive: true });
  writeFileSync(join(work, 'src/content/posts/a.md'), 'a');
  git(work, 'add', '.'); git(work, 'commit', '-qm', 'init'); git(work, 'push', '-q', 'origin', 'main');
  git(base, 'clone', '-q', origin, other);
  return { work, other };
}
const publish = (other: string, rel: string, text: string) => {
  mkdirSync(join(other, 'src/content/posts', rel, '..'), { recursive: true });
  writeFileSync(join(other, 'src/content/posts', rel), text);
  git(other, 'add', '.'); git(other, 'commit', '-qm', 'publish'); git(other, 'push', '-q', 'origin', 'main');
};

describe('sync', () => {
  it('replaces untracked files identical to origin, then pulls', async () => {
    const { work, other } = setup();
    publish(other, 'x/index.md', 'giống');
    mkdirSync(join(work, 'src/content/posts/x'), { recursive: true });
    writeFileSync(join(work, 'src/content/posts/x/index.md'), 'giống');
    const result = await sync(work);
    expect(result.ok).toBe(true);
    expect(result.removed).toEqual(['src/content/posts/x/index.md']);
    expect(readFileSync(join(work, 'src/content/posts/x/index.md'), 'utf8')).toBe('giống');
    expect(git(work, 'status', '--porcelain')).toBe('');
  });

  it('stops and touches nothing when a local file differs from origin', async () => {
    const { work, other } = setup();
    publish(other, 'x/index.md', 'bản đã publish');
    mkdirSync(join(work, 'src/content/posts/x'), { recursive: true });
    writeFileSync(join(work, 'src/content/posts/x/index.md'), 'chỉnh sửa chưa publish');
    writeFileSync(join(work, 'src/content/posts/draft.md'), 'nháp khác');
    const result = await sync(work);
    expect(result.ok).toBe(false);
    expect(result.kept).toEqual(['src/content/posts/x/index.md']);
    expect(readFileSync(join(work, 'src/content/posts/x/index.md'), 'utf8')).toBe('chỉnh sửa chưa publish');
    expect(readFileSync(join(work, 'src/content/posts/draft.md'), 'utf8')).toBe('nháp khác');
  });

  it('keeps unpublished drafts and unstaged edits while pulling', async () => {
    const { work, other } = setup();
    publish(other, 'y.md', 'mới');
    writeFileSync(join(work, 'src/content/posts/draft.md'), 'nháp');
    writeFileSync(join(work, 'src/content/posts/a.md'), 'a sửa');
    const result = await sync(work);
    expect(result.ok).toBe(true);
    expect(readFileSync(join(work, 'src/content/posts/y.md'), 'utf8')).toBe('mới');
    expect(readFileSync(join(work, 'src/content/posts/draft.md'), 'utf8')).toBe('nháp');
    expect(readFileSync(join(work, 'src/content/posts/a.md'), 'utf8')).toBe('a sửa');
  });
});
