import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { sync } from '../../scripts/sync.mjs';
import { dreamhackProxy } from '../lib/dreamhack';
import { claudeSuggestTags } from '../lib/studio-claude-tags';
import type { TagPromptInput } from '../lib/tag-prompt';

/**
 * Chỉ khi `npm run dev`: POST /__studio/sync cho Studio gọi sau Publish để git pull về máy.
 * Chặn request từ trang khác (Sec-Fetch-Site) và cần header riêng, vì endpoint chạy lệnh git.
 * Lúc dev server khởi động cũng đồng bộ một lần: bài publish từ Studio bản deploy (không có endpoint này)
 * vẫn ghi file vào thư mục local, nên cần pull ở đây để chúng không thành untracked chặn lần pull sau.
 * GET /api/dreamhack/<id> giống Pages Function trong `functions/`, để Studio lúc dev cũng lấy được độ khó Dreamhack.
 */
export default function studioSync(): AstroIntegration {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  return {
    name: 'studio-sync',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/api/dreamhack', (request, response) => {
          if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
          void dreamhackProxy((request.url ?? '').replace(/^\/+|\/+$|\?.*$/g, '')).then(async (reply) => {
            response.statusCode = reply.status;
            reply.headers.forEach((value, key) => response.setHeader(key, value));
            response.end(await reply.text());
          });
        });
        server.middlewares.use('/__studio/sync', (request, response) => {
          const sameOrigin = request.headers['sec-fetch-site'] === 'same-origin' && request.headers['x-studio-sync'] === '1';
          if (request.method !== 'POST' || !sameOrigin) { response.statusCode = 403; response.end(); return; }
          void sync(root).then((result) => {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(result));
          });
        });
        // POST /__studio/claude-tags: chấm độ khó và tag bằng `claude -p` trên máy (gói Pro), cùng kiểu chặn như /__studio/sync.
        server.middlewares.use('/__studio/claude-tags', (request, response) => {
          const sameOrigin = request.headers['sec-fetch-site'] === 'same-origin' && request.headers['x-studio-sync'] === '1';
          if (request.method !== 'POST' || !sameOrigin) { response.statusCode = 403; response.end(); return; }
          let body = '';
          request.on('data', (chunk) => { body += chunk; });
          request.on('end', () => {
            response.setHeader('content-type', 'application/json');
            void Promise.resolve()
              .then(() => claudeSuggestTags(JSON.parse(body) as TagPromptInput, root))
              .then((result) => response.end(JSON.stringify(result)))
              .catch((error: unknown) => { response.statusCode = 500; response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); });
          });
        });
      },
      'astro:server:start': ({ logger }) => {
        void sync(root).then((result) => (result.ok ? logger.info(result.message) : logger.warn(result.message)));
      },
    },
  };
}
