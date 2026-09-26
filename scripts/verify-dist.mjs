// Kiểm tra output build (`dist/`) — chạy sau `npm run build`:
//   1. XSS: không có <script> inline / không rõ nguồn, <iframe>/<object>/<embed>,
//      thuộc tính on*, URL javascript:, style chứa url(...).
//   2. Ảnh remote: không còn <img>/<source> trỏ tới domain bên ngoài (hackmd.io, imgur...).
//   3. Internal link: mọi href/src nội bộ đều tồn tại trong dist.
//   4. SEO: mỗi trang có <title>, meta description, Open Graph, canonical (trừ trang noindex);
//      rss.xml/sitemap/robots.txt tồn tại, sitemap không chứa /admin hay trang noindex.
// Phân tích theo thẻ/thuộc tính (không grep text): trong HTML đã serialize, nội dung
// text của code block luôn được escape (`&lt;`), nên payload mẫu trong bài không bị tính.
// Cross-platform: chỉ dùng Node.js API. Thoát với mã 1 nếu có lỗi.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(root, process.argv[2] ?? 'dist');
if (!existsSync(dist)) {
  console.error(`Không tìm thấy ${dist}. Chạy "npm run build" trước.`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITY[e.toLowerCase()] ?? m;
  });

const TAG_RE = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'data', 'xlink:href']);
const ALLOWED_SCRIPT_PREFIXES = ['/_astro/', '/pagefind/'];
// Trang /admin (Sveltia CMS, có CSP riêng) được phép nạp bundle CMS self-host.
const ADMIN_SCRIPTS = ['/admin/sveltia-cms.js'];

const files = walk(dist).filter((f) => f.endsWith('.html'));
const problems = { xss: [], remote: [], links: [], seo: [] };
const noindexPages = new Set();
let linkCount = 0;

function internalTarget(fromFile, url) {
  const clean = decodeURIComponent(url.split('#')[0].split('?')[0]);
  if (!clean) return null;
  const abs = clean.startsWith('/') ? path.join(dist, clean) : path.resolve(path.dirname(fromFile), clean);
  return abs;
}

function targetExists(abs) {
  if (existsSync(abs) && statSync(abs).isFile()) return true;
  return existsSync(path.join(abs, 'index.html')) || existsSync(`${abs}.html`);
}

for (const file of files) {
  const rel = path.relative(dist, file).split(path.sep).join('/');
  const html = readFileSync(file, 'utf8');

  // SEO metadata (bỏ qua /admin: trang CMS, noindex).
  if (!rel.startsWith('admin/')) {
    const noindex = /<meta name="robots" content="noindex/.test(html);
    if (noindex) noindexPages.add(`/${rel.replace(/(^|\/)index\.html$/, '$1')}`);
    const need = [
      ['<title>', /<title>[^<]+<\/title>/],
      ['meta description', /<meta name="description" content="[^"]+"/],
      ['og:title', /<meta property="og:title" content="[^"]+"/],
      ['og:description', /<meta property="og:description" content="[^"]+"/],
      ['og:image', /<meta property="og:image" content="https?:\/\/[^"]+"/],
      ...(noindex ? [] : [['canonical', /<link rel="canonical" href="https?:\/\/[^"]+"/], ['og:url', /<meta property="og:url"/]]),
    ];
    for (const [name, re] of need) if (!re.test(html)) problems.seo.push(`${rel}: thiếu ${name}`);
  }

  // <script>: phải là module ngoài từ nguồn cho phép, không có nội dung inline.
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const src = /\ssrc="([^"]*)"/i.exec(m[1])?.[1];
    if (!src || m[2].trim()) problems.xss.push(`${rel}: inline <script>`);
    else if (rel.startsWith('admin/') && ADMIN_SCRIPTS.includes(src)) continue;
    else if (!ALLOWED_SCRIPT_PREFIXES.some((p) => src.startsWith(p))) problems.xss.push(`${rel}: <script src="${src}">`);
  }

  for (const t of html.matchAll(TAG_RE)) {
    const tag = t[1].toLowerCase();
    if (['iframe', 'object', 'embed', 'frame', 'frameset', 'applet'].includes(tag)) problems.xss.push(`${rel}: <${tag}>`);
    for (const a of t[2].matchAll(ATTR_RE)) {
      const name = a[1].toLowerCase();
      const value = decode(a[2] ?? a[3] ?? a[4] ?? '');
      const compact = value.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
      if (name.startsWith('on')) problems.xss.push(`${rel}: <${tag} ${name}=…>`);
      if (/(javascript|vbscript):/.test(compact)) problems.xss.push(`${rel}: <${tag} ${name}="${value.slice(0, 60)}">`);
      if (name === 'style' && /url\(/.test(compact) && !/url\(\/bg\.svg\)/.test(compact)) {
        problems.xss.push(`${rel}: <${tag} style="${value.slice(0, 60)}">`);
      }
      if ((tag === 'img' || tag === 'source') && (name === 'src' || name === 'srcset') && /(^|,\s*)(https?:)?\/\//i.test(value)) {
        problems.remote.push(`${rel}: <${tag} ${name}="${value.slice(0, 80)}">`);
      }
      if (URL_ATTRS.has(name) || name === 'srcset') {
        const urls = name === 'srcset' ? value.split(',').map((s) => s.trim().split(/\s+/)[0]) : [value];
        for (const url of urls) {
          if (!url || url.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) continue;
          linkCount++;
          const target = internalTarget(file, url);
          if (target && !targetExists(target)) problems.links.push(`${rel}: ${url}`);
        }
      }
    }
  }
}

// Feed, sitemap, robots.
const readDist = (p) => (existsSync(path.join(dist, p)) ? readFileSync(path.join(dist, p), 'utf8') : null);
const rssXml = readDist('rss.xml');
const postCount = existsSync(path.join(dist, 'posts')) ? readdirSync(path.join(dist, 'posts')).length : 0;
if (!rssXml) problems.seo.push('thiếu rss.xml');
else if ((rssXml.match(/<item>/g) ?? []).length !== postCount) problems.seo.push(`rss.xml: ${(rssXml.match(/<item>/g) ?? []).length} item ≠ ${postCount} bài`);
const robots = readDist('robots.txt');
if (!robots || !/^Disallow: \/admin/m.test(robots) || !/^Sitemap: https?:\/\/\S+\/sitemap-index\.xml/m.test(robots)) problems.seo.push('robots.txt thiếu Disallow /admin hoặc Sitemap');
const sitemapIndex = readDist('sitemap-index.xml');
if (!sitemapIndex) problems.seo.push('thiếu sitemap-index.xml');
else {
  const locs = [];
  for (const [, u] of sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const xml = readDist(new URL(u).pathname.slice(1));
    if (!xml) problems.seo.push(`sitemap con không tồn tại: ${u}`);
    else for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) locs.push(new URL(loc).pathname);
  }
  for (const p of locs) {
    if (p.startsWith('/admin')) problems.seo.push(`sitemap chứa ${p}`);
    if (noindexPages.has(p)) problems.seo.push(`sitemap chứa trang noindex ${p}`);
    if (!targetExists(path.join(dist, decodeURIComponent(p)))) problems.seo.push(`sitemap trỏ tới trang không tồn tại ${p}`);
  }
  const postLocs = locs.filter((p) => p.startsWith('/posts/')).length;
  if (postLocs !== postCount) problems.seo.push(`sitemap có ${postLocs} bài ≠ ${postCount} bài`);
}

const report = (title, list) => {
  const unique = [...new Set(list)];
  console.log(`${unique.length ? '✗' : '✓'} ${title}: ${unique.length} issue(s)`);
  for (const p of unique.slice(0, 40)) console.log(`    ${p}`);
  if (unique.length > 40) console.log(`    … và ${unique.length - 40} mục khác`);
  return unique.length;
};

console.log(`Checked ${files.length} HTML files, ${linkCount} internal URLs in ${path.relative(root, dist) || dist}`);
const total =
  report('XSS (script/iframe/on*/javascript:/style url)', problems.xss) +
  report('Remote images', problems.remote) +
  report('Broken internal links', problems.links) +
  report('SEO / RSS / sitemap / robots', problems.seo);
process.exit(total ? 1 : 0);
