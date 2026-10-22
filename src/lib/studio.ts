/** Repository mà Studio và /admin/import/ đọc/ghi qua GitHub API. Không chứa secret. */
export const STUDIO_REPO = { name: 'Drakie14/CTF-WU', branch: 'main' } as const;

/** Key localStorage lưu GitHub PAT dùng chung cho Studio, import và cổng đăng nhập ở sidebar. */
export const STUDIO_TOKEN_KEY = 'ctf-wu.studio-token';
