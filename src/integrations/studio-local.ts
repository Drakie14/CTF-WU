import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Studio local (chỉ khi `npm run dev`): Studio gọi các endpoint ở đây thay cho GitHub API và File System Access API.
 * - /__studio/git/* giả lập đúng phần GitHub REST mà `api()` của Studio dùng (ref, tree, contents, blob, commit, PATCH ref)
 *   trên git của máy: đọc từ origin/<branch>, tạo object bằng plumbing, PATCH ref = `git push` (origin phải fast-forward).
 *   Studio không cần GitHub token; sau Publish, /__studio/sync pull về như luồng cũ.
 * - /__studio/fs/* đọc/ghi thẳng src/content/posts: không phải chọn thư mục, không xin quyền, không có handle chết khi dời thư mục.
 */

type Repo = { name: string; branch: string };
type Middleware = (request: IncomingMessage, response: ServerResponse) => void;

const POSTS = 'src/content/posts';
const SHA = /^[0-9a-f]{40}$/;
const ZERO = '0'.repeat(40);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_BODY = 64 * 1024 * 1024;
const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  svg: 'image/svg+xml', md: 'text/markdown; charset=utf-8', txt: 'text/plain; charset=utf-8',
};

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const hostname = (value: string | undefined, hasScheme: boolean) => {
  try { return value ? new URL(hasScheme ? value : `http://${value}`).hostname : ''; } catch { return ''; }
};

/**
 * Các endpoint /__studio/* chạy git, ghi file và push bằng credential trên máy nên chỉ nhận request của chính trang Studio:
 * Host/Origin phải là loopback (chặn DNS rebinding: tên miền lạ trỏ về 127.0.0.1 vẫn gửi Host lạ),
 * kèm Sec-Fetch-Site same-origin và header riêng như các endpoint cũ.
 */
export function isStudioRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  return LOOPBACK.has(hostname(request.headers.host, false))
    && (origin === undefined || LOOPBACK.has(hostname(origin, true)))
    && request.headers['sec-fetch-site'] === 'same-origin'
    && request.headers['x-studio-sync'] === '1';
}

function git(root: string, args: string[], options: { input?: Buffer | string; env?: NodeJS.ProcessEnv } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', args, {
      cwd: root, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024,
      // Thiếu credential thì báo lỗi thay vì treo chờ nhập mật khẩu.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...options.env },
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args[0]}: ${stderr.toString().trim() || error.message}`));
      else resolve(stdout);
    });
    // git thoát sớm (rev-parse không thấy path...) thì ghi stdin ném EPIPE; không bắt sẽ làm sập cả dev server. Lỗi thật đã có exit code.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(options.input);
  });
}

/** Đường dẫn tương đối: không rỗng, không `.`/`..`/`.git`, không `\` hay ký tự điều khiển. */
function cleanPath(value: string): string {
  const parts = value.split('/');
  if (!value || parts.some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' || /[\\\u0000-\u001f]/.test(part))) {
    throw new HttpError(422, `Đường dẫn không hợp lệ: ${value}`);
  }
  return value;
}

function postPath(value: string): string {
  if (!cleanPath(value).startsWith(`${POSTS}/`)) throw new HttpError(422, `Chỉ được đọc/ghi trong ${POSTS}: ${value}`);
  return value;
}

function decodePath(value: string): string {
  try { return value.split('/').map(decodeURIComponent).join('/'); } catch { throw new HttpError(400, `Đường dẫn không decode được: ${value}`); }
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Request quá lớn')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  try { return JSON.parse((await readBody(request)).toString('utf8')) as T; } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, 'Body không phải JSON');
  }
}

function sendJson(response: ServerResponse, status: number, data: unknown) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(data));
}

function guarded(handler: (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void>): Middleware {
  return (request, response) => {
    if (!isStudioRequest(request)) { response.statusCode = 403; response.end(); return; }
    const url = new URL(request.url ?? '/', 'http://localhost');
    handler(request, response, url).catch((error: unknown) => {
      sendJson(response, error instanceof HttpError ? error.status : 500, { message: error instanceof Error ? error.message : String(error) });
    });
  };
}

export function studioLocal(root: string, repo: Repo) {
  const { branch } = repo;
  const tracking = `refs/remotes/origin/${branch}`;
  const postsRoot = path.join(root, POSTS);
  let fetching: Promise<unknown> | undefined;

  const revParse = async (spec: string) => (await git(root, ['rev-parse', '--verify', '--quiet', spec])).toString().trim();
  const notFound = () => { throw new HttpError(404, 'Not Found'); };
  const hashObject = async (data: Buffer) => (await git(root, ['hash-object', '-w', '--stdin'], { input: data })).toString().trim();
  const resolveRef = (ref: string | null) => {
    if (!ref || ref === branch) return tracking;
    if (SHA.test(ref)) return ref;
    throw new HttpError(422, `ref không hợp lệ: ${ref}`);
  };
  /** Như GitHub: ref của nhánh là bản trên origin. Fetch lỗi (offline, đang có fetch khác giữ lock) thì dùng bản đã fetch gần nhất. */
  async function remoteHead(): Promise<string> {
    fetching ??= git(root, ['fetch', '--quiet', 'origin', branch]).catch(() => undefined).finally(() => { fetching = undefined; });
    await fetching;
    return revParse(`${tracking}^{commit}`);
  }

  async function gitRoute(request: IncomingMessage, url: URL): Promise<[number, unknown]> {
    const method = request.method ?? 'GET';
    const route = url.pathname;
    let match: RegExpExecArray | null;

    if (method === 'GET' && (match = /^\/git\/ref\/heads\/(.+)$/.exec(route))) {
      if (decodePath(match[1]) !== branch) notFound();
      return [200, { ref: `refs/heads/${branch}`, object: { sha: await remoteHead(), type: 'commit' } }];
    }
    if (method === 'GET' && (match = /^\/git\/trees\/([0-9a-f]{40})$/.exec(route))) {
      const recursive = url.searchParams.has('recursive') ? ['-r', '-t'] : [];
      const output = await git(root, ['ls-tree', ...recursive, '-z', match[1]]).catch(notFound);
      const tree = output.toString('utf8').split('\0').filter(Boolean).map((line) => {
        const tab = line.indexOf('\t');
        const [mode, type, sha] = line.slice(0, tab).split(' ');
        return { path: line.slice(tab + 1), mode, type, sha };
      });
      return [200, { sha: match[1], tree, truncated: false }];
    }
    if (method === 'GET' && (match = /^\/git\/blobs\/([0-9a-f]{40})$/.exec(route))) {
      const content = await git(root, ['cat-file', 'blob', match[1]]).catch(notFound);
      return [200, { sha: match[1], size: content.length, encoding: 'base64', content: content.toString('base64') }];
    }
    if (method === 'GET' && (match = /^\/git\/commits\/([0-9a-f]{40})$/.exec(route))) {
      const [sha, ...parents] = (await git(root, ['rev-list', '--parents', '-n', '1', match[1]]).catch(notFound)).toString().trim().split(' ');
      return [200, { sha, tree: { sha: await revParse(`${match[1]}^{tree}`) }, parents: parents.map((parent) => ({ sha: parent })) }];
    }
    if (method === 'GET' && route.startsWith('/contents/')) {
      const file = postPath(decodePath(route.slice('/contents/'.length)));
      const sha = await revParse(`${resolveRef(url.searchParams.get('ref'))}:${file}`).catch(notFound);
      if ((await git(root, ['cat-file', '-t', sha])).toString().trim() !== 'blob') notFound();
      const content = await git(root, ['cat-file', 'blob', sha]);
      return [200, { type: 'file', name: path.posix.basename(file), path: file, sha, size: content.length, encoding: 'base64', content: content.toString('base64') }];
    }
    if (method === 'POST' && route === '/git/blobs') {
      const data = await readJson<{ content?: unknown; encoding?: unknown }>(request);
      if (typeof data.content !== 'string') throw new HttpError(422, 'Thiếu content');
      return [201, { sha: await hashObject(Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8')) }];
    }
    if (method === 'POST' && route === '/git/trees') {
      type Entry = { path?: unknown; mode?: unknown; type?: unknown; sha?: unknown; content?: unknown };
      const data = await readJson<{ base_tree?: unknown; tree?: unknown }>(request);
      if (typeof data.base_tree !== 'string' || !SHA.test(data.base_tree) || !Array.isArray(data.tree)) throw new HttpError(422, 'Thiếu base_tree hoặc tree');
      const lines: string[] = [];
      for (const entry of data.tree as Entry[]) {
        const file = postPath(String(entry.path ?? ''));
        if (entry.type !== 'blob' || (entry.mode !== '100644' && entry.mode !== '100755')) throw new HttpError(422, `Entry không hỗ trợ: ${file}`);
        if (entry.sha === null) { lines.push(`0 ${ZERO}\t${file}`); continue; }
        const sha = typeof entry.content === 'string' ? await hashObject(Buffer.from(entry.content, 'utf8')) : entry.sha;
        if (typeof sha !== 'string' || !SHA.test(sha)) throw new HttpError(422, `Thiếu sha hoặc content: ${file}`);
        lines.push(`${entry.mode} ${sha}\t${file}`);
      }
      // Dựng tree trong index tạm: không đụng index hay working tree đang dùng.
      const dir = await mkdtemp(path.join(tmpdir(), 'studio-index-'));
      try {
        const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
        await git(root, ['read-tree', data.base_tree], { env });
        await git(root, ['update-index', '-z', '--index-info'], { env, input: lines.map((line) => `${line}\0`).join('') });
        const sha = (await git(root, ['write-tree'], { env })).toString().trim();
        return [201, { sha, tree: [] }];
      } catch (error) {
        throw new HttpError(422, error instanceof Error ? error.message : String(error));
      } finally { await rm(dir, { recursive: true, force: true }); }
    }
    if (method === 'POST' && route === '/git/commits') {
      const data = await readJson<{ message?: unknown; tree?: unknown; parents?: unknown }>(request);
      const parents = Array.isArray(data.parents) ? data.parents : [];
      if (typeof data.message !== 'string' || !data.message.trim() || typeof data.tree !== 'string' || !SHA.test(data.tree)
        || !parents.length || !parents.every((parent) => typeof parent === 'string' && SHA.test(parent))) {
        throw new HttpError(422, 'Thiếu message, tree hoặc parents');
      }
      const args = ['commit-tree', data.tree, ...(parents as string[]).flatMap((parent) => ['-p', parent]), '-F', '-'];
      const sha = (await git(root, args, { input: data.message })).toString().trim();
      return [201, { sha, html_url: `https://github.com/${repo.name}/commit/${sha}`, tree: { sha: data.tree }, parents: (parents as string[]).map((parent) => ({ sha: parent })) }];
    }
    if (method === 'PATCH' && (match = /^\/git\/refs\/heads\/(.+)$/.exec(route))) {
      if (decodePath(match[1]) !== branch) notFound();
      const data = await readJson<{ sha?: unknown; force?: unknown }>(request);
      if (typeof data.sha !== 'string' || !SHA.test(data.sha)) throw new HttpError(422, 'Thiếu sha');
      if (data.force) throw new HttpError(422, 'Studio local không force push');
      // POST /git/commits nhận tree bất kỳ trong object DB: chặn ở đây để thứ được push chỉ đổi file trong posts.
      if (!(await git(root, ['merge-base', '--is-ancestor', tracking, data.sha]).then(() => true, () => false))) {
        throw new HttpError(422, 'Update is not a fast forward');
      }
      const changed = (await git(root, ['diff', '--no-renames', '--name-only', '-z', tracking, data.sha])).toString('utf8').split('\0').filter(Boolean);
      const outside = changed.filter((file) => !file.startsWith(`${POSTS}/`));
      if (outside.length) throw new HttpError(422, `Commit đổi file ngoài ${POSTS}: ${outside.slice(0, 5).join(', ')}`);
      try {
        await git(root, ['push', '--quiet', 'origin', `${data.sha}:refs/heads/${branch}`]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Cùng thông điệp với GitHub để Studio xử lý như cũ.
        if (/non-fast-forward|fetch first|\[rejected\]/i.test(message)) throw new HttpError(422, 'Update is not a fast forward');
        throw new HttpError(502, message);
      }
      return [200, { ref: `refs/heads/${branch}`, object: { sha: data.sha, type: 'commit' } }];
    }
    return notFound();
  }

  /** Đường dẫn trong posts; tổ tiên gần nhất đang tồn tại phải nằm trong posts (chặn symlink trỏ ra ngoài). */
  async function postsTarget(relative: string | null, allowRoot = false): Promise<string> {
    if (!relative) {
      if (allowRoot) return postsRoot;
      throw new HttpError(422, 'Thiếu đường dẫn');
    }
    const target = path.join(postsRoot, ...cleanPath(relative).split('/'));
    const base = await realpath(postsRoot);
    for (let probe = target; ; probe = path.dirname(probe)) {
      const real = await realpath(probe).catch(() => undefined);
      if (real === undefined) continue;
      if (real !== base && !real.startsWith(`${base}${path.sep}`)) throw new HttpError(422, `Ngoài thư mục posts: ${relative}`);
      return target;
    }
  }

  const fsError = (error: unknown): never => {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new HttpError(404, 'Not Found');
    if (code === 'EISDIR' || code === 'ENOTDIR' || code === 'EEXIST' || code === 'ENOTEMPTY') throw new HttpError(409, code);
    throw error;
  };

  async function fsRoute(request: IncomingMessage, response: ServerResponse, url: URL) {
    const method = request.method ?? 'GET';
    const relative = url.searchParams.get('path');
    const done = () => { response.statusCode = 204; response.end(); };
    switch (`${method} ${url.pathname}`) {
      case 'GET /stat': {
        // Không có thì trả kind null thay vì 404: trình duyệt in mọi response 404 ra console, kể cả khi đã xử lý.
        const info = await stat(await postsTarget(relative, true)).catch(() => undefined);
        return sendJson(response, 200, { kind: info?.isDirectory() ? 'directory' : info?.isFile() ? 'file' : null });
      }
      case 'GET /entries': {
        const entries = await readdir(await postsTarget(relative, true), { withFileTypes: true }).catch(fsError);
        return sendJson(response, 200, entries.filter((entry) => entry.isFile() || entry.isDirectory())
          .map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' })));
      }
      case 'GET /file': {
        const target = await postsTarget(relative);
        const data = await readFile(target).catch(fsError);
        response.statusCode = 200;
        response.setHeader('content-type', TYPES[path.extname(target).slice(1).toLowerCase()] ?? 'application/octet-stream');
        response.setHeader('cache-control', 'no-store');
        response.end(data);
        return;
      }
      case 'PUT /file': {
        const target = await postsTarget(relative);
        const data = await readBody(request);
        await mkdir(path.dirname(target), { recursive: true }).catch(fsError);
        await writeFile(target, data).catch(fsError);
        return done();
      }
      case 'POST /dir': {
        await mkdir(await postsTarget(relative), { recursive: true }).catch(fsError);
        return done();
      }
      case 'DELETE /entry': {
        const target = await postsTarget(relative);
        const info = await stat(target).catch(fsError);
        if (info.isDirectory() && url.searchParams.get('recursive') !== '1' && (await readdir(target)).length) throw new HttpError(409, 'ENOTEMPTY');
        await rm(target, { recursive: info.isDirectory() }).catch(fsError);
        return done();
      }
      default:
        throw new HttpError(404, 'Not Found');
    }
  }

  return {
    /** Studio gọi lúc mở trang: 200 + JSON nghĩa là đang chạy qua dev server, dùng chế độ local. */
    probe: guarded(async (_request, response) => sendJson(response, 200, { ok: true, repo: repo.name, branch })),
    git: guarded(async (request, response, url) => {
      const [status, data] = await gitRoute(request, url);
      sendJson(response, status, data);
    }),
    fs: guarded(fsRoute),
  };
}
