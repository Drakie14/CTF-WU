import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';

/** Gõ ký tự mở khi đang bôi đen thì bọc vùng chọn, như VS Code. Giữ vùng chọn bên trong để gõ `*` lần nữa ra chữ đậm. */
const PAIRS: Record<string, [string, string]> = {
  '`': ['`', '`'], '[': ['[', ']'], '(': ['(', ')'], '{': ['{', '}'], '<': ['<', '>'],
  '"': ['"', '"'], "'": ["'", "'"], '*': ['*', '*'], '_': ['_', '_'], '~': ['~', '~'], '=': ['=', '='], '$': ['$', '$'],
};

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+(\[[ xX]\]\s+)?)/;
const FENCE = /^\s*(```|~~~)/;
export const isUrl = (text: string) => /^https?:\/\/\S+$/i.test(text);

const typed = (spec: TransactionSpec): TransactionSpec => ({ ...spec, scrollIntoView: true, userEvent: 'input.type' });

export function wrapSelection(state: EditorState, text: string): TransactionSpec | null {
  const pair = PAIRS[text];
  const { ranges, main } = state.selection;
  if (!pair || ranges.some((range) => range.empty)) return null;
  // Bôi đen nhiều dòng rồi gõ ` thì thành code block, con trỏ đứng sau ``` để gõ tên ngôn ngữ.
  if (text === '`' && ranges.length === 1 && state.doc.lineAt(main.from).number !== state.doc.lineAt(main.to).number) {
    const first = state.doc.lineAt(main.from);
    let last = state.doc.lineAt(main.to);
    if (main.to === last.from) last = state.doc.line(last.number - 1);
    return typed({ changes: [{ from: first.from, insert: '```\n' }, { from: last.to, insert: '\n```' }], selection: { anchor: first.from + 3 } });
  }
  return typed(state.changeByRange((range) => {
    let [open, close] = pair;
    if (text === '`' && state.sliceDoc(range.from, range.to).includes('`')) [open, close] = ['`` ', ' ``'];
    return { changes: [{ from: range.from, insert: open }, { from: range.to, insert: close }], range: EditorSelection.range(range.anchor + open.length, range.head + open.length) };
  }));
}

/** Ctrl+B / Ctrl+I / Ctrl+E: bọc hoặc gỡ `mark` quanh vùng chọn (kể cả khi mark nằm ngay ngoài vùng chọn). */
export function toggleMark(state: EditorState, mark: string): TransactionSpec {
  const size = mark.length;
  // `*` ngoài cùng của `**đậm**` không phải mark nghiêng.
  const bare = (pos: number) => size > 1 || state.sliceDoc(pos - 1, pos) !== mark;
  return typed(state.changeByRange((range) => {
    const { from, to } = range;
    const inner = state.sliceDoc(from, to);
    if (state.sliceDoc(from - size, from) === mark && state.sliceDoc(to, to + size) === mark && bare(from - size) && bare(to + 2 * size)) {
      return { changes: [{ from: from - size, to: from }, { from: to, to: to + size }], range: EditorSelection.range(from - size, to - size) };
    }
    if (inner.length >= 2 * size && inner.startsWith(mark) && inner.endsWith(mark)) {
      return { changes: [{ from, to: from + size }, { from: to - size, to }], range: EditorSelection.range(from, to - 2 * size) };
    }
    return { changes: [{ from, insert: mark }, { from: to, insert: mark }], range: EditorSelection.range(from + size, to + size) };
  }));
}

/** Ctrl+K: chữ thường → `[chữ]()` và đứng trong ngoặc tròn; URL → `[](url)` và đứng trong ngoặc vuông. */
export function insertLink(state: EditorState): TransactionSpec {
  return typed(state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const insert = isUrl(text) ? `[](${text})` : `[${text}]()`;
    const cursor = range.from + (isUrl(text) || !text ? 1 : text.length + 3);
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(cursor) };
  }));
}

/** Dán URL khi đang bôi đen chữ (một dòng) thì thành link `[chữ](url)`. */
export function pasteLink(state: EditorState, pasted: string): TransactionSpec | null {
  const url = pasted.trim();
  const usable = state.selection.ranges.every((range) => {
    const text = state.sliceDoc(range.from, range.to);
    return text && !text.includes('\n') && !isUrl(text);
  });
  if (!isUrl(url) || !usable) return null;
  return { ...state.changeByRange((range) => {
    const insert = `[${state.sliceDoc(range.from, range.to)}](${url})`;
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + insert.length) };
  }), scrollIntoView: true, userEvent: 'input.paste' };
}

function insideFence(state: EditorState, lineNumber: number) {
  let open = false;
  for (let number = 1; number < lineNumber; number++) if (FENCE.test(state.doc.line(number).text)) open = !open;
  return open;
}

/** Cột bắt đầu chữ của item cùng cấp gần nhất phía trên (bỏ qua item con thụt sâu hơn và dòng trống). */
function parentColumn(state: EditorState, lineNumber: number, indent: number) {
  for (let number = lineNumber - 1; number >= 1; number--) {
    const text = state.doc.line(number).text;
    const item = LIST_ITEM.exec(text);
    if (!item) { if (!text.trim() || /^\s/.test(text)) continue; return 0; }
    if (item[1].length <= indent) return item[1].length + item[2].length + item[3].length - (item[4]?.length ?? 0);
  }
  return 0;
}

/**
 * Tab khi không bôi đen:
 * - dòng list → thụt cả dòng, thẳng hàng với chữ của item phía trên để thành list con (`1. ` cần 3 dấu cách, `- ` cần 2);
 * - trong code block → chèn dấu cách tới tab stop 4 cột;
 * - còn lại → chèn dấu cách tới tab stop 2 cột.
 * Trả null khi nên để `indentMore` lo (đang bôi đen, hoặc item list đã thụt sâu hơn item trên).
 */
export function insertIndent(state: EditorState): TransactionSpec | null {
  const { ranges, main } = state.selection;
  if (ranges.length !== 1 || !main.empty) return null;
  const line = state.doc.lineAt(main.head);
  const code = insideFence(state, line.number);
  const item = !code && LIST_ITEM.exec(line.text);
  if (item) {
    const indent = item[1].length;
    const target = parentColumn(state, line.number, indent);
    if (target <= indent) return null;
    const add = target - indent;
    return typed({ changes: { from: line.from, insert: ' '.repeat(add) }, selection: { anchor: main.head + add } });
  }
  const stop = code ? 4 : 2;
  const spaces = ' '.repeat(stop - ((main.head - line.from) % stop));
  return typed({ changes: { from: main.head, insert: spaces }, selection: { anchor: main.head + spaces.length } });
}
