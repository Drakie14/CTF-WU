import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { vi } from 'vitest';
import { markdownOptions, preprocessHackmd } from '../../src/lib/markdown';

let processor: Awaited<ReturnType<typeof createMarkdownProcessor>> | undefined;

/**
 * Render bằng ĐÚNG pipeline mà Astro dùng khi build (cùng `markdownOptions`,
 * cùng thứ tự plugin của @astrojs/markdown-remark), kèm bước preprocess HackMD.
 */
export async function renderMd(
  md: string,
  opts: { title?: string; fileURL?: URL } = {},
): Promise<{ html: string; warnings: string[]; summary: string }> {
  processor ??= await createMarkdownProcessor({ ...markdownOptions, syntaxHighlight: false });
  const warnings: string[] = [];
  const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  });
  try {
    const { code, metadata } = await processor.render(preprocessHackmd(md, (m) => warnings.push(`[markdown] ${m}`)), {
      frontmatter: opts.title ? { title: opts.title } : {},
      ...(opts.fileURL ? { fileURL: opts.fileURL } : {}),
    });
    return { html: code, warnings, summary: String(metadata.frontmatter.autoSummary ?? '') };
  } finally {
    spy.mockRestore();
  }
}
