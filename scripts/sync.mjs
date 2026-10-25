// Đồng bộ local ↔ GitHub sau khi Studio publish thẳng lên remote.
// File bài chưa được git theo dõi mà giống hệt bản trên origin sẽ chặn `git pull`; script xoá đúng những file đó
// (nội dung vẫn nằm trong origin nên pull trả lại nguyên vẹn), rồi pull --rebase. File nào khác bản origin
// là chỉnh sửa chưa publish: không đụng tới, dừng lại và báo.
import { execFile } from 'node:child_process';
import { open, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const POSTS = 'src/content/posts';

/** @param {string} root @param {string[]} args @param {{ buffer?: boolean }} [options] */
function git(root, args, { buffer = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args.join(' ')}: ${String(stderr || error.message).trim()}`));
      else resolve(stdout);
    });
  });
}

/** Khoá giữa các process (dev server, endpoint Studio, service blog-sync): hai lần sync song song có thể `rm` file mà lần kia vừa pull thành tracked. @param {string} lock */
async function acquire(lock) {
  try { await (await open(lock, 'wx')).close(); return true; } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
  }
  // Khoá còn sót khi process chết giữa chừng: quá 10 phút coi như hết hạn.
  const { mtimeMs } = await stat(lock).catch(() => ({ mtimeMs: Date.now() }));
  if (Date.now() - mtimeMs < 10 * 60_000) return false;
  await rm(lock, { force: true });
  return open(lock, 'wx').then((handle) => handle.close().then(() => true), () => false);
}

/** @param {string} root @returns {Promise<{ ok: boolean; message: string; removed: string[]; kept: string[] }>} */
export async function sync(root) {
  const removed = [];
  const kept = [];
  let lock;
  try {
    lock = resolve(root, String(await git(root, ['rev-parse', '--git-path', 'blog-sync.lock'])).trim());
    if (!(await acquire(lock))) {
      lock = undefined;
      return { ok: false, removed, kept, message: 'Đang có lần sync khác chạy; bỏ qua lần này.' };
    }
    await git(root, ['fetch', '-q']);
    const branch = String(await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    const remote = `origin/${branch}`;
    const untracked = String(await git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', POSTS])).split('\0').filter(Boolean);
    const inRemote = new Set(String(await git(root, ['ls-tree', '-r', '--name-only', '-z', remote, '--', POSTS])).split('\0').filter(Boolean));
    for (const path of untracked) {
      if (!inRemote.has(path)) continue;
      const [local, upstream] = await Promise.all([readFile(join(root, path)), git(root, ['show', `${remote}:${path}`], { buffer: true })]);
      (local.equals(upstream) ? removed : kept).push(path);
    }
    if (kept.length) {
      return { ok: false, removed: [], kept, message: `Dừng lại: ${kept.length} file local khác bản trên GitHub (chỉnh sửa chưa publish): ${kept.join(', ')}` };
    }
    for (const path of removed) await rm(join(root, path));
    await git(root, ['pull', '--rebase', '--autostash', '-q']);
    return { ok: true, removed, kept, message: removed.length ? `Đã đồng bộ, ${removed.length} file local giống GitHub được thay bằng bản git theo dõi.` : 'Đã đồng bộ với GitHub.' };
  } catch (error) {
    return { ok: false, removed, kept, message: error instanceof Error ? error.message : String(error) };
  } finally {
    if (lock) await rm(lock, { force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await sync(process.cwd());
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
}
