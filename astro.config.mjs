// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { markdownOptions } from './src/lib/markdown/index.ts';
import attachments from './src/integrations/attachments.ts';

// Đổi thành domain thật khi deploy (dùng cho canonical URL, RSS, sitemap).
const SITE = process.env.SITE_URL ?? 'https://ctf-writeups.pages.dev';

/** Thư mục output thực tế (dist/ hoặc dist-fixtures/), lấy từ config sau khi resolve. */
let outDir = fileURLToPath(new URL('./dist/', import.meta.url));

/**
 * Trang đã build có `<meta name="robots" content="noindex">` (404, /search, category rỗng…).
 * @param {string} pathname
 */
function isNoindex(pathname) {
  const file = `${outDir}${decodeURIComponent(pathname).replace(/^\//, '')}index.html`;
  return existsSync(file) && /<meta name="robots" content="noindex/.test(readFileSync(file, 'utf8'));
}

// https://astro.build/config
export default defineConfig({
  site: SITE,
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  integrations: [
    attachments(),
    {
      name: 'capture-out-dir',
      hooks: { 'astro:config:done': ({ config }) => void (outDir = fileURLToPath(config.outDir)) },
    },
    // /sitemap-index.xml: mọi trang public, trừ /admin, trang noindex và /archive/page/1/ (canonical là /archive/).
    sitemap({
      filter: (page) => {
        const { pathname } = new URL(page);
        return !/^\/admin(\/|$)/.test(pathname) && pathname !== '/archive/page/1/' && !isNoindex(pathname);
      },
    }),
  ],
  image: {
    // Ảnh trong bài (Markdown) có srcset + sizes, không vượt quá kích thước gốc.
    layout: 'constrained',
    // Không chèn CSS responsive của Astro; global.css tự lo (max-width: 100%; height: auto).
    responsiveStyles: false,
  },
  markdown: {
    // Highlight bằng Shiki được làm trong pipeline riêng (src/lib/markdown), sau bước sanitize.
    syntaxHighlight: false,
    // Pipeline HackMD dùng chung (src/lib/markdown) — cũng được dùng trong unit test.
    processor: unified(markdownOptions),
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      minify: true,
      cssMinify: true,
      // Không bao giờ inline JavaScript (CSP chỉ cho phép script từ 'self', không 'unsafe-inline')
      // và font (CSP font-src 'self', không data:). Asset khác giữ ngưỡng mặc định (4 KB).
      assetsInlineLimit: (file) => (/\.([cm]?js|woff2?|ttf|otf)$/.test(file) ? false : undefined),
    },
  },
});
