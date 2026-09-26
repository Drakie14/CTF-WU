// Chạy build/dev kèm 200 bài fixtures (CTF_FIXTURES=1) — cross-platform, không cần cross-env.
//   node scripts/with-fixtures.mjs build  → dist-fixtures/ (+ Pagefind), KHÔNG đụng tới dist/ production
//   node scripts/with-fixtures.mjs dev    → astro dev có fixtures
// Tự sinh fixtures nếu chưa có (npm run generate:fixtures).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'build';
const OUT = 'dist-fixtures';

const run = (cmd) => {
  console.log(`> ${cmd}`);
  // shell: true để npm/.bin chạy được trên cả Windows (cmd) lẫn Unix.
  const r = spawnSync(cmd, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, CTF_FIXTURES: '1' } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (!existsSync(path.join(root, 'fixtures', 'posts'))) run('node scripts/generate-fixtures.mjs');

if (mode === 'dev') run('astro dev');
else if (mode === 'build') {
  const start = Date.now();
  run(`astro build --outDir ${OUT}`);
  run(`pagefind --site ${OUT}`);
  console.log(`Fixture build done in ${((Date.now() - start) / 1000).toFixed(1)}s → ${OUT}/`);
} else {
  console.error(`Unknown mode "${mode}" (use build | dev)`);
  process.exit(1);
}
