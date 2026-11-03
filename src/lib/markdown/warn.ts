import type { VFile } from 'vfile';

/** Đường dẫn file đang render (tương đối so với project) để in warning. */
function fileLabel(file: VFile | undefined): string {
  const p = file?.path;
  if (!p) return '<markdown>';
  return p.replace(/\\/g, '/');
}

/** Warning lúc build — không bao giờ throw. */
export function markdownWarn(file: VFile | undefined, message: string): void {
  console.warn(`[markdown] ${fileLabel(file)} — ${message}`);
}
