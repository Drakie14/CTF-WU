import type { PluggableList } from 'unified';
import remarkBreaks from 'remark-breaks';
import remarkGemoji from 'remark-gemoji';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import {
  remarkCodeMeta,
  remarkDedupeTitle,
  remarkGithubAlerts,
  remarkImageSize,
  remarkMark,
  remarkRemoveToc,
} from './remark-hackmd';
import { sanitizeSchema } from './sanitize-schema';
import { rehypeFixClobberedAnchors, rehypeLinksAndTables } from './shared';

/** Cú pháp và security boundary dùng chung ở browser và build. */
export const coreRemarkPlugins: PluggableList = [
  remarkMath,
  remarkCodeMeta,
  remarkRemoveToc,
  remarkDedupeTitle,
  remarkGithubAlerts,
  remarkMark,
  remarkGemoji,
  remarkImageSize,
  remarkBreaks,
];
export const coreRehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  rehypeFixClobberedAnchors,
  [rehypeKatex, { trust: false, strict: 'ignore', throwOnError: false }],
  rehypeLinksAndTables,
];
