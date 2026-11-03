import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkMetadata } from '../src/lib/content/quality.ts';
const root = path.resolve('src/content/posts');
const walk = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true }))
        .filter((e) => !e.name.startsWith('.'))
        .map(async (e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])),
    )
  ).flat();
let errors = 0,
  infos = 0,
  posts = 0;
for (const file of (await walk(root)).filter((f) => f.endsWith('.md'))) {
  posts++;
  const rel = path.relative(root, file).split(path.sep).join('/');
  const parts = rel.split('/');
  const fileName = parts.pop();
  const baseName = fileName === 'index.md' ? parts.pop() : fileName.replace(/\.md$/i, '');
  for (const issue of checkMetadata(await readFile(file, 'utf8'), parts.join('/'), baseName)) {
    if (issue.severity === 'error') errors++;
    else infos++;
    console.log(`${issue.severity === 'error' ? 'ERROR' : 'INFO'} ${rel} [${issue.field}]: ${issue.message}`);
  }
}
console.log(`Metadata: ${posts} bài, ${errors} lỗi, ${infos} thông tin.`);
process.exitCode = errors ? 1 : 0;
