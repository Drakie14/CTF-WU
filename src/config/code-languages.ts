/**
 * CẤU HÌNH NGÔN NGỮ CODE BLOCK — file duy nhất cần sửa để thêm alias.
 *
 * - Key: tên viết trong Markdown (không phân biệt hoa thường), ví dụ ```py
 * - Value: id ngôn ngữ của Shiki (https://shiki.style/languages) hoặc 'plaintext'.
 *
 * Các alias sẵn có của Shiki (ví dụ `rb`, `rs`, `kt`, `yml`...) vẫn hoạt động
 * mà không cần khai báo ở đây. Bảng này chỉ bổ sung/ghi đè.
 *
 * Thêm alias mới: thêm một dòng, ví dụ `vuejs: 'vue',` — không cần sửa code xử lý.
 */
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  py: 'python',
  py3: 'python',
  python3: 'python',
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  console: 'bash',
  terminal: 'bash',
  ps: 'powershell',
  ps1: 'powershell',
  pwsh: 'powershell',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  h: 'c',
  yml: 'yaml',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext',
  cmd: 'bat',
  x86: 'asm',
  x86asm: 'asm',
  assembly: 'asm',
  nasm: 'asm',
  masm: 'asm',
  dockerfile: 'docker',
  sol: 'solidity',
};

/**
 * Alias nào được đổi sang `shellsession` nếu code có dòng bắt đầu bằng prompt `$ `
 * (tô màu prompt và output khác nhau).
 */
export const SHELL_SESSION_ALIASES: ReadonlySet<string> = new Set(['sh', 'zsh', 'console', 'terminal']);

/** Nhãn hiển thị ở góc code block. Ngôn ngữ không có ở đây dùng tên của Shiki. */
export const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  bash: 'BASH',
  shellscript: 'BASH',
  shellsession: 'SHELL',
  plaintext: 'PLAINTEXT',
  asm: 'ASM',
  docker: 'DOCKERFILE',
};
