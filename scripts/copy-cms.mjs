// Self-host Sveltia CMS: chép bundle từ node_modules/@sveltia/cms vào public/admin/
// (không tải CMS từ CDN). Chạy tự động trước `dev` và `build` (predev/prebuild).
// File chép ra đã được gitignore — version được khóa bởi package-lock.json.
// Cross-platform: chỉ dùng Node.js API.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(root, 'node_modules', '@sveltia', 'cms');
const srcDist = path.join(pkgDir, 'dist');
const outDir = path.join(root, 'public', 'admin');

if (!existsSync(path.join(srcDist, 'sveltia-cms.js'))) {
  console.error('Không tìm thấy @sveltia/cms trong node_modules. Chạy "npm install" trước.');
  process.exit(1);
}

// Bundle chính (IIFE) + các chunk nó tự nạp lười theo đường dẫn tương đối
// (`new URL('chunks/<name>.js', document.currentScript.src)`). Bỏ qua source map.
const outChunks = path.join(outDir, 'chunks');
rmSync(outChunks, { recursive: true, force: true });
mkdirSync(outChunks, { recursive: true });

copyFileSync(path.join(srcDist, 'sveltia-cms.js'), path.join(outDir, 'sveltia-cms.js'));
let count = 1;
for (const name of readdirSync(path.join(srcDist, 'chunks'))) {
  if (!name.endsWith('.js')) continue;
  copyFileSync(path.join(srcDist, 'chunks', name), path.join(outChunks, name));
  count++;
}
copyFileSync(path.join(pkgDir, 'LICENSE.txt'), path.join(outDir, 'sveltia-cms.LICENSE.txt'));

const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
console.log(`Sveltia CMS ${version}: copied ${count} file(s) to public/admin/`);
