import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import { sync } from '../../scripts/sync.mjs';

/**
 * Chỉ khi `npm run dev`: POST /__studio/sync cho Studio gọi sau Publish để git pull về máy.
 * Chặn request từ trang khác (Sec-Fetch-Site) và cần header riêng, vì endpoint chạy lệnh git.
 */
export default function studioSync(): AstroIntegration {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  return {
    name: 'studio-sync',
    hooks: {
      'astro:server:setup': ({ server }) => {
        server.middlewares.use('/__studio/sync', (request, response) => {
          const sameOrigin = request.headers['sec-fetch-site'] === 'same-origin' && request.headers['x-studio-sync'] === '1';
          if (request.method !== 'POST' || !sameOrigin) { response.statusCode = 403; response.end(); return; }
          void sync(root).then((result) => {
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(result));
          });
        });
      },
    },
  };
}
