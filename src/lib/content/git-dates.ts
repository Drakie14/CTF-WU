import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Lấy ngày commit đầu tiên (commit thêm file) cho mọi file trong một thư mục
 * bằng MỘT lệnh `git log` duy nhất. Trả về Map<absolutePath(normalized), Date>.
 * Không bao giờ throw: nếu Git không khả dụng thì trả Map rỗng (fallback mtime).
 */

function git(args: string[], cwd: string): string {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
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
function ensureFullHistory(cwd: string, log: (msg: string) => void): void {
  if (unshallowTried) return;
  unshallowTried = true;
  if (!process.env.CI && !process.env.CF_PAGES) return;
  try {
    if (git(['rev-parse', '--is-shallow-repository'], cwd).trim() !== 'true') return;
    log('[content] shallow Git clone detected, fetching full history for post dates...');
    execFileSync('git', ['fetch', '--unshallow', '--quiet'], { cwd, stdio: 'ignore', timeout: 120_000 });
  } catch {
    log('[content] could not fetch full Git history; falling back to file modification dates where needed');
  }
}

export function getGitFirstCommitDates(dir: string, log: (msg: string) => void = () => {}): Map<string, Date> {
  const result = new Map<string, Date>();
  let top: string;
  try {
    top = git(['rev-parse', '--show-toplevel'], dir).trim();
  } catch {
    return result;
  }
  ensureFullHistory(top, log);

  let out: string;
  try {
    out = git(
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
