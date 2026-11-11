import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import type { Root } from 'hast';
import type { VFile } from 'vfile';
import { coreRemarkPlugins, coreRehypePlugins } from './markdown/core';
import { preprocessHackmd } from './markdown/preprocess';
import { visit } from 'unist-util-visit';

function assetName(value: string): string | undefined {
  if (/^(?:[a-z][a-z0-9+.-]*:|[/#?])/i.test(value)) return;
  const name = value.replace(/^\.\//, '').split(/[?#]/)[0];
  try { return decodeURIComponent(name) || undefined; } catch { return name || undefined; }
}

/** Resolve trusted Studio assets after sanitizing author HTML (which rejects blob URLs). */
function resolveAssets() {
  return (tree: Root, file: VFile) => {
    const resolve = file.data.resolveAsset as ((name: string) => string | undefined) | undefined;
    if (!resolve) return;
    visit(tree, 'element', (node) => {
      const key = node.tagName === 'img' ? 'src' : node.tagName === 'a' ? 'href' : undefined;
      if (!key) return;
      const value = node.properties[key];
      const name = typeof value === 'string' ? assetName(value) : undefined;
      if (!name) return;
      const url = resolve(name);
      if (url) node.properties[key] = url;
    });
  };
}

/** Gắn vị trí sau sanitize: raw HTML không thể tự cấp quyền qua data attribute. */
function sourceLines() {
  return (tree: Root, file: VFile) => {
    const map = file.data.sourceMap as number[];
    for (const node of tree.children) {
      if (node.type !== 'element' || !node.position) continue;
      node.properties.dataLine = map[node.position.start.line - 1] ?? 0;
      node.properties.dataEnd = (map[node.position.end.line - 1] ?? 0) + 1;
    }
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use({ plugins: coreRemarkPlugins })
  .use(remarkRehype, { allowDangerousHtml: true, clobberPrefix: '' })
  .use({ plugins: coreRehypePlugins })
  .use(resolveAssets)
  .use(sourceLines)
  .use(rehypeStringify);

export async function renderStudioMarkdown(source: string, title = '', resolveAsset?: (name: string) => string | undefined): Promise<string> {
  const sourceMap: number[] = [];
  const value = preprocessHackmd(source, undefined, sourceMap);
  return String(await processor.process({ value, data: { sourceMap, resolveAsset, astro: { frontmatter: { title } } } }));
}

/** Dùng cùng parser với preview để không xoá nhầm ảnh/file được tham chiếu bằng URL encode hoặc reference link. */
export function studioAssetNames(source: string, cover?: unknown): Set<string> {
  const names = new Set<string>();
  const value = preprocessHackmd(source);
  processor.processSync({ value, data: { sourceMap: [], resolveAsset: (name: string) => { names.add(name); } } });
  const coverName = typeof cover === 'string' && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(cover) ? cover.replace(/^\.\//, '') : undefined;
  if (coverName) names.add(coverName);
  return names;
}
