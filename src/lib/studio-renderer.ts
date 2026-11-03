import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import type { Root } from 'hast';
import type { VFile } from 'vfile';
import { coreRemarkPlugins, coreRehypePlugins } from './markdown/core';
import { preprocessHackmd } from './markdown/preprocess';

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
  .use(sourceLines)
  .use(rehypeStringify);

export async function renderStudioMarkdown(source: string, title = ''): Promise<string> {
  const sourceMap: number[] = [];
  const value = preprocessHackmd(source, undefined, sourceMap);
  return String(await processor.process({ value, data: { sourceMap, astro: { frontmatter: { title } } } }));
}
