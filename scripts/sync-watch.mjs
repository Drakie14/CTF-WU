// Chạy nền (systemd user service `blog-sync`): Studio bản web publish thẳng lên GitHub nên máy không biết lúc nào có commit mới.
// Mỗi phút so commit trên GitHub với origin/<branch> đã fetch; khác thì chạy sync như `npm run sync`.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sync } from './sync.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const INTERVAL = 60_000;

/** @param {string[]} args @returns {Promise<string>} */
function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, encoding: 'utf8' }, (error, stdout, stderr) => (error ? reject(new Error(String(stderr || error.message).trim())) : resolve(stdout.trim())));
  });
}

async function tick() {
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const remote = (await git(['ls-remote', 'origin', `refs/heads/${branch}`])).split(/\s/)[0];
  const known = await git(['rev-parse', `origin/${branch}`]).catch(() => '');
  // sync() fetch trước rồi mới có thể dừng (file local khác bản GitHub), nên còn phải xem HEAD đã chứa origin chưa, không thì không bao giờ thử lại.
  const merged = await git(['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD']).then(() => true, () => false);
  if (remote && remote === known && merged) return;
  const result = await sync(root);
  console[result.ok ? 'log' : 'error'](result.message);
}

for (;;) {
  await tick().catch((error) => console.error(error instanceof Error ? error.message : String(error)));
  await new Promise((resolve) => setTimeout(resolve, INTERVAL));
}
