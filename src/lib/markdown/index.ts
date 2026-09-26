import type { RehypePlugins, RemarkPlugins, RemarkRehype } from '@astrojs/markdown-remark';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkBreaks from 'remark-breaks';
import remarkGemoji from 'remark-gemoji';
import {
  rehypeAttachments,
  rehypeCodeBlocks,
  rehypeExtractSummary,
  rehypeFixClobberedAnchors,
  rehypeImagesPipeline,
  rehypeLinksAndTables,
} from './rehype-plugins';
import {
  remarkCodeMeta,
  remarkDedupeTitle,
  remarkGithubAlerts,
  remarkImageSize,
  remarkMark,
  remarkRemoveToc,
} from './remark-hackmd';
import { sanitizeSchema } from './sanitize-schema';

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
  remarkPlugins: [
    remarkCodeMeta,
    remarkRemoveToc,
    remarkDedupeTitle,
    remarkGithubAlerts,
      remarkMark,
    remarkGemoji,
    remarkImageSize,
    remarkBreaks,
  ],
  rehypePlugins: [
    rehypeRaw,
    [rehypeSanitize, sanitizeSchema],
    rehypeFixClobberedAnchors,
    rehypeExtractSummary,
    rehypeCodeBlocks,
    rehypeAttachments,
    rehypeImagesPipeline,
    rehypeLinksAndTables,
  ],
  remarkRehype: {
    // Sanitize tự thêm tiền tố `user-content-` → tránh bị thêm hai lần cho footnote.
    clobberPrefix: '',
  },
};
