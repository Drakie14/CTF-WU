import path from 'node:path';
import { slugifyOrHash } from './slug';

/**
 * Suy ra thông tin từ đường dẫn file bài viết. Dùng `node:path` để chạy đúng
 * cả với đường dẫn Windows (backslash) lẫn POSIX.
 *
 * Cấu trúc hợp lệ (mục 7):
 *   posts/<slug>.md                 → slug = <slug>, không có CTF
 *   posts/<slug>/index.md           → slug = <slug>, không có CTF
 *   posts/<ctf>/<slug>/index.md     → slug = <slug>, CTF = <ctf>
 *   posts/<ctf>/<slug>.md           → slug = <slug>, CTF = <ctf>
 * Với cấu trúc lồng sâu hơn, CTF là thư mục cấp đầu tiên dưới `posts/`.
 */
export interface PathInfo {
  /** Tên file/thư mục gốc (chưa slug hóa) — dùng làm title tạm. */
  baseName: string;
  /** Slug URL của bài. */
  slug: string;
  /** Tên thư mục CTF (giữ nguyên để hiển thị), hoặc '' nếu không có. */
  folderCtf: string;
  /** Đường dẫn tương đối so với thư mục posts, dạng POSIX. */
  relPath: string;
}

function isIndexFile(fileName: string): boolean {
  return /^index\.md$/i.test(fileName);
}

export function getPathInfo(postsRoot: string, filePath: string): PathInfo {
  const rel = path.relative(postsRoot, filePath);
  const segments = rel.split(/[\\/]+/).filter(Boolean);
  const fileName = segments.at(-1) ?? '';

  // Thư mục chứa bài (bỏ file index.md) hoặc tên file (bỏ .md).
  let baseName: string;
  let dirSegments: string[];
  if (isIndexFile(fileName) && segments.length >= 2) {
    baseName = segments.at(-2) ?? '';
    dirSegments = segments.slice(0, -2);
  } else {
    baseName = fileName.replace(/\.md$/i, '');
    dirSegments = segments.slice(0, -1);
  }

  return {
    baseName,
    slug: slugifyOrHash(baseName, 'post'),
    folderCtf: dirSegments[0] ?? '',
    relPath: segments.join('/'),
  };
}
