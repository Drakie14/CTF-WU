import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { studioLocal } from '../../src/integrations/studio-local';

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const POST = "src/content/posts/CTF Tournament/CSAW' 26 QUALS/bài một/index.md";
const SOURCE = '---\ntitle: Một\n---\n\nnội dung\n';
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'studio-local-'));
  const origin = join(base, 'origin.git'), work = join(base, 'work');
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  git(base, 'clone', '-q', origin, work);
  git(work, 'config', 'user.name', 't'); git(work, 'config', 'user.email', 't@t');
  mkdirSync(join(work, POST, '..'), { recursive: true });
  writeFileSync(join(work, POST), SOURCE);
  writeFileSync(join(work, 'package.json'), '{}');
  git(work, 'add', '.'); git(work, 'commit', '-qm', 'init'); git(work, 'push', '-q', 'origin', 'main');
  return { base, origin, work };
}

let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); server = undefined; }));

async function start(work: string) {
  const local = studioLocal(work, { name: 'o/r', branch: 'main' });
  const mounts = [['/__studio/local', local.probe], ['/__studio/git', local.git], ['/__studio/fs', local.fs]] as const;
  // Giống connect của Vite: bỏ tiền tố mount khỏi request.url.
  server = createServer((request, response) => {
    const mount = mounts.find(([prefix]) => request.url?.startsWith(prefix));
    if (!mount) { response.statusCode = 404; response.end(); return; }
    request.url = request.url!.slice(mount[0].length) || '/';
    mount[1](request, response);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const call = (path: string, init: { method?: string; body?: string | Buffer; headers?: Record<string, string> } = {}) =>
    new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
      const request = httpRequest({ host: '127.0.0.1', port, path, method: init.method ?? 'GET', headers: { host: `localhost:${port}`, 'sec-fetch-site': 'same-origin', 'x-studio-sync': '1', ...init.headers } }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks) }));
      });
      request.on('error', reject);
      request.end(init.body);
    });
  const api = async <T>(path: string, method = 'GET', data?: unknown) => {
    const reply = await call(`/__studio/git${path}`, { method, body: data === undefined ? undefined : JSON.stringify(data) });
    return { status: reply.status, data: (reply.body.length ? JSON.parse(reply.body.toString('utf8')) : {}) as T };
  };
  return { call, api, port };
}

describe('studio local: GitHub API trên git của máy', () => {
  it('đọc ref, tree và contents của origin giống GitHub', async () => {
    const { work } = setup();
    const { api, call } = await start(work);
    expect(JSON.parse((await call('/__studio/local')).body.toString())).toEqual({ ok: true, repo: 'o/r', branch: 'main' });
    const ref = await api<{ object: { sha: string } }>('/git/ref/heads/main');
    expect(ref.data.object.sha).toBe(git(work, 'rev-parse', 'origin/main'));
    const tree = await api<{ tree: Array<{ path: string; type: string }> }>(`/git/trees/${ref.data.object.sha}?recursive=1`);
    expect(tree.data.tree).toContainEqual(expect.objectContaining({ path: POST, type: 'blob' }));
    expect(tree.data.tree).toContainEqual(expect.objectContaining({ path: 'src/content/posts', type: 'tree' }));
    const file = await api<{ content: string; sha: string }>(`/contents/${encodePath(POST)}?ref=main`);
    expect(Buffer.from(file.data.content, 'base64').toString('utf8')).toBe(SOURCE);
    expect((await api<{ message: string }>(`/contents/${encodePath('src/content/posts/khong-co.md')}?ref=main`)).status).toBe(404);
    expect((await api('/contents/package.json?ref=main')).status).toBe(422);
  });

  it('publish: blob, tree, commit rồi PATCH ref = push lên origin, không đụng working tree', async () => {
    const { origin, work } = setup();
    const { api } = await start(work);
    const parent = (await api<{ object: { sha: string } }>('/git/ref/heads/main')).data.object.sha;
    const baseTree = (await api<{ tree: { sha: string } }>(`/git/commits/${parent}`)).data.tree.sha;
    const image = await api<{ sha: string }>('/git/blobs', 'POST', { content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'), encoding: 'base64' });
    expect(image.status).toBe(201);
    const next = "src/content/posts/CTF Tournament/CSAW' 26 QUALS/bài hai";
    const tree = await api<{ sha: string }>('/git/trees', 'POST', { base_tree: baseTree, tree: [
      { path: `${next}/index.md`, mode: '100644', type: 'blob', content: 'mới\n' },
      { path: `${next}/a.png`, mode: '100644', type: 'blob', sha: image.data.sha },
      { path: POST, mode: '100644', type: 'blob', sha: null },
    ] });
    expect(tree.status).toBe(201);
    const commit = await api<{ sha: string; html_url: string }>('/git/commits', 'POST', { message: 'content: thêm "bài hai"', tree: tree.data.sha, parents: [parent] });
    expect(commit.data.html_url).toBe(`https://github.com/o/r/commit/${commit.data.sha}`);
    expect((await api('/git/refs/heads/main', 'PATCH', { sha: commit.data.sha })).status).toBe(200);

    expect(git(origin, 'rev-parse', 'main')).toBe(commit.data.sha);
    expect(git(origin, 'show', `main:${next}/index.md`)).toBe('mới');
    expect(git(origin, 'ls-tree', '-r', '--name-only', 'main')).not.toContain('bài một');
    expect(git(work, 'rev-parse', 'origin/main')).toBe(commit.data.sha);
    expect(git(work, 'status', '--porcelain')).toBe('');
    const published = await api<{ sha: string }>(`/contents/${encodePath(`${next}/index.md`)}?ref=${commit.data.sha}`);
    expect(published.status).toBe(200);
  });

  it('origin đã có commit khác: PATCH ref trả 422 như GitHub, không force', async () => {
    const { base, origin, work } = setup();
    const { api } = await start(work);
    const parent = (await api<{ object: { sha: string } }>('/git/ref/heads/main')).data.object.sha;
    const other = join(base, 'other');
    git(base, 'clone', '-q', origin, other);
    git(other, 'config', 'user.name', 't'); git(other, 'config', 'user.email', 't@t');
    git(other, 'commit', '-q', '--allow-empty', '-m', 'publish ở thiết bị khác'); git(other, 'push', '-q', 'origin', 'main');
    const tree = (await api<{ tree: { sha: string } }>(`/git/commits/${parent}`)).data.tree.sha;
    const commit = await api<{ sha: string }>('/git/commits', 'POST', { message: 'x', tree, parents: [parent] });
    const reply = await api<{ message: string }>('/git/refs/heads/main', 'PATCH', { sha: commit.data.sha });
    expect(reply).toEqual({ status: 422, data: { message: 'Update is not a fast forward' } });
    expect((await api('/git/refs/heads/main', 'PATCH', { sha: commit.data.sha, force: true })).status).toBe(422);
    expect(git(origin, 'log', '-1', '--format=%s', 'main')).toBe('publish ở thiết bị khác');
  });

  it('chỉ cho ghi tree entry trong src/content/posts', async () => {
    const { work } = setup();
    const { api } = await start(work);
    const parent = (await api<{ object: { sha: string } }>('/git/ref/heads/main')).data.object.sha;
    const baseTree = (await api<{ tree: { sha: string } }>(`/git/commits/${parent}`)).data.tree.sha;
    for (const path of ['.github/workflows/x.yml', 'package.json', 'src/content/posts/../../package.json', 'src/content/posts/.git/config']) {
      const reply = await api('/git/trees', 'POST', { base_tree: baseTree, tree: [{ path, mode: '100644', type: 'blob', content: 'x' }] });
      expect(reply.status, path).toBe(422);
    }
  });

  it('PATCH ref không push commit đổi file ngoài posts, kể cả khi tree dựng sẵn trong object DB', async () => {
    const { origin, work } = setup();
    const { api } = await start(work);
    const parent = (await api<{ object: { sha: string } }>('/git/ref/heads/main')).data.object.sha;
    writeFileSync(join(work, 'package.json'), '{"scripts":{"x":"evil"}}');
    git(work, 'commit', '-qam', 'local');
    const tree = git(work, 'rev-parse', 'HEAD^{tree}');
    const commit = await api<{ sha: string }>('/git/commits', 'POST', { message: 'x', tree, parents: [parent] });
    expect(commit.status).toBe(201);
    const reply = await api<{ message: string }>('/git/refs/heads/main', 'PATCH', { sha: commit.data.sha });
    expect(reply.status).toBe(422);
    expect(reply.data.message).toContain('package.json');
    expect(git(origin, 'rev-parse', 'main')).toBe(parent);
  });

  it('chặn request không đến từ trang Studio (DNS rebinding, trang khác)', async () => {
    const { work } = setup();
    const { call, port } = await start(work);
    expect((await call('/__studio/local')).status).toBe(200);
    expect((await call('/__studio/local', { headers: { host: `evil.example:${port}` } })).status).toBe(403);
    expect((await call('/__studio/local', { headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call('/__studio/local', { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect((await call('/__studio/local', { headers: { 'x-studio-sync': '' } })).status).toBe(403);
    expect((await call('/__studio/local', { headers: { host: `127.0.0.1:${port}`, origin: `http://[::1]:${port}` } })).status).toBe(200);
  });

  it('fs: ghi, liệt kê, đọc, xoá trong posts; chặn thoát ra ngoài', async () => {
    const { work } = setup();
    const { call } = await start(work);
    const posts = join(work, 'src/content/posts');
    const put = await call(`/__studio/fs/file?path=${encodeURIComponent('Mới/x/index.md')}`, { method: 'PUT', body: Buffer.from('xin chào') });
    expect(put.status).toBe(204);
    expect(readFileSync(join(posts, 'Mới/x/index.md'), 'utf8')).toBe('xin chào');
    expect(JSON.parse((await call(`/__studio/fs/entries?path=${encodeURIComponent('Mới/x')}`)).body.toString())).toEqual([{ name: 'index.md', kind: 'file' }]);
    expect((await call(`/__studio/fs/file?path=${encodeURIComponent('Mới/x/index.md')}`)).body.toString()).toBe('xin chào');
    expect(JSON.parse((await call(`/__studio/fs/stat?path=${encodeURIComponent('Mới')}`)).body.toString())).toEqual({ kind: 'directory' });
    expect(JSON.parse((await call(`/__studio/fs/stat?path=${encodeURIComponent('Không có')}`)).body.toString())).toEqual({ kind: null });
    expect((await call(`/__studio/fs/entry?path=${encodeURIComponent('Mới')}`, { method: 'DELETE' })).status).toBe(409);
    expect((await call(`/__studio/fs/entry?path=${encodeURIComponent('Mới')}&recursive=1`, { method: 'DELETE' })).status).toBe(204);
    expect(existsSync(join(posts, 'Mới'))).toBe(false);

    expect((await call(`/__studio/fs/file?path=${encodeURIComponent('../../../package.json')}`, { method: 'PUT', body: 'x' })).status).toBe(422);
    expect(readFileSync(join(work, 'package.json'), 'utf8')).toBe('{}');
    expect((await call('/__studio/fs/entry?path=', { method: 'DELETE' })).status).toBe(422);
    expect((await call('/__studio/fs/file?path=a%5Cb', { method: 'PUT', body: 'x' })).status).toBe(422);
  });
});
