/** Tiện ích văn bản chạy lúc build: cắt summary, reading time. */

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Thời gian đọc (phút) — ~200 từ/phút, code tính 1/2. Tối thiểu 1. */
export function readingTimeMinutes(markdown: string): number {
  let codeWords = 0;
  const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, (block) => {
    codeWords += block.split(/\s+/).filter(Boolean).length;
    return ' ';
  });
  const words = prose.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return Math.max(1, Math.round((words + codeWords / 2) / 200));
}
