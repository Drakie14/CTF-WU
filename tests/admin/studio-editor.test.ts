import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { insertIndent, insertLink, pasteLink, toggleMark, wrapSelection } from '../../src/lib/studio-editor';

/** `|` đánh dấu con trỏ, `[...]` đánh dấu vùng chọn (một vùng). */
function stateOf(marked: string) {
  const open = marked.indexOf('['), close = marked.indexOf(']');
  if (marked.includes('|')) {
    const at = marked.indexOf('|');
    return EditorState.create({ doc: marked.replace('|', ''), selection: EditorSelection.cursor(at) });
  }
  const doc = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
  return EditorState.create({ doc, selection: EditorSelection.single(open, close - 1) });
}
function show(state: EditorState, spec: TransactionSpec | null) {
  if (!spec) return null;
  const next = state.update(spec).state;
  const { from, to } = next.selection.main;
  const doc = next.doc.toString();
  return from === to ? `${doc.slice(0, from)}|${doc.slice(from)}` : `${doc.slice(0, from)}[${doc.slice(from, to)}]${doc.slice(to)}`;
}
const apply = (marked: string, edit: (state: EditorState) => TransactionSpec | null) => { const state = stateOf(marked); return show(state, edit(state)); };

describe('wrapSelection', () => {
  it('wraps the selection and keeps it selected so a second * makes bold', () => {
    expect(apply('ta [nhập] payload', (s) => wrapSelection(s, '`'))).toBe('ta `[nhập]` payload');
    expect(apply('xem [docs] nhé', (s) => wrapSelection(s, '['))).toBe('xem [[docs]] nhé');
    expect(apply('a [b] c', (s) => wrapSelection(s, '{'))).toBe('a {[b]} c');
    const once = stateOf('a [b] c');
    const twice = once.update(wrapSelection(once, '*')!).state;
    expect(show(twice, wrapSelection(twice, '*'))).toBe('a **[b]** c');
  });

  it('ignores plain typing and characters that are not pairs', () => {
    expect(wrapSelection(stateOf('a|b'), '`')).toBeNull();
    expect(wrapSelection(stateOf('a [b] c'), 'x')).toBeNull();
  });

  it('turns a multi-line selection into a fenced code block', () => {
    expect(apply('xem:\n[print(1)\nprint(2)]\nhết', (s) => wrapSelection(s, '`'))).toBe('xem:\n```|\nprint(1)\nprint(2)\n```\nhết');
  });

  it('uses double backticks when the code already contains one', () => {
    expect(apply('[a`b]', (s) => wrapSelection(s, '`'))).toBe('`` [a`b] ``');
  });
});

describe('toggleMark', () => {
  it('adds and removes marks around or inside the selection', () => {
    expect(apply('a [b] c', (s) => toggleMark(s, '**'))).toBe('a **[b]** c');
    expect(apply('a **[b]** c', (s) => toggleMark(s, '**'))).toBe('a [b] c');
    expect(apply('a [**b**] c', (s) => toggleMark(s, '**'))).toBe('a [b] c');
    expect(apply('a |c', (s) => toggleMark(s, '`'))).toBe('a `|`c');
  });

  it('does not mistake bold for italic', () => {
    expect(apply('a **[b]** c', (s) => toggleMark(s, '*'))).toBe('a ***[b]*** c');
    expect(apply('a *[b]* c', (s) => toggleMark(s, '*'))).toBe('a [b] c');
  });
});

describe('links', () => {
  it('Ctrl+K puts the cursor where the missing part goes', () => {
    expect(apply('xem [docs]', insertLink)).toBe('xem [docs](|)');
    expect(apply('[https://x.io]', insertLink)).toBe('[|](https://x.io)');
    expect(apply('|', insertLink)).toBe('[|]()');
  });

  it('pasting a URL over selected text makes a link', () => {
    expect(apply('xem [bài này] nhé', (s) => pasteLink(s, ' https://portswigger.net/web-security\n'))).toBe('xem [bài này](https://portswigger.net/web-security)| nhé');
    expect(pasteLink(stateOf('xem [bài này] nhé'), 'không phải url')).toBeNull();
    expect(pasteLink(stateOf('xem| nhé'), 'https://x.io')).toBeNull();
    expect(pasteLink(stateOf('[https://a.io]'), 'https://x.io')).toBeNull();
  });
});

describe('insertIndent', () => {
  it('nests a list item under the text of the item above', () => {
    expect(apply('- a\n- b|', insertIndent)).toBe('- a\n  - b|');
    expect(apply('1. a\n- b|', insertIndent)).toBe('1. a\n   - b|');
    expect(apply('- [ ] a\n- [ ] |b', insertIndent)).toBe('- [ ] a\n  - [ ] |b');
    expect(apply('- a\n  - x\n\n- |b', insertIndent)).toBe('- a\n  - x\n\n  - |b');
  });

  it('falls back to indentMore when the item is already nested', () => {
    expect(insertIndent(stateOf('- a\n  - b|'))).toBeNull();
    expect(insertIndent(stateOf('a [b] c'))).toBeNull();
  });

  it('inserts spaces to the next tab stop: 4 in code blocks, 2 in prose', () => {
    expect(apply('```py\nif x:\n|\n```', insertIndent)).toBe('```py\nif x:\n    |\n```');
    expect(apply('```py\n- a\n|- b\n```', insertIndent)).toBe('```py\n- a\n    |- b\n```');
    expect(apply('abc|', insertIndent)).toBe('abc |');
  });
});
