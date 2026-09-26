import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Allowlist cho HTML do người viết đưa vào Markdown (mục 53, 54).
 *
 * Dựa trên schema kiểu GitHub của hast-util-sanitize:
 * - loại bỏ <script>, <iframe>, <style>, <object>, form..., mọi thuộc tính `on*`
 *   và `style` (chặn luôn `style="background:url(javascript:...)"`);
 * - `href`/`src` chỉ cho phép http(s), mailto và đường dẫn tương đối
 *   (chặn `javascript:`, `data:`, `vbscript:`...).
 *
 * Bổ sung những gì pipeline HackMD sinh ra: callout, spoiler, <mark>, metadata
 * của code block. Shiki, nhãn ngôn ngữ, nút Copy được thêm SAU bước sanitize
 * (bởi plugin tin cậy) nên không cần nới lỏng schema cho `style`.
 */
const CALLOUT_CLASSES = ['callout', 'callout-info', 'callout-success', 'callout-warning', 'callout-danger'];

const base = defaultSchema;

export const sanitizeSchema: SanitizeSchema = {
  ...base,
  // <picture>/<source srcset> bị bỏ: srcset remote sẽ không được tải về lúc build.
  tagNames: [...(base.tagNames ?? []).filter((t) => t !== 'picture' && t !== 'source'), 'mark', 'figure', 'figcaption', 'abbr', 'u'],
  attributes: {
    ...base.attributes,
    '*': (base.attributes?.['*'] ?? []).filter((a) => a !== 'open'),
    div: [...(base.attributes?.div ?? []), ['className', ...CALLOUT_CLASSES]],
    p: [...(base.attributes?.p ?? []), ['className', 'callout-title']],
    details: [...(base.attributes?.details ?? []), ['className', 'spoiler']],
    code: [...(base.attributes?.code ?? []), 'dataLang', 'dataLabel', 'dataWrap'],
    img: [...(base.attributes?.img ?? []), 'width', 'height'],
  },
  // `open` của <details> bị bỏ để spoiler luôn mặc định đóng.
  strip: ['script', 'style', 'template', 'noscript'],
};
