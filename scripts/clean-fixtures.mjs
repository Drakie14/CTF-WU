// Xóa thư mục fixtures (cross-platform).
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
rmSync(path.join(root, 'fixtures'), { recursive: true, force: true });
rmSync(path.join(root, 'dist-fixtures'), { recursive: true, force: true });
console.log('Removed fixtures/ and dist-fixtures/');
