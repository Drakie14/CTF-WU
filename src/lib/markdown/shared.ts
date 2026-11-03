import type { Element, Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';
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
