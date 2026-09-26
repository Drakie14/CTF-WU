import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Element, ElementContent, Nodes, Root, Text } from 'hast';
import { createHighlighter, type Highlighter } from 'shiki';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { resolveLanguage } from './languages';
import { copyAttachment } from './attachments';
import { fetchRemoteImage, isRemoteUrl } from './remote-images';
import { truncate } from '../content/text';
import { markdownWarn } from './warn';

const SHIKI_THEME = 'github-dark-default';

function hastText(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if ('children' in node) return (node.children as Nodes[]).map(hastText).join('');
  return '';
}

function classList(el: Element): string[] {
  const c: unknown = el.properties.className;
  return Array.isArray(c) ? c.map(String) : typeof c === 'string' ? c.split(/\s+/) : [];
}

const h = (tagName: string, properties: Element['properties'], children: ElementContent[] = []): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const t = (value: string): Text => ({ type: 'text', value });

// ---------------------------------------------------------------------------
// Sửa anchor trong trang sau khi sanitize thêm tiền tố `user-content-` vào id
// (footnote GFM, id do người viết tự đặt).
// ---------------------------------------------------------------------------

export function rehypeFixClobberedAnchors() {
  return (tree: Root) => {
    const ids = new Set<string>();
    visit(tree, 'element', (el: Element) => {
      if (typeof el.properties.id === 'string') ids.add(el.properties.id);
    });
    visit(tree, 'element', (el: Element) => {
      const href = el.properties.href;
      if (el.tagName !== 'a' || typeof href !== 'string' || !href.startsWith('#')) return;
      const target = decodeURIComponent(href.slice(1));
      if (!ids.has(target) && ids.has(`user-content-${target}`)) el.properties.href = `#user-content-${target}`;
    });
  };
}

// ---------------------------------------------------------------------------
// Code block: Shiki + nhãn ngôn ngữ + nút Copy + chế độ wrap (```lang!)
// Chạy SAU sanitize nên output của Shiki (inline style màu) không bị lọc.
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | undefined;
function getHighlighter(): Promise<Highlighter> {
  // Chỉ nạp theme lúc khởi tạo; ngôn ngữ được nạp khi thực sự xuất hiện trong content.
  highlighterPromise ??= createHighlighter({ themes: [SHIKI_THEME], langs: [] });
  return highlighterPromise;
}

export function rehypeCodeBlocks() {
  return async (tree: Root, file: VFile) => {
    const jobs: Array<{ pre: Element; parent: Element | Root; index: number }> = [];
    visit(tree, 'element', (el: Element, index, parent) => {
      if (el.tagName !== 'pre' || !parent || index === undefined) return;
      const code = el.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
      if (!code) return;
      jobs.push({ pre: el, parent: parent as Element | Root, index });
      return SKIP;
    });
    if (!jobs.length) return;

    const highlighter = await getHighlighter();
    for (const { pre, parent, index } of jobs) {
      const code = pre.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code')!;
      const text = hastText(code).replace(/\n$/, '');
      let lang = typeof code.properties.dataLang === 'string' ? code.properties.dataLang : '';
      let label = typeof code.properties.dataLabel === 'string' ? code.properties.dataLabel : '';
      const wrap = code.properties.dataWrap === 'true';
      if (!lang) {
        // <pre><code class="language-x"> viết tay bằng HTML.
        const cls = classList(code).find((c) => c.startsWith('language-'));
        const resolved = resolveLanguage(cls?.slice('language-'.length), text);
        if (!resolved.known) markdownWarn(file, `unknown code language "${resolved.original}", rendered as plaintext`);
        lang = resolved.lang;
        label = resolved.label;
      }

      if (lang !== 'plaintext' && !highlighter.getLoadedLanguages().includes(lang)) {
        try {
          await highlighter.loadLanguage(lang as Parameters<Highlighter['loadLanguage']>[0]);
        } catch {
          markdownWarn(file, `could not load Shiki language "${lang}", rendered as plaintext`);
          lang = 'plaintext';
        }
      }

      const highlighted = highlighter.codeToHast(text, { lang: lang === 'plaintext' ? 'text' : lang, theme: SHIKI_THEME });
      const shikiPre = highlighted.children.find((c): c is Element => c.type === 'element' && c.tagName === 'pre');
      if (!shikiPre) continue;
      shikiPre.properties.dataLang = lang;

      const figure = h('figure', { className: ['code-block'], ...(wrap ? { dataWrap: 'true' } : {}) }, [
        h('figcaption', { className: ['code-header'], dataPagefindIgnore: 'all' }, [
          h('span', { className: ['code-lang'] }, [t(label || 'PLAINTEXT')]),
          h('button', { type: 'button', className: ['copy-btn'], dataCopy: '', ariaLabel: 'Copy code', hidden: true }, [t('Copy')]),
        ]),
        shikiPre,
      ]);
      parent.children[index] = figure;
    }
  };
}

// ---------------------------------------------------------------------------
// Ảnh: tải ảnh remote vào cache, kiểm tra ảnh local, ưu tiên ảnh đầu tiên.
// Phải chạy trước `rehypeImages` của Astro (Astro chạy nó sau plugin người dùng).
// ---------------------------------------------------------------------------

interface AstroFileData {
  astro?: { localImagePaths?: string[]; remoteImagePaths?: string[] };
}

function safeDecode(s: string): string {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

function fallbackNode(alt: string): Element {
  return h('span', { className: ['img-fallback'], role: 'img', ariaLabel: alt || 'image unavailable' }, [
    t(alt ? `[image: ${alt}]` : '[image unavailable]'),
  ]);
}

export function rehypeImagesPipeline() {
  return async (tree: Root, file: VFile) => {
    const data = file.data as AstroFileData;
    const filePath = file.path;
    const dir = filePath ? path.dirname(filePath) : null;
    const local = new Set<string>();

    const imgs: Array<{ el: Element; parent: Element | Root; index: number }> = [];
    visit(tree, 'element', (el: Element, index, parent) => {
      if (el.tagName === 'img' && parent && index !== undefined) imgs.push({ el, parent: parent as Element | Root, index });
    });

    await Promise.all(
      imgs.map(async ({ el, parent, index }) => {
        const src = typeof el.properties.src === 'string' ? el.properties.src.trim() : '';
        const alt = typeof el.properties.alt === 'string' ? el.properties.alt : '';
        const replace = () => {
          parent.children[index] = fallbackNode(alt);
        };
        if (!src) return replace();

        if (isRemoteUrl(src)) {
          if (!dir) return; // Không có file context (ví dụ test không truyền fileURL).
          try {
            const cached = await fetchRemoteImage(src);
            let rel = path.relative(dir, cached).split(path.sep).join('/');
            if (!rel.startsWith('.')) rel = `./${rel}`;
            el.properties.src = rel;
            local.add(rel);
          } catch (err) {
            markdownWarn(file, `could not download remote image ${src} (${err instanceof Error ? err.message : String(err)}); rendering alt text instead`);
            replace();
          }
          return;
        }

        if (src.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(src)) return; // public/ hoặc data:
        if (!dir) return;
        const decoded = safeDecode(src);
        if (!existsSync(path.resolve(dir, decoded.split(/[?#]/)[0]!))) {
          markdownWarn(file, `local image not found: ${src}; rendering alt text instead`);
          return replace();
        }
        local.add(decoded);
      }),
    );

    // Astro chỉ tối ưu ảnh nằm trong danh sách này; ảnh remote đã thành local.
    data.astro ??= {};
    data.astro.localImagePaths = [...local];
    data.astro.remoteImagePaths = [];

    // Ảnh đầu tiên (nếu nằm gần đầu bài) được tải sớm; còn lại lazy.
    let first = true;
    visit(tree, 'element', (el: Element) => {
      if (el.tagName !== 'img') return;
      if (first) {
        first = false;
        const top = tree.children.filter((c) => c.type === 'element').slice(0, 4);
        if (top.some((c) => c === el || hastContains(c as Element, el))) {
          el.properties.loading = 'eager';
          el.properties.fetchpriority = 'high';
          return;
        }
      }
      el.properties.loading = 'lazy';
      el.properties.decoding = 'async';
    });
  };
}

function hastContains(root: Element, target: Element): boolean {
  let found = false;
  visit(root, 'element', (el: Element) => {
    if (el === target) found = true;
  });
  return found;
}

// ---------------------------------------------------------------------------
// Link ngoài: rel="noopener noreferrer"; bảng: bọc để cuộn ngang.
// ---------------------------------------------------------------------------

export function rehypeLinksAndTables() {
  return (tree: Root) => {
    visit(tree, 'element', (el: Element, index, parent) => {
      // Nội dung spoiler (thường là flag) không được đưa vào chỉ mục tìm kiếm.
      if (el.tagName === 'details' && classList(el).includes('spoiler')) el.properties.dataPagefindIgnore = 'all';
      if (el.tagName === 'a' && typeof el.properties.href === 'string' && /^(https?:)?\/\//i.test(el.properties.href)) {
        el.properties.rel = ['noopener', 'noreferrer'];
      }
      if (el.tagName === 'table' && parent && index !== undefined) {
        parent.children[index] = h('div', { className: ['table-wrap'] }, [el]);
        return SKIP;
      }
      return undefined;
    });
  };
}

// ---------------------------------------------------------------------------
// Summary tự động: paragraph cấp cao nhất đầu tiên có chữ. KHÔNG lấy nội dung
// bên trong spoiler/callout (tránh lộ flag vào meta description, RSS, search).
// Kết quả được trả về qua `metadata.frontmatter.autoSummary`.
// ---------------------------------------------------------------------------

export function rehypeExtractSummary() {
  return (tree: Root, file: VFile) => {
    let summary = '';
    for (const node of tree.children) {
      if (node.type !== 'element' || node.tagName !== 'p') continue;
      const text = hastText(node).replace(/\s+/g, ' ').trim();
      if (text) {
        summary = truncate(text, 200);
        break;
      }
    }
    const data = file.data as { astro?: { frontmatter?: Record<string, unknown> } };
    data.astro ??= {};
    data.astro.frontmatter = { ...data.astro.frontmatter, autoSummary: summary };
  };
}

// ---------------------------------------------------------------------------
// File đính kèm: link tương đối tới file cạnh bài viết (./chall.zip, ./solve.py)
// được copy vào `/attachments/<hash>/<tên file>` và hiển thị dạng attachment card.
// ---------------------------------------------------------------------------

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function rehypeAttachments() {
  return async (tree: Root, file: VFile) => {
    if (!file.path) return;
    const dir = path.dirname(file.path);
    const links: Element[] = [];
    visit(tree, 'element', (el: Element) => {
      const href = el.properties.href;
      if (el.tagName !== 'a' || typeof href !== 'string' || !href) return;
      if (href.startsWith('#') || href.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return;
      links.push(el);
    });
    for (const el of links) {
      const href = el.properties.href as string;
      const target = path.resolve(dir, safeDecode(href.split(/[?#]/)[0]!));
      if (/\.md$/i.test(target)) {
        markdownWarn(file, `link to another Markdown file (${href}) is not supported; use /posts/<slug>/ instead`);
        continue;
      }
      const copied = await copyAttachment(target);
      if (!copied) {
        markdownWarn(file, `linked file not found: ${href}; link removed`);
        delete el.properties.href;
        continue;
      }
      el.properties.href = copied.url;
      el.properties.className = [...classList(el), 'attachment'];
      el.properties.dataFilename = copied.name;
      el.properties.dataSize = formatBytes(copied.size);
      el.properties.download = copied.name;
    }
  };
}
