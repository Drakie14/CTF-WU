import type { RehypePlugins, RemarkPlugins, RemarkRehype } from '@astrojs/markdown-remark';
import { coreRemarkPlugins, coreRehypePlugins } from './core';
import {
  rehypeAttachments,
  rehypeCodeBlocks,
  rehypeExtractSummary,
  rehypeImagesPipeline,
} from './rehype-plugins';
export { preprocessHackmd } from './preprocess';

/**
 * Pipeline Markdown DÙNG CHUNG cho toàn project: `astro.config.mjs` truyền nó cho
 * `unified()` của Astro, và test dùng đúng cấu hình này qua `createMarkdownProcessor`.
 *
 * Thứ tự do Astro áp dụng:
 *   remark-parse → remark-gfm → [remarkPlugins] → collect images → remark-rehype
 *   → [rehypePlugins] → rehypeImages (astro:assets) → heading ids → stringify
 *
 * Trong rehypePlugins: rehype-raw → rehype-sanitize (HTML của người viết)
 * → các plugin tin cậy (Shiki, ảnh, link) chạy sau sanitize.
 */
export const markdownOptions: {
  gfm: boolean;
  smartypants: boolean;
  remarkPlugins: RemarkPlugins;
  rehypePlugins: RehypePlugins;
  remarkRehype: RemarkRehype;
} = {
  gfm: true,
  // HackMD không đổi dấu nháy thông minh → tắt để giữ nguyên nội dung.
  smartypants: false,
  remarkPlugins: coreRemarkPlugins as RemarkPlugins,
  rehypePlugins: [
    ...coreRehypePlugins,
    rehypeExtractSummary,
    rehypeCodeBlocks,
    rehypeAttachments,
    rehypeImagesPipeline,
  ] as RehypePlugins,
  remarkRehype: {
    // Sanitize tự thêm tiền tố `user-content-` → tránh bị thêm hai lần cho footnote.
    clobberPrefix: '',
  },
};
