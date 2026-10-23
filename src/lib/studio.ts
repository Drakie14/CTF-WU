/** Repository mà Studio và /admin/import/ đọc/ghi qua GitHub API. Không chứa secret. */
export const STUDIO_REPO = { name: 'Drakie14/CTF-WU', branch: 'main' } as const;

/** Key localStorage lưu GitHub PAT dùng chung cho Studio, import và cổng đăng nhập ở sidebar. */
export const STUDIO_TOKEN_KEY = 'ctf-wu.studio-token';

/** Thư mục cấp đầu chỉ để gom nhiều giải (VD `CTF Tournament`), tên giải nằm ở cấp hai. */
const CONTAINER_FOLDER = /\b(tournaments?|competitions?|events?|contests?)\b/i;

/**
 * Tên CTF mặc định cho bài trong `folder`: thư mục cấp đầu (`Dreamhack/Extra/Bronze`
 * → `Dreamhack`), trừ thư mục gom giải (`CTF Tournament/CSS CTF` → `CSS CTF`).
 */
export function ctfFromFolder(folder: string): string {
  const [first = '', second] = folder.split('/').map((s) => s.trim()).filter(Boolean);
  return second && CONTAINER_FOLDER.test(first) ? second : first;
}
