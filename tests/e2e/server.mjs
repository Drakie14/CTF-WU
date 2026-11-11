// Phục vụ bản build và áp dụng _headers như deployment; không bật endpoint ghi file của dev server.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const compressed = new Map();
const root = path.resolve('dist');
// Áp dụng các rewrite 200 từ cùng file Cloudflare Pages sử dụng.
const rewrites = (await readFile(path.join(root, '_redirects'), 'utf8')).split(/\r?\n/)
  .map((line) => line.trim().split(/\s+/))
  .filter(([from, , status]) => from && !from.startsWith('#') && status === '200')
  .map(([from, to]) => ({ from: new RegExp(`^${from.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`), to }));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
};
const blocks = [];
let block;
for (const line of (await readFile(path.join(root, '_headers'), 'utf8')).split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  if (!/^\s/.test(line)) {
    block = {
      pattern: new RegExp(
        `^${line
          .trim()
          .split('*')
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*')}$`,
      ),
      headers: [],
    };
    blocks.push(block);
  } else block?.headers.push(line.trim());
}
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = rewrites.find(({ from }) => from.test(pathname))?.to ?? pathname;
    let file = path.resolve(root, `.${target}`);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = path.join(file, 'index.html');
    let content = await readFile(file).catch(() => null);
    if (!content) {
      content = await readFile(path.join(root, '404.html'));
      res.statusCode = 404;
    }
    for (const b of blocks)
      if (b.pattern.test(pathname))
        for (const header of b.headers) {
          if (header.startsWith('! ')) res.removeHeader(header.slice(2));
          else {
            const i = header.indexOf(':');
            res.setHeader(header.slice(0, i), header.slice(i + 1).trim());
          }
        }
    const type = mime[path.extname(file)] ?? 'application/octet-stream';
    res.setHeader('content-type', type);
    // Cloudflare nén tài nguyên text. Đo bản không nén sẽ phóng đại chi phí mạng so với deployment.
    if (/text\/|javascript|json|svg|xml/.test(type) && req.headers['accept-encoding']?.includes('gzip')) {
      if (!compressed.has(file)) compressed.set(file, gzipSync(content));
      content = compressed.get(file);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
    }
    res.end(content);
  } catch {
    res.writeHead(500).end();
  }
}).listen(4322, '127.0.0.1', () => console.log('Ready http://127.0.0.1:4322'));
