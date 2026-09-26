import { createHash } from 'node:crypto';
import { existsSync, promises as fs, statSync } from 'node:fs';
import path from 'node:path';

/**
 * File đính kèm của bài viết được copy vào thư mục staging (gitignored)
 * `.cache/attachments/<hash>/<tên file>`; integration `attachments` copy thư mục
 * này vào `dist/attachments/` sau khi build và phục vụ nó khi `astro dev`.
 */
export const ATTACHMENTS_URL_PREFIX = '/attachments/';

export function attachmentsStagingDir(): string {
  return path.resolve(process.env.ATTACHMENTS_STAGING_DIR ?? path.join(process.cwd(), '.cache', 'attachments'));
}

export async function copyAttachment(absPath: string): Promise<{ url: string; name: string; size: number } | null> {
  if (!existsSync(absPath) || !statSync(absPath).isFile()) return null;
  const buf = await fs.readFile(absPath);
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 12);
  const name = path.basename(absPath);
  const dest = path.join(attachmentsStagingDir(), hash, name);
  if (!existsSync(dest)) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
  }
  return { url: `${ATTACHMENTS_URL_PREFIX}${hash}/${encodeURIComponent(name)}`, name, size: buf.byteLength };
}
