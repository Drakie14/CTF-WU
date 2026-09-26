import { createReadStream, existsSync, promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { ATTACHMENTS_URL_PREFIX, attachmentsStagingDir } from '../lib/markdown/attachments';

/** Copy file đính kèm (staging) vào output build và phục vụ chúng ở dev server. */
export default function attachments(): AstroIntegration {
  return {
    name: 'ctf-attachments',
    hooks: {
      'astro:config:setup': async ({ command }) => {
        // Build sạch: xóa staging cũ để không deploy file đính kèm không còn dùng.
        if (command === 'build') await fs.rm(attachmentsStagingDir(), { recursive: true, force: true });
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? '';
          if (!url.startsWith(ATTACHMENTS_URL_PREFIX)) return next();
          const rel = decodeURIComponent(url.slice(ATTACHMENTS_URL_PREFIX.length).split('?')[0]!);
          const root = attachmentsStagingDir();
          const file = path.resolve(root, rel);
          if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) return next();
          res.setHeader('Content-Disposition', 'attachment');
          res.setHeader('Content-Type', 'application/octet-stream');
          createReadStream(file).pipe(res);
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const src = attachmentsStagingDir();
        if (!existsSync(src)) return;
        const dest = path.join(fileURLToPath(dir), ATTACHMENTS_URL_PREFIX.replace(/\//g, ''));
        await fs.cp(src, dest, { recursive: true });
        logger.info(`copied attachments to ${path.relative(process.cwd(), dest)}`);
      },
    },
  };
}
