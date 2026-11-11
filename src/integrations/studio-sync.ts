import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { sync } from '../../scripts/sync.mjs';
import { dreamhackProxy } from '../lib/dreamhack';
import { STUDIO_REPO } from '../lib/studio';
import { isStudioRequest, studioLocal } from './studio-local';
import { claudeSuggestTags } from '../lib/studio-claude-tags';
import type { TagPromptInput } from '../lib/tag-prompt';
import { studioPagePath } from '../lib/studio-route';

/**
 * Chỉ khi `npm run dev`: POST /__studio/sync cho Studio gọi sau Publish để git pull về máy.
 * Mọi endpoint /__studio/* chạy lệnh trên máy nên đi qua `isStudioRequest` (Host/Origin loopback, Sec-Fetch-Site, header riêng).
 * /__studio/local, /__studio/git, /__studio/fs: Studio local đọc/ghi git và thư mục posts trên máy (xem studio-local.ts).
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
        server.middlewares.use((request, _response, next) => {
          const url = new URL(request.url ?? '/', 'http://localhost');
          const page = studioPagePath(url.pathname);
          if (page && (request.method === 'GET' || request.method === 'HEAD')) request.url = page + url.search;
          next();
        });
        const local = studioLocal(root, STUDIO_REPO);
        server.middlewares.use('/__studio/local', local.probe);
        server.middlewares.use('/__studio/git', local.git);
        server.middlewares.use('/__studio/fs', local.fs);
        server.middlewares.use('/api/dreamhack', (request, response) => {
          if (request.method !== 'GET') { response.statusCode = 405; response.end(); return; }
          void dreamhackProxy((request.url ?? '').replace(/^\/+|\/+$|\?.*$/g, '')).then(async (reply) => {
            response.statusCode = reply.status;
            reply.headers.forEach((value, key) => response.setHeader(key, value));
            response.end(await reply.text());
          });
        });
        server.middlewares.use('/__studio/sync', (request, response) => {
          if (request.method !== 'POST' || !isStudioRequest(request)) { response.statusCode = 403; response.end(); return; }
          void sync(root).then((result) => {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(result));
          });
        });
        // POST /__studio/claude-tags: chấm độ khó và tag bằng `claude -p` trên máy (gói Pro), cùng kiểu chặn như /__studio/sync.
        server.middlewares.use('/__studio/claude-tags', (request, response) => {
          if (request.method !== 'POST' || !isStudioRequest(request)) { response.statusCode = 403; response.end(); return; }
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
