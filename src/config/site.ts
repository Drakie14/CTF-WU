/**
 * Thông tin chung của blog — sửa ở đây để đổi tên, mô tả, tác giả.
 * (URL gốc của site đặt bằng biến môi trường SITE_URL, xem astro.config.mjs.)
 */
export const SITE = {
  name: 'CTF Write-ups',
  shortName: 'CTF//WU',
  description: 'CTF Write-up của Drakie14 // Chuyên về web',
  motto: 'Shooting for the star',
  school: 'UIT — Trường ĐH Công nghệ Thông tin, ĐHQG-HCM',
  schoolUrl: 'https://www.uit.edu.vn/',
  author: 'Drakie14',
  locale: 'vi_VN',
  lang: 'vi',
} as const;

/**
 * Link mạng xã hội hiện ở /about. Để trống ('') để ẩn một mục.
 * TODO: thay bằng link thật của bạn.
 */
export const SOCIALS = {
  github: 'https://github.com/drakie14',
  discord: 'https://discord.com/users/drakie14',
  facebook: 'https://web.facebook.com/Drakie14',
} as const;

/** Số bài mỗi trang của /archive (mục 21). */
export const ARCHIVE_PAGE_SIZE = 20;
