import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * Lấy ngày commit đầu tiên (commit thêm file) cho mọi file trong một thư mục
 * bằng MỘT lệnh `git log` duy nhất. Trả về Map<absolutePath(normalized), Date>.
 * Không bao giờ throw: nếu Git không khả dụng thì trả Map rỗng (fallback mtime).
 */

const execGit = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execGit('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/** Key chuẩn hóa để so sánh đường dẫn (Windows không phân biệt hoa thường). */
export function pathKey(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

let unshallowTried = false;

/**
 * Trên CI (Cloudflare Pages) repo có thể là shallow clone → thiếu commit đầu tiên.
 * Thử `git fetch --unshallow` một lần; lỗi thì bỏ qua.
 */
async function ensureFullHistory(cwd: string, log: (msg: string) => void): Promise<void> {
  if (unshallowTried) return;
  unshallowTried = true;
  if (!process.env.CI && !process.env.CF_PAGES) return;
  try {
    if ((await git(['rev-parse', '--is-shallow-repository'], cwd)).trim() !== 'true') return;
    log('[content] shallow Git clone detected, fetching full history for post dates...');
    await execGit('git', ['fetch', '--unshallow', '--quiet'], { cwd, timeout: 120_000 });
  } catch {
    log('[content] could not fetch full Git history; falling back to file modification dates where needed');
  }
}

export async function getGitFirstCommitDates(dir: string, log: (msg: string) => void = () => {}): Promise<Map<string, Date>> {
  const result = new Map<string, Date>();
  let top: string;
  try {
    top = (await git(['rev-parse', '--show-toplevel'], dir)).trim();
  } catch {
    return result;
  }
  await ensureFullHistory(top, log);

  let out: string;
  try {
    out = await git(
      ['log', '--diff-filter=A', '--no-renames', '--format=%x01%aI', '--name-only', '--', path.relative(top, dir) || '.'],
      top,
    );
  } catch {
    return result;
  }

  // Log mới nhất trước → lần gặp cuối cùng của một file là commit thêm file sớm nhất.
  let current: Date | null = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('\u0001')) {
      const d = new Date(line.slice(1).trim());
      current = Number.isNaN(d.getTime()) ? null : d;
      continue;
    }
    const file = line.trim();
    if (!file || !current) continue;
    result.set(pathKey(path.join(top, file)), current);
  }
  return result;
}
