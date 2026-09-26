import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Tải ảnh remote (hackmd.io/_uploads, imgur...) LÚC BUILD vào cache local
 * (`.cache/remote-images/`, đã gitignore). Sau đó ảnh được xử lý như ảnh local
 * bằng `astro:assets` → AVIF/WebP, có width/height, không fetch từ browser.
 *
 * Build sau dùng lại file trong cache, không tải lại.
 */

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
};
const KNOWN_EXTS = [...new Set(Object.values(EXT_BY_TYPE))];
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 20_000;

function remoteImageCacheDir(): string {
  return path.resolve(process.env.REMOTE_IMAGE_CACHE_DIR ?? path.join(process.cwd(), '.cache', 'remote-images'));
}

export function isRemoteUrl(src: string): boolean {
  return /^(https?:)?\/\//i.test(src);
}

function sniffExt(buf: Uint8Array): string | null {
  const b = (i: number) => buf[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return 'png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'jpg';
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46) return 'gif';
  const ascii = new TextDecoder().decode(buf.subarray(0, 64));
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') return 'webp';
  if (ascii.slice(4, 12) === 'ftypavif' || ascii.slice(4, 12) === 'ftypavis') return 'avif';
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(new TextDecoder().decode(buf.subarray(0, 512)))) return 'svg';
  return null;
}

const inFlight = new Map<string, Promise<string>>();

/**
 * Trả về đường dẫn tuyệt đối của ảnh đã cache; throw Error (có message rõ ràng)
 * nếu không tải được — caller chịu trách nhiệm chuyển thành warning.
 */
export function fetchRemoteImage(rawUrl: string): Promise<string> {
  const url = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
  let p = inFlight.get(url);
  if (!p) {
    p = download(url);
    inFlight.set(url, p);
    p.catch(() => inFlight.delete(url));
  }
  return p;
}

async function download(url: string): Promise<string> {
  const dir = remoteImageCacheDir();
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 32);
  for (const ext of KNOWN_EXTS) {
    const cached = path.join(dir, `${hash}.${ext}`);
    if (existsSync(cached)) return cached;
  }

  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; ctf-writeups-build/1.0)', accept: 'image/*' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw new Error(`image too large (${declared} bytes)`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error(`image too large (${buf.byteLength} bytes)`);

  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = sniffExt(buf) ?? EXT_BY_TYPE[type];
  if (!ext) throw new Error(`response is not an image (content-type: ${type || 'unknown'})`);

  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${hash}.${ext}`);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, target);
  return target;
}
