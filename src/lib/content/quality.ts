import { normalizeFrontmatter, splitFrontmatter } from './frontmatter.ts';
import { ctfFromFolder } from '../studio.ts';

export interface ContentIssue {
  field: string;
  message: string;
  severity: 'error' | 'info';
}
/** Chỉ kiểm metadata. Không phán xét văn phong, payload, flag hay mức hoàn thiện bài. */
export function checkMetadata(source: string, folder: string, baseName = 'Untitled'): ContentIssue[] {
  const split = splitFrontmatter(source);
  if (split.error) return [{ field: 'frontmatter', message: split.error, severity: 'error' }];
  const expectedCtf = ctfFromFolder(folder);
  const { warnings } = normalizeFrontmatter(split.data, {
    file: '',
    baseName,
    folderCtf: expectedCtf,
    fallbackDate: new Date(0),
    fallbackDateSource: 'mtime',
  });
  const issues: ContentIssue[] = warnings.map((w) => ({
    field: w.field,
    message: w.message,
    severity: 'error',
  }));
  if (typeof split.data.ctf === 'string' && expectedCtf && split.data.ctf !== expectedCtf)
    issues.push({
      field: 'ctf',
      message: `"${split.data.ctf}" khác thư mục giải "${expectedCtf}"`,
      severity: 'error',
    });
  // Date và CTF thiếu được loader suy ra hợp lệ, chỉ nhắc để tác giả chủ động bổ sung.
  for (const field of ['date', 'ctf'] as const)
    if (!split.data[field])
      issues.push({ field, message: 'đang dùng giá trị suy ra từ Git/thư mục', severity: 'info' });
  return issues;
}
