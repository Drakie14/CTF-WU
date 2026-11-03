import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const astroPackage = require.resolve('astro/package.json');
const astroBin = path.resolve(
  path.dirname(astroPackage),
  JSON.parse(await readFile(astroPackage, 'utf8')).bin.astro ??
    JSON.parse(await readFile(astroPackage, 'utf8')).bin,
);
let failedWarning = false;
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [astroBin, 'build'], { stdio: ['inherit', 'pipe', 'pipe'] });
  const watch = (stream) => {
    let pending = '';
    stream.on('data', (chunk) => {
      process.stdout.write(chunk);
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) if (/\[WARN\]|\[markdown\]\s/.test(line)) failedWarning = true;
    });
    stream.on('end', () => {
      if (/\[WARN\]|\[markdown\]\s/.test(pending)) failedWarning = true;
    });
  };
  watch(child.stdout);
  watch(child.stderr);
  child.on('error', reject);
  child.on('close', (code) => (code ? reject(new Error(`astro build exit ${code}`)) : resolve()));
}).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
if (failedWarning) {
  console.error('Build có cảnh báo Markdown/metadata. Sửa cảnh báo trước khi deploy.');
  process.exit(1);
}
