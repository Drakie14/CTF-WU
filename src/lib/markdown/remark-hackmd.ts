import type { Blockquote, Code, Heading, Image, Nodes, Paragraph, Parent, PhrasingContent, Root, Text } from 'mdast';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { resolveLanguage } from './languages';
import { markdownWarn } from './warn';

/** Nội dung text thuần của một node mdast. */
function mdastText(node: Nodes): string {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if ('children' in node) return (node.children as Nodes[]).map(mdastText).join('');
  return '';
}

// ---------------------------------------------------------------------------
// [TOC] / [toc] → xóa (blog tự tạo TOC)
// ---------------------------------------------------------------------------

const TOC_LINE_RE = /(^|\n)[ \t]*\[toc\][ \t]*(?=\n|$)/gi;

export function remarkRemoveToc() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (node: Paragraph, index, parent) => {
      for (const child of node.children) {
        if (child.type === 'text') child.value = child.value.replace(TOC_LINE_RE, '$1');
      }
      node.children = node.children.filter((c) => !(c.type === 'text' && c.value.trim() === '' && node.children.length === 1));
      const text = mdastText(node).trim();
      if (parent && index !== undefined && text === '' && !node.children.some((c) => c.type !== 'text' && c.type !== 'break')) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      return undefined;
    });
  };
}

// ---------------------------------------------------------------------------
// Code fence: ```lang, ```lang!, ```lang=, alias, ngôn ngữ lạ
// ---------------------------------------------------------------------------

export function remarkCodeMeta() {
  return (tree: Root, file: VFile) => {
    visit(tree, 'code', (node: Code) => {
      const info = [node.lang, node.meta].filter(Boolean).join(' ');
      const resolved = resolveLanguage(info, node.value);
      if (!resolved.known) {
        markdownWarn(file, `unknown code language "${resolved.original}", rendered as plaintext`);
      }
      node.lang = resolved.lang;
      node.meta = null;
      node.data = {
        ...node.data,
        hProperties: {
          className: [`language-${resolved.lang}`],
          dataLang: resolved.lang,
          dataLabel: resolved.label,
          ...(resolved.wrap ? { dataWrap: 'true' } : {}),
        },
      };
    });
  };
}

// ---------------------------------------------------------------------------
// ==highlight== → <mark>
// ---------------------------------------------------------------------------

interface MarkNode extends Parent {
  type: 'mark';
  children: PhrasingContent[];
}

/** Tìm `==` mở: ký tự sau không phải khoảng trắng hoặc `=`, ký tự trước không phải `=`. */
function findOpen(s: string, from = 0, allowAtEnd = false): number {
  for (let i = s.indexOf('==', from); i !== -1; i = s.indexOf('==', i + 1)) {
    const next = s[i + 2];
    if (s[i - 1] === '=') continue;
    if (next === undefined ? allowAtEnd : next !== '=' && !/\s/.test(next)) return i;
  }
  return -1;
}

/** Tìm `==` đóng: ký tự trước không phải khoảng trắng, ký tự sau không phải `=`. */
function findClose(s: string, from = 0, allowAtStart = false): number {
  for (let i = s.indexOf('==', from); i !== -1; i = s.indexOf('==', i + 1)) {
    const prev = s[i - 1];
    if (s[i + 2] === '=') continue;
    if (prev === undefined ? allowAtStart : prev !== '=' && !/\s/.test(prev)) return i;
  }
  return -1;
}

function markChildren(children: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  const queue = [...children];
  while (queue.length) {
    const node = queue.shift()!;
    if (node.type !== 'text') {
      out.push(node);
      continue;
    }
    const open = findOpen(node.value, 0, queue.length > 0 && queue[0]!.type !== 'text');
    if (open === -1) {
      out.push(node);
      continue;
    }
    const before = node.value.slice(0, open);
    const rest: Text = { type: 'text', value: node.value.slice(open + 2) };
    const candidates: PhrasingContent[] = [rest, ...queue];
    const inner: PhrasingContent[] = [];
    let closedAt = -1;
    let remainder = '';
    for (let j = 0; j < candidates.length; j++) {
      const c = candidates[j]!;
      if (c.type === 'text') {
        const k = findClose(c.value, 0, j !== 0);
        if (k !== -1 && !(j === 0 && k === 0)) {
          if (k > 0) inner.push({ type: 'text', value: c.value.slice(0, k) });
          remainder = c.value.slice(k + 2);
          closedAt = j;
          break;
        }
      }
      inner.push(c);
    }
    if (closedAt === -1 || inner.length === 0) {
      out.push({ type: 'text', value: `${before}==` });
      if (rest.value) queue.unshift(rest);
      continue;
    }
    if (before) out.push({ type: 'text', value: before });
    const mark: MarkNode = { type: 'mark', children: inner, data: { hName: 'mark' } };
    out.push(mark as unknown as PhrasingContent);
    queue.splice(0, closedAt); // candidates[1..closedAt] = queue[0..closedAt-1]
    if (remainder) queue.unshift({ type: 'text', value: remainder });
  }
  return out;
}

export function remarkMark() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (!('children' in node)) return;
      const parent = node as Parent;
      if (!parent.children.some((c) => c.type === 'text' && (c as Text).value.includes('=='))) return;
      parent.children = markChildren(parent.children as PhrasingContent[]);
    });
  };
}

// ---------------------------------------------------------------------------
// GitHub alerts: > [!NOTE] ... → callout
// ---------------------------------------------------------------------------

const ALERTS: Record<string, { type: string; title: string }> = {
  NOTE: { type: 'info', title: 'Note' },
  TIP: { type: 'success', title: 'Tip' },
  IMPORTANT: { type: 'info', title: 'Important' },
  WARNING: { type: 'warning', title: 'Warning' },
  CAUTION: { type: 'danger', title: 'Caution' },
};

export function remarkGithubAlerts() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0];
      if (first?.type !== 'paragraph') return;
      const head = first.children[0];
      if (head?.type !== 'text') return;
      const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i.exec(head.value);
      if (!m) return;
      const alert = ALERTS[m[1]!.toUpperCase()]!;
      head.value = head.value.slice(m[0].length);
      if (!head.value) first.children.shift();
      if (first.children.length === 0) node.children.shift();
      const title: Paragraph = {
        type: 'paragraph',
        children: [{ type: 'text', value: alert.title }],
        data: { hProperties: { className: ['callout-title'] } },
      };
      node.children.unshift(title);
      node.data = { ...node.data, hName: 'div', hProperties: { className: ['callout', `callout-${alert.type}`] } };
    });
  };
}

// ---------------------------------------------------------------------------
// Kích thước ảnh HackMD (đã được preprocess thành title "=300x200")
// ---------------------------------------------------------------------------

export function remarkImageSize() {
  return (tree: Root) => {
    visit(tree, 'image', (node: Image) => {
      const m = /^=(\d*)x(\d*)$/.exec(node.title ?? '');
      if (!m) return;
      node.title = null;
      const props: Record<string, number> = {};
      if (m[1]) props.width = Number(m[1]);
      if (m[2]) props.height = Number(m[2]);
      const prev = (node.data as { hProperties?: Record<string, unknown> } | undefined)?.hProperties;
      node.data = { ...node.data, hProperties: { ...prev, ...props } };
    });
  };
}

// ---------------------------------------------------------------------------
// Ẩn heading cấp 1 đầu tiên nếu trùng chính xác title (tránh lặp title)
// ---------------------------------------------------------------------------

export function remarkDedupeTitle() {
  return (tree: Root, file: VFile) => {
    const astro = (file.data as { astro?: { frontmatter?: Record<string, unknown> } }).astro;
    const title = astro?.frontmatter?.title;
    if (typeof title !== 'string' || !title.trim()) return;
    let done = false;
    visit(tree, 'heading', (node: Heading, index, parent) => {
      if (done || node.depth !== 1) return;
      done = true;
      if (parent && index !== undefined && mdastText(node).trim() === title.trim()) {
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      return undefined;
    });
  };
}
