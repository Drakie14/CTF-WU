import type { Element, Nodes, Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import { countTextWords } from '../content/text';
const classList = (el: Element): string[] =>
  Array.isArray(el.properties.className)
    ? el.properties.className.map(String)
    : String(el.properties.className ?? '').split(/\s+/);
const h = (tagName: string, properties: Element['properties'], children: Element[]): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});

const textBoundaries = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img', 'li', 'ol', 'p', 'section', 'summary', 'table', 'td', 'th', 'ul',
]);

function articleText(node: Nodes): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'root') return node.children.map(articleText).join('');
  if (node.type !== 'element') return '';
  const classes = classList(node);
  if (node.tagName === 'pre' || classes.includes('language-math') || classes.includes('math-inline') || classes.includes('math-display')) return ' ';
  if (node.properties.dataFootnoteRef !== undefined || node.properties.dataFootnoteBackref !== undefined ||
      classes.includes('sr-only') || classes.includes('callout-title')) return '';
  const text = node.children.map(articleText).join('');
  return textBoundaries.has(node.tagName) ? ` ${text} ` : text;
}

/** Đếm nội dung bài sau sanitize, trước khi thêm giao diện cho code và công thức. */
export function rehypeWordCount() {
  return (tree: Root, file: VFile) => {
    const data = file.data as { astro?: { frontmatter?: Record<string, unknown> } };
    data.astro ??= {};
    data.astro.frontmatter ??= {};
    data.astro.frontmatter.wordCount = countTextWords(articleText(tree));
  };
}

export function rehypeFixClobberedAnchors() {
  return (tree: Root) => {
    const ids = new Set<string>();
    visit(tree, 'element', (el: Element) => {
      if (typeof el.properties.id === 'string') ids.add(el.properties.id);
    });
    visit(tree, 'element', (el: Element) => {
      const href = el.properties.href;
      if (el.tagName !== 'a' || typeof href !== 'string' || !href.startsWith('#')) return;
      let target: string;
      try {
        target = decodeURIComponent(href.slice(1));
      } catch {
        return;
      }
      if (!ids.has(target) && ids.has(`user-content-${target}`))
        el.properties.href = `#user-content-${target}`;
    });
  };
}

export function rehypeLinksAndTables() {
  return (tree: Root) => {
    visit(tree, 'element', (el: Element, index, parent) => {
      // Nội dung spoiler (thường là flag) không được đưa vào chỉ mục tìm kiếm.
      if (el.tagName === 'details' && classList(el).includes('spoiler'))
        el.properties.dataPagefindIgnore = 'all';
      if (
        el.tagName === 'a' &&
        typeof el.properties.href === 'string' &&
        /^(https?:)?\/\//i.test(el.properties.href)
      ) {
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
