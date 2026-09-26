import { bundledLanguagesInfo, isPlainLang } from 'shiki';
import { LANGUAGE_ALIASES, LANGUAGE_LABELS, SHELL_SESSION_ALIASES } from '../../config/code-languages';

/**
 * Phân tích info string của code fence theo kiểu HackMD:
 *   ```python     → python, cuộn ngang
 *   ```python!    → python, tự xuống dòng
 *   ```py!        → python (alias), tự xuống dòng
 *   ```python=    ```python=12   ```python=+   → bỏ phần `=...`
 *   ```=  hoặc không có language → plaintext
 *   ```abcxyz     → plaintext, giữ nhãn "ABCXYZ", `known: false` (caller in warning)
 */
export interface ResolvedLanguage {
  /** Id ngôn ngữ Shiki, hoặc 'plaintext'. */
  lang: string;
  /** Nhãn hiển thị ở góc code block. */
  label: string;
  /** `true` nếu có hậu tố `!` (tự xuống dòng). */
  wrap: boolean;
  /** Tên ngôn ngữ như viết trong Markdown (đã bỏ `!`/`=`). */
  original: string;
  /** `false` nếu ngôn ngữ không tồn tại trong Shiki và không có alias. */
  known: boolean;
}

const infoById = new Map(bundledLanguagesInfo.map((l) => [l.id, l]));
const idByAlias = new Map<string, string>();
for (const l of bundledLanguagesInfo) {
  idByAlias.set(l.id, l.id);
  for (const a of l.aliases ?? []) idByAlias.set(a, l.id);
}

export function parseFenceInfo(info: string | null | undefined): { name: string; wrap: boolean } {
  const token = (info ?? '').trim().split(/\s+/)[0] ?? '';
  const m = /^([^=!]*)(.*)$/.exec(token)!;
  return { name: m[1] ?? '', wrap: (m[2] ?? '').includes('!') };
}

export function resolveLanguage(info: string | null | undefined, code = ''): ResolvedLanguage {
  const { name, wrap } = parseFenceInfo(info);
  const lower = name.toLowerCase();
  const plain = (original: string, known = true, label = 'PLAINTEXT'): ResolvedLanguage => ({
    lang: 'plaintext',
    label,
    wrap,
    original,
    known,
  });

  if (!lower) return plain('');

  let target = LANGUAGE_ALIASES[lower] ?? lower;
  if (target === 'plaintext' || isPlainLang(target)) return plain(name);

  if (SHELL_SESSION_ALIASES.has(lower) && /^\$ /m.test(code)) target = 'shellsession';

  const id = idByAlias.get(target);
  if (!id) return plain(name, false, name.toUpperCase());

  const label = LANGUAGE_LABELS[id] ?? infoById.get(id)?.name.toUpperCase() ?? id.toUpperCase();
  return { lang: id, label, wrap, original: name, known: true };
}
