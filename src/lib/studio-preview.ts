import { marked } from 'marked';

/** Phần tiền xử lý và dựng HTML của preview Studio, tách ra thuần để test. Mọi bước tiền xử lý giữ nguyên số dòng của nguồn, nên `data-line` luôn là dòng trong editor. */

const OPTIONS = { gfm: true, breaks: true } as const;
const newlines = (value: string) => value.split('\n').length - 1;

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** `:::spoiler Tiêu đề` ... `:::` thành cặp comment `<!--spoiler:…-->` / `<!--/spoiler-->`, mỗi comment một dòng nên số dòng không đổi và nội dung giữa vẫn là markdown thường; preview gom phần giữa vào `<details>`. Chạy trước `normalizeCallouts` để `:::` đóng spoiler không bị callout nhận nhầm. */
export function normalizeSpoilers(source: string) {
  const stack: boolean[] = [];
  let fence: string | undefined;
  return source.split('\n').map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) { if (marker && marker[0] === fence[0] && marker.length >= fence.length && !line.trim().slice(marker.length).trim()) fence = undefined; return line; }
    if (marker) { fence = marker; return line; }
    const open = /^:::(\w+)(?:\s+(.*))?$/.exec(line.trim());
    if (open) {
      const spoiler = open[1].toLowerCase() === 'spoiler';
      stack.push(spoiler);
      return spoiler ? `<!--spoiler:${escapeHtml((open[2] || 'Spoiler').trim()).replace(/--/g, '&#45;&#45;')}-->` : line;
    }
    if (/^:::\s*$/.test(line) && stack.length) return stack.pop() ? '<!--/spoiler-->' : line;
    return line;
  }).join('\n');
}

/** `:::info` ... `:::` thành blockquote callout. Dòng `:::` đóng bị bỏ nên bù lại bằng dòng trống để số dòng không đổi. */
export function normalizeCallouts(source: string) {
  return source.replace(/^:::(info|warning|note|tip|danger|success)(?:\s+([^\n]+))?\s*\n([\s\S]*?)^:::\s*$/gim, (all, kind, heading, content) => {
    const title = heading || kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase();
    const callout = `> [!${kind.toUpperCase()}] ${title}\n> ${content.trim().replace(/\n/g, '\n> ')}`;
    return callout + '\n'.repeat(Math.max(0, newlines(all) - newlines(callout)));
  });
}

export function prepareExtensions(source: string) {
  const protectedCode: string[] = [];
  const protect = (value: string) => {
    const marker = `STUDIOPROTECTEDCODE${protectedCode.length}END`;
    protectedCode.push(value);
    return marker;
  };
  // Chỉ mở rộng cú pháp trong phần văn bản. Dollar trong PHP/shell và các
  // dấu == trong source code phải được giữ nguyên như HackMD.
  const lines = source.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [];
  let fencedBlock = '';
  let fence: { char: string; length: number } | undefined;
  const shielded: string[] = [];
  for (const line of lines) {
    const text = line.replace(/\r?\n$/, '');
    if (!fence) {
      const opening = /^ {0,3}(`{3,}|~{3,})/.exec(text)?.[1];
      if (opening) {
        fence = { char: opening[0], length: opening.length };
        fencedBlock = line;
      } else shielded.push(line);
      continue;
    }
    fencedBlock += line;
    const closing = new RegExp(`^ {0,3}${fence.char === '`' ? '`' : '~'}{${fence.length},}[\\t ]*$`).test(text);
    if (closing) {
      shielded.push(protect(fencedBlock));
      fencedBlock = '';
      fence = undefined;
    }
  }
  if (fencedBlock) shielded.push(protect(fencedBlock));
  source = shielded.join('');
  source = source.replace(/(`+)([^`\n]+?)\1/g, (code) => protect(code));
  const footnotes: string[] = [];
  const withoutDefinitions = source.replace(/^\[\^(\d+)\]:[ \t]*(.+)$/gim, (_all, id, content) => { footnotes[Number(id) - 1] = content; return ''; });
  const withNotes = withoutDefinitions.replace(/\[\^(\d+)\]/g, (_all, id) => `<sup class="footnote-ref"><a href="#footnote-${id}">[${id}]</a></sup>`);
  const withHighlight = withNotes.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  // `$$` nhiều dòng gom về một thẻ span; số dòng bị `trim()` làm rơi được bù bằng dòng chú thích TeX (`%`) nằm trong attribute, để không sinh dòng trống cắt đoạn.
  const displayMath = (all: string, expression: string) => `<span data-latex="${escapeHtml(expression.trim())}${'\n%'.repeat(Math.max(0, newlines(all) - newlines(expression.trim())))}" data-display="true"></span>`;
  const withMath = withHighlight.replace(/\$\$\s*([\s\S]+?)\s*\$\$/g, displayMath).replace(/\$([^$\n]+)\$/g, (_all, expression) => `<span data-latex="${escapeHtml(expression.trim())}"></span>`);
  const withToc = withMath.replace(/^\[TOC\][ \t]*$/gim, '');
  const expanded = !footnotes.length ? withToc : `${withToc}\n\n<section class="footnotes"><hr><ol>${footnotes.map((content, index) => content ? `<li id="footnote-${index + 1}">${content}</li>` : '').join('')}</ol></section>`;
  return expanded.replace(/STUDIOPROTECTEDCODE(\d+)END/g, (_marker, index) => protectedCode[Number(index)] ?? _marker);
}

/** Render từng khối cấp cao nhất và gắn `data-line` (dòng bắt đầu, 0-based) cùng `data-end` (dòng kế sau khối) vào phần tử ngoài cùng. Khối nằm sau dòng cuối của nguồn (phần chú thích chân trang) không được gắn. */
export function renderBlocks(source: string, totalLines = newlines(source) + 1): string {
  source = source.replace(/\r\n?/g, '\n');
  const tokens = marked.lexer(source, OPTIONS);
  let line = 0;
  let html = '';
  for (const token of tokens) {
    const start = line + newlines(/^(?:[ \t]*\n)*/.exec(token.raw)![0]);
    const end = line + newlines(token.raw.replace(/\s+$/, '')) + 1;
    line += newlines(token.raw);
    if (token.type === 'space') continue;
    const rendered = marked.parser(Object.assign([token], { links: tokens.links }), OPTIONS);
    html += start < totalLines ? rendered.replace(/^<([a-z][\w-]*)/i, `<$1 data-line="${start}" data-end="${Math.min(end, totalLines)}"`) : rendered;
  }
  return html;
}

export type Anchor = { line: number; top: number };

/** Sắp mốc theo dòng, thêm hai mốc biên (0, 0) và (tổng số dòng, chiều cao), ép dòng và top không giảm để nội suy không bị đảo chiều. */
export function normalizeAnchors(raw: Anchor[], totalLines: number, height: number): Anchor[] {
  const anchors: Anchor[] = [{ line: 0, top: 0 }];
  for (const { line, top } of raw) {
    const last = anchors[anchors.length - 1];
    // Mốc có line/top không hữu hạn (VD khối không có data-end) bị hút về mốc trước, để nội suy không sinh NaN và làm `doc.line(NaN)` ném lỗi.
    const safeLine = Number.isFinite(line) ? line : last.line;
    const safeTop = Number.isFinite(top) ? top : last.top;
    anchors.push({ line: Math.min(Math.max(safeLine, last.line), totalLines), top: Math.min(Math.max(safeTop, last.top), Math.max(height, last.top)) });
  }
  const last = anchors[anchors.length - 1];
  anchors.push({ line: Math.max(totalLines, last.line), top: Math.max(height, last.top) });
  return anchors;
}

/** Chỉ số mốc cuối cùng có `key` không vượt `value`; mảng đã không giảm theo `key`. */
function lastAtMost(anchors: Anchor[], key: 'line' | 'top', value: number) {
  let low = 0;
  let high = anchors.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (anchors[mid][key] <= value) low = mid; else high = mid - 1;
  }
  return low;
}

/** Nội suy tuyến tính giữa hai mốc kề nhau. Dòng có thể có phần lẻ. */
export function lineToTop(anchors: Anchor[], line: number): number {
  if (!anchors.length) return 0;
  const i = lastAtMost(anchors, 'line', line);
  const a = anchors[i];
  const b = anchors[i + 1];
  return b ? a.top + ((line - a.line) / (b.line - a.line)) * (b.top - a.top) : a.top;
}

export function topToLine(anchors: Anchor[], top: number): number {
  if (!anchors.length) return 0;
  const i = lastAtMost(anchors, 'top', top);
  const a = anchors[i];
  const b = anchors[i + 1];
  return b ? a.line + ((top - a.top) / (b.top - a.top)) * (b.line - a.line) : a.line;
}
