import GithubSlugger from 'github-slugger';
import { getStored, putStored, removeStored, putDraftAssets, getDraftAssets } from '../lib/studio-storage';
import { bundledLanguagesInfo, codeToHtml } from 'shiki/bundle/full';
import { stringify as stringifyYaml } from 'yaml';
import { STUDIO_REPO, STUDIO_TOKEN_KEY, ctfFromFolder } from '../lib/studio';
import { localPostsDirectory, probeLocalStudio } from '../lib/studio-local-fs';
import { slugify } from '../lib/content/slug';
import {
  buildVocabulary,
  canonicalTag,
  mergeAiTags,
  suggestTags,
  tagKey,
  type TagSuggestion,
  type TagTerm,
} from '../lib/studio-tags';
import { geminiSuggestTags } from '../lib/studio-gemini-tags';
import { dreamhackChallengeId } from '../lib/dreamhack';
import type { TagExample } from '../lib/tag-prompt';
import { EditorState, Prec, type Extension, type TransactionSpec } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { type Anchor, escapeHtml, lineToTop, normalizeAnchors, topToLine } from '../lib/studio-preview';
import {
  codeFenceLanguages,
  insertIndent,
  insertLink,
  pasteLink,
  toggleMark,
  wrapSelection,
} from '../lib/studio-editor';
import { reconcileAction } from '../lib/studio-sync';
import { LANGUAGE_ALIASES } from '../config/code-languages';
import { acceptCompletion, autocompletion } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import 'katex/dist/katex.min.css';
import { renderDiagrams } from './diagrams';
import { renderStudioMarkdown } from '../lib/studio-renderer';
import { publishArticle } from '../lib/studio-publish';
import { checkMetadata } from '../lib/content/quality';
import { composeDocument, readDocument } from '../lib/studio-document';
import { formatIsoDate } from '../lib/content/dates';

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const summary = $<HTMLTextAreaElement>('[data-summary]');
const title = $<HTMLInputElement>('[data-title]');
const folder = $<HTMLInputElement>('[data-folder]');
const date = $<HTMLInputElement>('[data-date]');
const ctf = $<HTMLInputElement>('[data-ctf]');
const category = $<HTMLInputElement>('[data-category]');
const difficulty = $<HTMLInputElement>('[data-difficulty]');
const tags = $<HTMLInputElement>('[data-tags]');
const preview = $('[data-preview]');
const previewState = $('[data-preview-state]');
const status = $('[data-status]');
const libraryStatus = $('[data-library-status]');
const tokenInput = $<HTMLInputElement>('[data-token]');
const assetsInput = $<HTMLInputElement>('[data-assets]');

/** remote: file đã có trên GitHub, chỉ hiện tên để chèn lại; file rỗng nên không bao giờ upload hay ghi ra local. */
type Asset = { file: File; name: string; url: string; remote?: true };
type RepoFile = { path: string; sha: string };
type LocalDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
};
type ListableDirectory = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
};
type Draft = {
  originalSource?: string;
  summary?: string;
  title: string;
  folder: string;
  date: string;
  ctf: string;
  category: string;
  difficulty: string;
  tags: string;
  source: string;
  base?: string;
};
let repo = { name: '', branch: 'main' };
let openFile: RepoFile | undefined;
let assets: Asset[] = [];
/** Ảnh đã ghi xuống thư mục nháp local rồi bị bấm ×: Publish xoá luôn file, không thì thành untracked mồ côi. */
let droppedAssets: Asset[] = [];
let renderVersion = 0;
let localDirectory: LocalDirectoryHandle | undefined;
let editor!: EditorView;
let repoFiles: RepoFile[] = [];
let repoTree: Array<{ path: string; sha: string; type: string }> = [];
let remoteBlobs: Array<{ path: string; sha: string; type: string }> = [];
type PendingFolders = { entries: TreeEntry[]; messages: string[] };
const pendingKey = 'ctf-wu.studio.pending-folders';
function readPending(): PendingFolders {
  try {
    return JSON.parse(localStorage.getItem(pendingKey) ?? '') as PendingFolders;
  } catch {
    return { entries: [], messages: [] };
  }
}
function writePending() {
  try {
    if (pending.messages.length) localStorage.setItem(pendingKey, JSON.stringify(pending));
    else localStorage.removeItem(pendingKey);
  } catch {
    /* storage unavailable */
  }
}
let pending: PendingFolders = readPending();
let localPermission: PermissionState = 'prompt';
let githubConnected = false;
/** Mở qua `npm run dev`: đọc/ghi git và thư mục posts trên máy qua dev server, không cần token hay chọn thư mục. */
let localMode = false;
type SyncMode = 'off' | 'scroll' | 'follow';
type SyncSide = 'editor' | 'preview';
type PreviewBlock = { el: HTMLElement; line: number; end: number; top: number; bottom: number };
const syncModeKey = 'ctf-wu.studio.sync-mode';
const assetsOpenKey = 'ctf-wu.studio.assets-open';
const assetMime = 'application/x-studio-asset';
let syncMode: SyncMode = (() => {
  try {
    const saved = localStorage.getItem(syncModeKey);
    return saved === 'off' || saved === 'scroll' || saved === 'follow' ? saved : 'follow';
  } catch {
    return 'follow';
  }
})();
let anchors: Anchor[] = [];
let previewBlocks: PreviewBlock[] = [];
/** Dòng nguồn (có phần lẻ) đang nằm ở đỉnh preview: khối neo để giữ vị trí khi render lại hoặc layout đổi. */
let viewLine = 0;
const scrollLockUntil: Record<SyncSide, number> = { editor: 0, preview: 0 };
let syncSide: SyncSide | undefined;
let syncFrame = 0;
let layoutFrame = 0;
let followFrame = 0;
let skipFollow = false;
let cursorMovedAt = 0;
let cursorBlockLine: number | undefined;
let cursorBlockTimer: ReturnType<typeof setTimeout> | undefined;
let usageTimer: ReturnType<typeof setTimeout> | undefined;
let layoutObserver: ResizeObserver | undefined;
const observedBlocks = new WeakSet<Element>();
let renderPending: Promise<void> | undefined;
let tocScroll: (() => void) | undefined;
const imageSizes = new Map<string, { w: number; h: number }>();
const highlightCache = new Map<string, string>();
let activeFolder: string | undefined;
const treeOpenKey = 'ctf-wu.studio.tree-open';
const treeOpen = new Set<string>(
  (() => {
    try {
      return JSON.parse(localStorage.getItem(treeOpenKey) ?? '[]') as string[];
    } catch {
      return [];
    }
  })(),
);
const saveTreeOpen = () => {
  try {
    localStorage.setItem(treeOpenKey, JSON.stringify([...treeOpen]));
  } catch {
    /* storage unavailable */
  }
};
const selectedFiles = new Set<string>();
const selectedFolders = new Set<string>();
let folderSet = new Set<string>();
let draftTimer: ReturnType<typeof setTimeout> | undefined;
// Write-up chưa publish nằm trong thư mục posts local. Chỉ file Studio vừa tạo trong phiên này
// (owned) mới được đổi tên thư mục theo tiêu đề; file mở lại từ đĩa giữ nguyên đường dẫn.
let localDraftPath: string | undefined;
let localDraftOwned = false;
let localOnly: RepoFile[] = [];
let localWrite: Promise<void> = Promise.resolve();
const writtenAssets = new Set<Asset>();

const editorSource = () => editor.state.doc.toString();
let editorExtensions: Extension[] = [];
/** Nạp bài mới: báo cho preview/nháp như một lần sửa, rồi dựng lại state để Ctrl+Z không lùi về bài trước. */
function setEditorSource(source: string) {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
  editor.setState(EditorState.create({ doc: source, extensions: editorExtensions }));
  viewLine = 0;
}
const run = (view: EditorView, spec: TransactionSpec | null) => {
  if (spec) view.dispatch(spec);
  return Boolean(spec);
};
function initEditor() {
  editorExtensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    search({ top: true }),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    oneDark,
    markdown({ codeLanguages: languages }),
    autocompletion({ override: [codeFenceLanguages(bundledLanguagesInfo, LANGUAGE_ALIASES)] }),
    EditorView.inputHandler.of((view, _from, _to, text) => {
      const spec = wrapSelection(view.state, text);
      if (spec) view.dispatch(spec);
      return Boolean(spec);
    }),
    Prec.high(
      EditorView.domEventHandlers({
        paste: (event, view) => {
          if (!run(view, pasteLink(view.state, event.clipboardData?.getData('text/plain') ?? '')))
            return false;
          event.preventDefault();
          return true;
        },
      }),
    ),
    Prec.high(
      keymap.of([
        {
          key: 'Tab',
          run: (view) => acceptCompletion(view) || run(view, insertIndent(view.state)) || indentMore(view),
          shift: indentLess,
        },
        { key: 'Mod-b', run: (view) => run(view, toggleMark(view.state, '**')) },
        { key: 'Mod-i', run: (view) => run(view, toggleMark(view.state, '*')) },
        { key: 'Mod-e', run: (view) => run(view, toggleMark(view.state, '`')) },
        { key: 'Mod-Shift-x', run: (view) => run(view, toggleMark(view.state, '~~')) },
        { key: 'Mod-k', run: (view) => run(view, insertLink(view.state)) },
      ]),
    ),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorState.allowMultipleSelections.of(true),
    Prec.high(
      EditorView.domEventHandlers({
        dragover: (event) => {
          const types = [...(event.dataTransfer?.types ?? [])];
          if (!types.includes('Files') && !types.includes(assetMime)) return false;
          event.preventDefault();
          return true;
        },
        drop: (event, view) => {
          const pos =
            view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
          const dropped = assets.find((asset) => asset.name === event.dataTransfer?.getData(assetMime));
          if (dropped) {
            event.preventDefault();
            insertOwnLine(assetMarkdown(dropped), pos);
            return true;
          }
          if (!event.dataTransfer?.files.length) return false;
          event.preventDefault();
          view.dispatch({ selection: { anchor: pos } });
          addFiles(event.dataTransfer.files);
          return true;
        },
      }),
    ),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        scheduleDraft();
        scheduleUsage();
        void renderPreview().then(scheduleFollow);
        shiftViewLine(update);
      }
      if (update.docChanged || update.selectionSet) {
        cursorMovedAt = performance.now();
        if (!update.docChanged) scheduleFollow();
      }
    }),
  ];
  editor = new EditorView({
    state: EditorState.create({ doc: '', extensions: editorExtensions }),
    parent: $('[data-editor]'),
  });
  editor.contentDOM.addEventListener('paste', (event) => {
    const images = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (images.length) {
      event.preventDefault();
      addFiles(images);
    }
  });
}

const draftKey = () => `ctf-wu.studio.draft.${openFile?.path ?? `new:${relativeFolder()}`}`;
/** Hash bản GitHub mà editor đang dựa vào: nháp của bản cũ hơn thì không tự đè lên bản mới. */
let draftBase = '';
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = undefined;
    saveDraft();
  }, 450);
}
/** Ghi nốt nháp đang chờ và đợi chuỗi ghi file local xong trước khi đổi bài, để không ghi nội dung bài này vào thư mục bài kia. */
async function settleDraft() {
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = undefined;
    saveDraft();
  }
  await localWrite;
}
function saveDraft() {
  if ($('[data-composer]').hasAttribute('hidden') || !(title.value.trim() || editorSource().trim())) return;
  if (!openFile) {
    queueLocalSave();
    if (localDraftPath) return;
  }
  const draft: Draft = {
    originalSource,
    summary: summary.value,
    title: title.value,
    folder: folder.value,
    date: date.value,
    ctf: ctf.value,
    category: category.value,
    difficulty: difficulty.value,
    tags: tags.value,
    source: editorSource(),
    ...(openFile ? { base: draftBase } : {}),
  };
  localStorage.setItem(draftKey(), JSON.stringify(draft));
  saveDraftAssets();
  $('[data-save-state]').textContent = 'Nháp lưu trong trình duyệt';
}
function queueLocalSave() {
  localWrite = localWrite.then(saveLocalDraft).catch(async (error) => {
    if (!(await dropStaleLocalDirectory())) setStatus(errorMessage(error), 'error');
  });
}
async function localEntry(path: string): Promise<FileSystemDirectoryHandle | undefined> {
  let target: FileSystemDirectoryHandle = localDirectory!;
  try {
    for (const part of localRelativePath(path).split('/')) target = await target.getDirectoryHandle(part);
    return target;
  } catch {
    return undefined;
  }
}
async function copyDirectory(from: FileSystemDirectoryHandle, to: FileSystemDirectoryHandle) {
  for await (const [name, handle] of (from as ListableDirectory).entries()) {
    if (handle.kind === 'directory')
      await copyDirectory(handle, await to.getDirectoryHandle(name, { create: true }));
    else await writeLocalFile(to, name, await handle.getFile());
  }
}
async function writeLocalFile(directory: FileSystemDirectoryHandle, name: string, data: File | string) {
  const stream = await (await directory.getFileHandle(name, { create: true })).createWritable();
  await stream.write(data);
  await stream.close();
}
async function saveLocalDraft() {
  if (
    openFile ||
    !slugify(title.value) ||
    !localDirectory ||
    (await localDirectory.queryPermission({ mode: 'readwrite' })) !== 'granted'
  )
    return;
  const path = currentPath();
  const directory = path.replace(/\/[^/]+$/, '');
  if (path !== localDraftPath) {
    const previous = localDraftPath?.replace(/\/[^/]+$/, '');
    if (
      remoteBlobs.some((item) => item.path.startsWith(`${directory}/`)) ||
      (await localEntry(directory)) ||
      (previous && directory.startsWith(`${previous}/`))
    ) {
      $('[data-save-state]').textContent = 'Trùng thư mục bài khác, chưa ghi file';
      return setStatus(`Đã có ${relPath(directory)}; đổi tiêu đề hoặc folder để tạo file local.`, 'error');
    }
    let target: FileSystemDirectoryHandle = localDirectory;
    for (const part of localRelativePath(directory).split('/'))
      target = await target.getDirectoryHandle(part, { create: true });
    const old = previous ? await localEntry(previous) : undefined;
    if (previous && old) {
      await copyDirectory(old, target);
      const holder = parentOf(previous) === postRoot ? localDirectory : await localEntry(parentOf(previous));
      await holder?.removeEntry(leafName(previous), { recursive: true });
    } else removeDraft();
    localDraftPath = path;
    localDraftOwned = true;
    $('[data-file-label]').textContent = relPath(path);
    setStatus(`Đã tạo file local ${relPath(path)}. Bài chỉ lên GitHub khi bấm Publish.`, 'ok');
    void scanLocalDrafts();
  }
  await writeLocalArticle(path, composePost());
  const target = await localEntry(directory);
  for (const asset of assets)
    if (target && !writtenAssets.has(asset)) {
      await writeLocalFile(target, asset.name, asset.file);
      writtenAssets.add(asset);
    }
  $('[data-save-state]').textContent = 'Đã lưu file local · chưa publish';
}
const staleButton = $<HTMLButtonElement>('[data-stale-draft]');
function applyDraft(draft: Draft) {
  originalSource = draft.originalSource ?? originalSource;
  summary.value = draft.summary ?? summary.value;
  title.value = draft.title;
  folder.value = draft.folder;
  date.value = draft.date;
  ctf.value = draft.ctf;
  category.value = draft.category;
  difficulty.value = draft.difficulty;
  tags.value = draft.tags;
  setEditorSource(draft.source);
}
/**
 * Khôi phục nháp trong trình duyệt. Nháp của bài đã có trên GitHub mà viết trên bản cũ hơn (bài đã được sửa
 * ở nơi khác sau đó) thì không tự đè: cất sang khoá `.stale`, hiện nút "Mở nháp cũ" để tự chọn.
 */
function restoreDraft(): boolean | 'stale' {
  staleButton.hidden = true;
  try {
    const value = localStorage.getItem(draftKey());
    if (!value) {
      staleButton.hidden = !localStorage.getItem(`${draftKey()}.stale`);
      return false;
    }
    const draft = JSON.parse(value) as Draft;
    if (openFile && draft.base !== draftBase) {
      const key = draftKey();
      localStorage.setItem(`${key}.stale`, value);
      localStorage.removeItem(key);
      void getDraftAssets(key)
        .then(async (assets) => {
          await putDraftAssets(`${key}.stale`, assets);
          await putDraftAssets(key, []);
        })
        .catch(() => {});
      staleButton.hidden = false;
      return 'stale';
    }
    applyDraft(draft);
    void restoreDraftAssets(draftKey());
    $('[data-save-state]').textContent = 'Đã khôi phục nháp cục bộ';
    return true;
  } catch {
    return false;
  }
}
staleButton.addEventListener('click', () => {
  try {
    const value = localStorage.getItem(`${draftKey()}.stale`);
    if (!value) {
      staleButton.hidden = true;
      return;
    }
    applyDraft(JSON.parse(value) as Draft);
    const staleKey = `${draftKey()}.stale`;
    void restoreDraftAssets(staleKey)
      .then(() => putDraftAssets(staleKey, []))
      .catch(() => {
        /* storage unavailable */
      });
    localStorage.removeItem(staleKey);
    staleButton.hidden = true;
    scheduleDraft();
    void renderPreview();
    setStatus(
      'Đã mở nháp cũ. Bản này dựa trên bản GitHub trước đó, rà lại trước khi Publish để không đè thay đổi mới.',
      'info',
    );
  } catch {
    /* storage unavailable */
  }
});
function removeDraft() {
  localStorage.removeItem(draftKey());
  void putDraftAssets(draftKey(), []).catch(() => {
    /* storage unavailable */
  });
}

function storedToken(): string {
  try {
    return localStorage.getItem(STUDIO_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}
const token = () => (localMode ? 'local-git' : storedToken() || tokenInput.value.trim());
const localHandleKey = 'posts-root';
const localBaselineKey = (path: string) => `ctf-wu.studio.sync-baseline.${path}`;
const saveLocalHandle = (handle: LocalDirectoryHandle) => putStored('handles', localHandleKey, handle);
const getLocalHandle = () => getStored<LocalDirectoryHandle>('handles', localHandleKey);
const localPostsPath = 'D:\\Projects\\Blog\\src\\content\\posts';
/**
 * Handle lưu trong IndexedDB trỏ cứng vào đường dẫn lúc chọn; dời/đổi tên thư mục thì mọi thao tác ném NotFoundError
 * (kể cả khi quyền vẫn "granted"). Phát hiện thì bỏ handle cũ để người dùng chọn lại thư mục mới.
 */
async function dropStaleLocalDirectory(): Promise<boolean> {
  if (!localDirectory || localMode) return false;
  try {
    await (localDirectory as ListableDirectory).entries().next();
    return false;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) return false;
  }
  localDirectory = undefined;
  localPermission = 'prompt';
  await removeStored('handles', localHandleKey);
  updateLocalButton();
  setStatus(
    `Thư mục posts đã kết nối trước đó không còn (đã bị dời?). Bấm "Local chưa kết nối" và chọn lại ${localPostsPath}.`,
    'error',
  );
  return true;
}
/** Ảnh dán vào nháp chỉ nằm trong RAM; cất File vào IndexedDB cùng khoá với nháp localStorage để tắt máy mở lại vẫn còn. */
function saveDraftAssets() {
  const list = assets.filter((asset) => !writtenAssets.has(asset)).map(({ name, file }) => ({ name, file }));
  void putDraftAssets(draftKey(), list).catch(() => {
    /* storage unavailable */
  });
}
async function restoreDraftAssets(key: string) {
  for (const { name, file } of await getDraftAssets(key).catch(() => [])) {
    if (assets.some((asset) => asset.name === name)) continue;
    assets.push({ file, name, url: URL.createObjectURL(file) });
  }
  // Lượt lưu nháp chạy trước khi đọc xong IndexedDB sẽ ghi danh sách ảnh rỗng; ghi lại đủ ảnh để không mất khi tải lại trang.
  saveDraftAssets();
  renderAssets();
  void renderPreview();
}
function updateLocalButton() {
  const button = document.querySelector<HTMLButtonElement>('[data-local-connect]');
  if (!button) return;
  button.textContent = !localDirectory
    ? 'Local chưa kết nối'
    : localMode
      ? 'Local: dev server'
      : localPermission === 'granted'
        ? `Local: ${localDirectory.name}`
        : 'Local: cấp lại quyền';
  button.dataset.connected = String(Boolean(localDirectory && localPermission === 'granted'));
  button.title = localMode
    ? 'Studio chạy qua npm run dev: ghi thẳng vào src/content/posts trên máy.'
    : `Chọn thư mục ${localPostsPath} để đồng bộ bài local. Không chọn D:\\Security\\CTF.`;
}
async function restoreLocalDirectory() {
  if (localMode) {
    // Thắng handle cũ trong IndexedDB; shim không bao giờ được lưu vào đó.
    localDirectory = localPostsDirectory() as unknown as LocalDirectoryHandle;
    localPermission = 'granted';
    return updateLocalButton();
  }
  try {
    localDirectory = await getLocalHandle();
    if (!localDirectory) return updateLocalButton();
    localPermission = await localDirectory.queryPermission({ mode: 'readwrite' });
    if (localPermission === 'granted') await dropStaleLocalDirectory();
    updateLocalButton();
  } catch {
    updateLocalButton();
  }
}
async function requestLocalPermission(): Promise<boolean> {
  if (!localDirectory) return false;
  localPermission = await localDirectory.queryPermission({ mode: 'readwrite' });
  if (localPermission !== 'granted')
    localPermission = await localDirectory.requestPermission({ mode: 'readwrite' });
  updateLocalButton();
  return localPermission === 'granted' && !(await dropStaleLocalDirectory());
}
function updateConnection() {
  const pill = $('[data-connection]');
  pill.dataset.connected = String(githubConnected);
  pill.title = localMode
    ? 'Studio local: đọc git trên máy, Publish bằng git push, không cần token'
    : githubConnected
      ? 'GitHub đã kết nối — bấm để sửa token'
      : 'GitHub chưa kết nối — bấm để nhập token';
  pill.querySelector('span')!.textContent = localMode
    ? 'Git local'
    : githubConnected
      ? 'Đã kết nối'
      : 'GitHub';
}
function setStatus(message: string, kind: 'info' | 'error' | 'ok' = 'info') {
  for (const target of [status, libraryStatus]) {
    target.textContent = message;
    target.dataset.kind = kind;
  }
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Studio local: dev server giả lập cùng các endpoint này trên git của máy (src/integrations/studio-local.ts).
  const response = await fetch(
    localMode ? `/__studio/git${path}` : `https://api.github.com/repos/${repo.name}${path}`,
    {
      cache: 'no-store', // GitHub trả max-age=60: đọc ref cũ -> commit sai parent -> 422 not a fast forward
      ...init,
      headers: localMode
        ? { 'x-studio-sync': '1', ...(init.body ? { 'Content-Type': 'application/json' } : {}) }
        : {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token()}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          },
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(`GitHub ${response.status}: ${data.message ?? response.statusText}`);
  }
  return response.json() as Promise<T>;
}
const decode = (text: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
const postRoot = 'src/content/posts';
const relativeFolder = () => folder.value.trim().replace(/^\/+|\/+$/g, '') || 'uncategorized';
const currentPath = () =>
  openFile?.path ??
  (localDraftPath && !localDraftOwned ? localDraftPath : undefined) ??
  `${postRoot}/${relativeFolder()}/${slugify(title.value || 'untitled')}/index.md`;
const articleDirectory = () => currentPath().replace(/\/[^/]+$/, '');
const assetUrl = (name: string) => {
  const localAsset = assets.find((asset) => asset.name === name);
  if (localAsset) return localAsset.url;
  if (!openFile || !repo.name || name.includes('..')) return undefined;
  const path = `${articleDirectory()}/${name}`.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repo.name}/${encodeURIComponent(repo.branch)}/${path}`;
};
function encodeBinary(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

let originalSource = '';
const parsePost = readDocument;
function composePost() {
  return composeDocument(
    originalSource,
    {
      summary: summary.value,
      title: title.value,
      date: date.value,
      ctf: ctf.value,
      category: category.value,
      difficulty: difficulty.value,
      tags: tags.value,
    },
    editorSource(),
  );
}
function populate(source: string) {
  originalSource = source;
  const post = parsePost(source);
  summary.value = typeof post.fields.summary === 'string' ? post.fields.summary : '';
  title.value = typeof post.fields.title === 'string' ? post.fields.title : '';
  date.value = typeof post.fields.date === 'string' ? post.fields.date.slice(0, 10) : '';
  ctf.value = typeof post.fields.ctf === 'string' ? post.fields.ctf : ctfFromFolder(folder.value);
  category.value = typeof post.fields.category === 'string' ? post.fields.category : '';
  difficulty.value = typeof post.fields.difficulty === 'string' ? post.fields.difficulty : '';
  tags.value = Array.isArray(post.fields.tags)
    ? post.fields.tags.join(', ')
    : typeof post.fields.tags === 'string'
      ? post.fields.tags
      : '';
  setEditorSource(post.body.trim());
  void renderPreview();
}
function resetEditor() {
  originalSource = '';
  summary.value = '';
  openFile = undefined;
  localDraftPath = undefined;
  localDraftOwned = false;
  writtenAssets.clear();
  droppedAssets = [];
  staleButton.hidden = true;
  assets.forEach((asset) => URL.revokeObjectURL(asset.url));
  assets = [];
  title.value = '';
  date.value = formatIsoDate(new Date());
  ctf.value = ctfFromFolder(folder.value);
  category.value = '';
  difficulty.value = '';
  tags.value = '';
  setEditorSource('');
  $('[data-file-label]').textContent = 'Write-up mới';
  $('[data-save-state]').textContent = 'Chưa publish';
  renderAssets();
  void renderPreview();
}
function loadConfig() {
  repo = { name: STUDIO_REPO.name, branch: STUDIO_REPO.branch };
  $('[data-repo]').textContent = `${repo.name} / ${repo.branch}${localMode ? ' · git trên máy' : ''}`;
  $('[data-token-box]').hidden = localMode || Boolean(storedToken());
  updateConnection();
  void restoreLocalDirectory();
  if (token()) void loadTree();
}
async function loadTree() {
  if (!token()) {
    $('[data-token-box]').hidden = false;
    return;
  }
  updateConnection();
  const tree = $('[data-tree]');
  tree.innerHTML = '<p class="empty-tree">Đang tải write-up…</p>';
  try {
    const ref = await api<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(repo.branch)}`);
    const data = await api<{ tree: Array<{ path: string; type: string; sha: string }> }>(
      `/git/trees/${ref.object.sha}?recursive=1`,
    );
    remoteBlobs = data.tree.filter((item) => item.type === 'blob');
    githubConnected = true;
    $('[data-token-box]').hidden = true;
    updateConnection();
    refreshFolderView();
    void loadHiddenStates();
    void scanLocalDrafts();
  } catch (error) {
    tree.innerHTML = '';
    const message = error instanceof Error ? error.message : String(error);
    if (/GitHub (401|403):/.test(message)) {
      githubConnected = false;
      $('[data-token-box]').hidden = false;
      updateConnection();
    }
    setStatus(message, 'error');
  }
}
function localRelativePath(path: string) {
  if (!path.startsWith(`${postRoot}/`))
    throw new Error('Đường dẫn bài không nằm trong thư mục posts của repository.');
  return path.slice(postRoot.length + 1);
}
async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function readLocalArticle(path: string): Promise<string | undefined> {
  if (!localDirectory || (await localDirectory.queryPermission({ mode: 'readwrite' })) !== 'granted')
    return undefined;
  const parts = localRelativePath(path).split('/');
  let target: FileSystemDirectoryHandle = localDirectory;
  try {
    for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part);
    const file = await target.getFileHandle(parts.at(-1)!);
    return await (await file.getFile()).text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
    throw error;
  }
}
async function writeLocalArticle(path: string, source: string): Promise<boolean> {
  if (!localDirectory || (await localDirectory.queryPermission({ mode: 'readwrite' })) !== 'granted')
    return false;
  const parts = localRelativePath(path).split('/');
  let target: FileSystemDirectoryHandle = localDirectory;
  for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part, { create: true });
  const handle = await target.getFileHandle(parts.at(-1)!, { create: true });
  const writable = await handle.createWritable();
  await writable.write(source);
  await writable.close();
  return true;
}
async function reconcileLocalArticle(
  path: string,
  remoteSource: string,
): Promise<{ source: string; message: string }> {
  const remoteHash = await hashText(remoteSource);
  const localSource = await readLocalArticle(path);
  if (localSource === undefined) {
    const copied = await writeLocalArticle(path, remoteSource).catch(() => false);
    if (copied) localStorage.setItem(localBaselineKey(path), remoteHash);
    return {
      source: remoteSource,
      message: copied
        ? 'Đã tải bản GitHub về thư mục posts local.'
        : 'Chưa kết nối được thư mục posts local.',
    };
  }
  const localHash = await hashText(localSource);
  const action = reconcileAction(
    localStorage.getItem(localBaselineKey(path)) ?? undefined,
    localHash,
    remoteHash,
  );
  if (action === 'in-sync') {
    localStorage.setItem(localBaselineKey(path), remoteHash);
    return { source: remoteSource, message: 'Bản local và GitHub đã đồng bộ.' };
  }
  if (action === 'use-remote') {
    const copied = await writeLocalArticle(path, remoteSource).catch(() => false);
    if (copied) localStorage.setItem(localBaselineKey(path), remoteHash);
    return {
      source: remoteSource,
      message: copied
        ? 'GitHub có bản mới hơn; đã cập nhật file local.'
        : 'GitHub có bản mới hơn nhưng chưa cấp quyền ghi thư mục local.',
    };
  }
  if (action === 'use-local-unpublished') {
    return { source: localSource, message: 'Phát hiện chỉnh sửa local chưa publish; đang mở bản local.' };
  }
  return {
    source: localSource,
    message:
      'Xung đột đồng bộ: cả local và GitHub đều đổi. Đang giữ bản local để bạn rà soát trước khi Publish.',
  };
}
async function openPost(file: RepoFile) {
  await settleDraft();
  try {
    setStatus('Đang mở write-up…');
    const content = await api<{ content: string; sha: string }>(
      `/contents/${file.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(repo.branch)}`,
    );
    resetEditor();
    openFile = { path: file.path, sha: content.sha };
    localDraftPath = undefined;
    localDraftOwned = false;
    folder.value = folderOf(file) || 'uncategorized';
    const directory = parentOf(file.path);
    for (const blob of remoteBlobs) {
      const name = blob.path.slice(directory.length + 1);
      if (!blob.path.startsWith(`${directory}/`) || name.includes('/') || name === leafName(file.path))
        continue;
      const image = /\.(png|jpe?g|gif|webp|avif|svg)$/i.exec(name);
      const asset: Asset = {
        file: new File([], name, { type: image ? `image/${image[1].toLowerCase()}` : '' }),
        name,
        url: assetUrl(name) ?? '',
        remote: true,
      };
      assets.push(asset);
      writtenAssets.add(asset);
    }
    renderAssets();
    $('[data-file-label]').textContent = file.path.replace(`${postRoot}/`, '');
    const remoteSource = decode(content.content);
    draftBase = await hashText(remoteSource);
    const reconciled = await reconcileLocalArticle(file.path, remoteSource);
    $('[data-save-state]').textContent = 'Đã mở bài';
    populate(reconciled.source);
    const restored = restoreDraft();
    if (restored === 'stale')
      setStatus(
        'Bài trên GitHub đã đổi. Đang giữ bản mới; bấm Mở nháp cũ nếu muốn lấy lại nội dung nháp.',
        'info',
      );
    else if (restored) setStatus('Đã khôi phục bản nháp chưa publish.', 'ok');
    else setStatus(reconciled.message, reconciled.message.startsWith('Xung đột') ? 'error' : 'info');
    activeFolder = folderOf(file) || undefined;
    renderSidebar();
    showComposer();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  }
}
async function openLocalPost(file: RepoFile) {
  await settleDraft();
  try {
    const source = await readLocalArticle(file.path);
    if (source === undefined)
      return setStatus('Không đọc được file local. Kiểm tra quyền thư mục posts.', 'error');
    resetEditor();
    folder.value = folderOf(file) || 'uncategorized';
    populate(source);
    localDraftPath = file.path;
    const directory = await localEntry(parentOf(file.path));
    if (directory) {
      for await (const [name, handle] of (directory as ListableDirectory).entries()) {
        if (handle.kind !== 'file' || name === leafName(file.path)) continue;
        const asset = { file: await handle.getFile(), name, url: '' };
        asset.url = URL.createObjectURL(asset.file);
        assets.push(asset);
        writtenAssets.add(asset);
      }
    }
    renderAssets();
    void renderPreview();
    $('[data-file-label]').textContent = relPath(file.path);
    $('[data-save-state]').textContent = 'File local · chưa publish';
    setStatus('Đang mở bản local chưa publish. Bấm Publish để đưa lên GitHub.', 'info');
    activeFolder = folderOf(file) || undefined;
    renderSidebar();
    showComposer();
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  }
}
async function scanLocalDrafts() {
  if (
    !githubConnected ||
    !localDirectory ||
    (await localDirectory.queryPermission({ mode: 'readwrite' })) !== 'granted'
  )
    return;
  const remote = new Set(remoteBlobs.map((item) => item.path));
  const found: RepoFile[] = [];
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, handle] of (directory as ListableDirectory).entries()) {
      const path = `${prefix}/${name}`;
      if (handle.kind === 'directory') await walk(handle, path);
      else if (name === 'index.md' && !remote.has(path)) found.push({ path, sha: '' });
    }
  };
  try {
    await walk(localDirectory, postRoot);
  } catch {
    return;
  }
  localOnly = found.sort((a, b) => a.path.localeCompare(b.path));
  refreshFolderView();
}
const isLocalOnly = (file: RepoFile) => localOnly.some((entry) => entry.path === file.path);
async function newWriteup() {
  const folderName = currentFolder() || folder.value || 'Dreamhack';
  const ready =
    (localDirectory && (await requestLocalPermission().catch(() => false))) ||
    (!localDirectory && (await chooseLocalFolder()));
  await settleDraft();
  startNewInFolder(folderName);
  setStatus(
    ready
      ? 'Nhập tiêu đề để tạo file trong thư mục posts local. Bài chỉ lên GitHub khi bấm Publish.'
      : 'Chưa kết nối thư mục posts local, nháp chỉ được lưu trong trình duyệt.',
    ready ? 'info' : 'error',
  );
}
function showComposer() {
  $('[data-sidebar-new]').removeAttribute('hidden');
  $('[data-library-home]').setAttribute('hidden', '');
  $('[data-composer]').removeAttribute('hidden');
  refreshTagButtons();
  renderTagToast();
  setTimeout(() => editor.focus(), 0);
}
function showLibrary() {
  void settleDraft();
  $('[data-sidebar-new]').setAttribute('hidden', '');
  $('[data-composer]').setAttribute('hidden', '');
  $('[data-library-home]').removeAttribute('hidden');
}
function startNewInFolder(folderName = 'Dreamhack') {
  resetEditor();
  folder.value = folderName;
  ctf.value = ctfFromFolder(folderName);
  activeFolder = folderName;
  restoreDraft();
  renderSidebar();
  showComposer();
  $('[data-metadata]').setAttribute('open', '');
  // showComposer hẹn editor.focus() bằng setTimeout; hẹn sau nó để con trỏ nằm ở ô tiêu đề của bài mới.
  setTimeout(() => title.focus(), 0);
}
const KEEP_FILE = '.gitkeep';
const relPath = (path: string) => path.replace(`${postRoot}/`, '');
const isIndexFile = (file: RepoFile) => file.path.endsWith('/index.md');
const joinPath = (...parts: string[]) => parts.filter(Boolean).join('/');
const leafName = (path: string) => path.split('/').at(-1) ?? path;
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');
const folderOf = (file: RepoFile) =>
  relPath(file.path)
    .split('/')
    .slice(0, isIndexFile(file) ? -2 : -1)
    .join('/');
const articleName = (file: RepoFile) => {
  const parts = relPath(file.path).split('/');
  return isIndexFile(file) ? (parts.at(-2) ?? 'Write-up') : (parts.at(-1) ?? 'Write-up').replace(/\.md$/, '');
};
const inFolder = (file: RepoFile, path: string) => {
  const own = folderOf(file);
  return own === path || own.startsWith(`${path}/`);
};
const currentFolder = () => (activeFolder && folderSet.has(activeFolder) ? activeFolder : '');
const childFolders = (parent: string) =>
  [...folderSet].filter((path) => parentOf(path) === parent).sort((x, y) => x.localeCompare(y));
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
function collectFolders() {
  const set = new Set<string>();
  const add = (directory: string) => {
    const parts = directory.split('/').filter(Boolean);
    parts.forEach((_, index) => set.add(parts.slice(0, index + 1).join('/')));
  };
  [...repoFiles, ...localOnly].forEach((file) => add(folderOf(file)));
  for (const item of repoTree)
    if (item.path.startsWith(`${postRoot}/`) && item.path.endsWith(`/${KEEP_FILE}`))
      add(relPath(item.path).slice(0, -(KEEP_FILE.length + 1)));
  return set;
}
function openFolder(path: string) {
  activeFolder = path || undefined;
  selectedFiles.clear();
  selectedFolders.clear();
  renderFolderHome();
  renderSidebar();
}
const hiddenBySha = new Map<string, boolean>();
const builtTags: TagTerm[] = (() => {
  try {
    return JSON.parse($('[data-tag-vocabulary]').textContent ?? '[]') as TagTerm[];
  } catch {
    return [];
  }
})();
const tagsBySha = new Map<string, string[]>();
const hiddenOf = (file: RepoFile) => hiddenBySha.get(file.sha) === true;
const frontmatterRe = /^---\r?\n([\s\S]*?)\r?\n---/;
const isDraftSource = (source: string) => /^draft:\s*true\s*$/m.test(frontmatterRe.exec(source)?.[1] ?? '');
function withDraftFlag(source: string, hidden: boolean) {
  const match = frontmatterRe.exec(source);
  if (!match) return hidden ? `---\ndraft: true\n---\n\n${source}` : source;
  const lines = match[1].split(/\r?\n/).filter((line) => !/^draft\s*:/.test(line));
  if (hidden) lines.push('draft: true');
  return `---\n${lines.join('\n')}\n---${source.slice(match[0].length)}`;
}
async function loadHiddenStates() {
  const todo = remoteBlobs.filter(
    (item) => item.path.startsWith(`${postRoot}/`) && item.path.endsWith('.md') && !hiddenBySha.has(item.sha),
  );
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(
      todo.slice(i, i + 8).map(async (item) => {
        try {
          const source = decode((await api<{ content: string }>(`/git/blobs/${item.sha}`)).content);
          hiddenBySha.set(item.sha, isDraftSource(source));
          const fieldTags = parsePost(source).fields.tags;
          tagsBySha.set(
            item.sha,
            (Array.isArray(fieldTags) ? fieldTags : typeof fieldTags === 'string' ? fieldTags.split(',') : [])
              .map((tag) => String(tag).trim())
              .filter(Boolean),
          );
        } catch {
          /* giữ trạng thái hiện */
        }
      }),
    );
  }
  refreshFolderView();
}
async function setVisibility(hide: boolean) {
  const picked = new Set(selectedFiles);
  for (const path of selectedFolders)
    repoFiles.filter((file) => inFolder(file, path)).forEach((file) => picked.add(file.path));
  const files = repoFiles.filter((file) => picked.has(file.path) && hiddenOf(file) !== hide);
  if (!files.length)
    return setStatus(hide ? 'Các bài đã chọn đều đang ẩn.' : 'Các bài đã chọn đều đang hiện.', 'info');
  if (!token()) return setStatus('Cần kết nối GitHub để đổi trạng thái bài.', 'error');
  try {
    setStatus(`Đang chuẩn bị ${files.length} bài…`);
    const entries = await Promise.all(
      files.map(async (file): Promise<TreeEntry> => {
        const source = decode((await api<{ content: string }>(`/git/blobs/${file.sha}`)).content);
        const blob = await api<{ sha: string }>('/git/blobs', {
          method: 'POST',
          body: JSON.stringify({ content: withDraftFlag(source, hide), encoding: 'utf-8' }),
        });
        hiddenBySha.set(blob.sha, hide);
        return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );
    selectedFiles.clear();
    selectedFolders.clear();
    stageEntries(entries, `content: ${hide ? 'ẩn' : 'hiện'} ${files.length} write-up trên blog`);
    setStatus(
      `Đã thêm việc ${hide ? 'ẩn' : 'hiện'} ${files.length} bài vào danh sách chờ. Bấm Save để commit.`,
      'ok',
    );
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  }
}
const selectionMode = () => selectedFiles.size > 0 || selectedFolders.size > 0;
function toggleSelectedFile(path: string) {
  if (selectedFiles.has(path)) selectedFiles.delete(path);
  else selectedFiles.add(path);
  renderFolderHome();
  renderSidebar();
}
function toggleSelectedFolder(path: string) {
  if (selectedFolders.has(path)) selectedFolders.delete(path);
  else selectedFolders.add(path);
  renderFolderHome();
}
type Motion = { x: number; y: number; s: number; r: number; o: number };
type DragLayer = {
  clone: HTMLElement;
  source: HTMLElement;
  w: number;
  h: number;
  fit: number;
  k: number;
  now: Motion;
  vel: Motion;
  goal: Motion;
};
type DragPhase = 'follow' | 'return' | 'absorb';
const motionKeys = ['x', 'y', 's', 'r', 'o'] as const;
const settleEps: Motion = { x: 0.3, y: 0.3, s: 0.002, r: 0.05, o: 0.01 };
const phaseDamping: Record<DragPhase, number> = { follow: 0.8, return: 0.62, absorb: 1 };
const fan = [0, -4, 5, -7];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let drag:
  | {
      layers: DragLayer[];
      layer: HTMLElement;
      badge?: HTMLElement;
      pointer: { x: number; y: number };
      grab: { x: number; y: number };
      vx: number;
      lastMove: { x: number; t: number };
      lastFrame: number;
      frame: number;
      phase: DragPhase;
      phaseStart: number;
      target?: HTMLElement;
      done?: () => void | Promise<void>;
      cleanup: () => void;
    }
  | undefined;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const dragKey = (el: HTMLElement) => `${el.dataset.dragKind}:${el.dataset.dragPath}`;
function enableCardDrag(card: HTMLElement, kind: 'file' | 'folder', path: string) {
  card.dataset.dragKind = kind;
  card.dataset.dragPath = path;
  card.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch' || drag) return;
    const start = { x: event.clientX, y: event.clientY };
    const stop = () => {
      window.removeEventListener('pointermove', watch);
      window.removeEventListener('pointerup', stop);
    };
    const watch = (move: PointerEvent) => {
      if (Math.hypot(move.clientX - start.x, move.clientY - start.y) < 6) return;
      stop();
      beginDrag(kind, path, start, move);
    };
    window.addEventListener('pointermove', watch);
    window.addEventListener('pointerup', stop);
  });
}
function beginDrag(
  kind: 'file' | 'folder',
  path: string,
  start: { x: number; y: number },
  event: PointerEvent,
) {
  const picked = kind === 'file' ? selectedFiles : selectedFolders;
  if (!picked.has(path)) {
    selectedFiles.clear();
    selectedFolders.clear();
    picked.add(path);
    renderFolderHome();
    renderSidebar();
  }
  const cards = [...document.querySelectorAll<HTMLElement>('[data-library-home] [data-drag-path]')].filter(
    (el) => (el.dataset.dragKind === 'file' ? selectedFiles : selectedFolders).has(el.dataset.dragPath ?? ''),
  );
  const grabbed = cards.find((el) => el.dataset.dragKind === kind && el.dataset.dragPath === path);
  if (!grabbed) return;
  const centerOf = (box: DOMRect) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const origin = centerOf(grabbed.getBoundingClientRect());
  const distance = (el: HTMLElement) => {
    const c = centerOf(el.getBoundingClientRect());
    return Math.hypot(c.x - origin.x, c.y - origin.y);
  };
  const ordered = [
    grabbed,
    ...cards.filter((el) => el !== grabbed).sort((a, b) => distance(a) - distance(b)),
  ];
  const layer = document.createElement('div');
  layer.className = 'drag-layer';
  layer.setAttribute('aria-hidden', 'true');
  const layers = ordered.map((source, index): DragLayer => {
    const box = source.getBoundingClientRect();
    const clone = source.cloneNode(true) as HTMLElement;
    clone.classList.add('drag-clone');
    delete clone.dataset.dragPath;
    delete clone.dataset.dropFolder;
    clone.style.width = `${box.width}px`;
    clone.style.height = `${box.height}px`;
    clone.style.zIndex = String(ordered.length - index);
    layer.append(clone);
    const now = { ...centerOf(box), s: 1, r: 0, o: 1 };
    return {
      clone,
      source,
      w: box.width,
      h: box.height,
      fit: Math.min(1, 210 / box.width),
      k: Math.max(170, 520 - index * 85),
      now,
      vel: { x: 0, y: 0, s: 0, r: 0, o: 0 },
      goal: { ...now },
    };
  });
  const total = selectedFiles.size + selectedFolders.size;
  let badge: HTMLElement | undefined;
  if (total > 1) {
    badge = document.createElement('span');
    badge.className = 'drag-badge';
    badge.textContent = String(total);
    layer.append(badge);
  }
  document.body.append(layer);
  layers.forEach((item) => {
    item.source.dataset.lifted = '';
  });
  document.body.dataset.cardDragging = '';
  const onMove = (move: PointerEvent) => {
    if (!drag) return;
    const t = performance.now();
    const speed = ((move.clientX - drag.lastMove.x) / Math.max(1, t - drag.lastMove.t)) * 1000;
    drag.vx = drag.vx * 0.7 + speed * 0.3;
    drag.lastMove = { x: move.clientX, t };
    drag.pointer = { x: move.clientX, y: move.clientY };
  };
  const onUp = () => {
    if (drag?.phase !== 'follow') return;
    const swallow = (click: Event) => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (drag.target) absorbInto(drag.target);
    else returnHome();
  };
  const onKey = (key: KeyboardEvent) => {
    if (key.key === 'Escape' && drag?.phase === 'follow') {
      key.preventDefault();
      returnHome();
    }
  };
  const onCancel = () => {
    if (drag?.phase === 'follow') returnHome();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', onCancel);
  const now = performance.now();
  drag = {
    layers,
    layer,
    badge,
    pointer: { x: event.clientX, y: event.clientY },
    grab: { x: origin.x - start.x, y: origin.y - start.y },
    vx: 0,
    lastMove: { x: event.clientX, t: now },
    lastFrame: now,
    frame: 0,
    phase: 'follow',
    phaseStart: now,
    cleanup: () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onCancel);
    },
  };
  drag.frame = requestAnimationFrame(dragTick);
}
function canDropInto(path: string) {
  return ![...selectedFolders].some((folderPath) => path === folderPath || path.startsWith(`${folderPath}/`));
}
function setDropTarget(target: HTMLElement | undefined) {
  if (!drag || target === drag.target) return;
  delete drag.target?.dataset.drop;
  if (target) target.dataset.drop = '';
  drag.target = target;
}
function followGoals(dt: number) {
  if (!drag) return;
  drag.vx *= Math.exp(-dt * 9);
  const { pointer, grab } = drag;
  const hit = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('[data-drop-folder]');
  setDropTarget(
    hit && !('lifted' in hit.dataset) && canDropInto(hit.dataset.dropFolder ?? '') ? hit : undefined,
  );
  const scroller = $('[data-library-home]');
  const box = scroller.getBoundingClientRect();
  const edge = 70;
  if (pointer.y < box.top + edge && pointer.x > box.left)
    scroller.scrollTop -= (box.top + edge - pointer.y) * 12 * dt;
  else if (pointer.y > box.bottom - edge && pointer.x > box.left)
    scroller.scrollTop += (pointer.y - box.bottom + edge) * 12 * dt;
  const hover = drag.target ? 0.84 : 1;
  const tilt = clamp(drag.vx * 0.012, -14, 14);
  const [lead, ...rest] = drag.layers;
  const leadScale = lead.fit * hover;
  lead.goal = {
    x: pointer.x + grab.x * leadScale,
    y: pointer.y + grab.y * leadScale,
    s: leadScale,
    r: tilt,
    o: 1,
  };
  rest.forEach((item, index) => {
    const depth = Math.min(index + 1, 3);
    item.goal = {
      x: lead.now.x + depth * 6,
      y: lead.now.y + depth * 7,
      s: item.fit * hover * (1 - depth * 0.025),
      r: fan[depth] + tilt * 0.55,
      o: index + 1 > 3 ? 0 : 1,
    };
  });
}
function stepSprings(dt: number) {
  if (!drag) return false;
  const damping = phaseDamping[drag.phase];
  let moving = false;
  for (const item of drag.layers) {
    const k = reduceMotion.matches ? 2400 : item.k;
    const c = 2 * Math.sqrt(k) * (reduceMotion.matches ? 1 : damping);
    for (const key of motionKeys) {
      const accel = k * (item.goal[key] - item.now[key]) - c * item.vel[key];
      item.vel[key] += accel * dt;
      item.now[key] += item.vel[key] * dt;
      if (
        Math.abs(item.goal[key] - item.now[key]) > settleEps[key] ||
        Math.abs(item.vel[key]) > settleEps[key] * 20
      )
        moving = true;
    }
  }
  return moving;
}
function paintDrag() {
  if (!drag) return;
  for (const item of drag.layers) {
    const { x, y, s, r, o } = item.now;
    item.clone.style.transform = `translate3d(${x - item.w / 2}px,${y - item.h / 2}px,0) rotate(${r}deg) scale(${Math.max(0, s)})`;
    item.clone.style.opacity = String(clamp(o, 0, 1));
  }
  const lead = drag.layers[0];
  if (drag.badge) {
    const half = { x: (lead.w * lead.now.s) / 2, y: (lead.h * lead.now.s) / 2 };
    drag.badge.style.transform = `translate3d(${lead.now.x + half.x - 6}px,${lead.now.y - half.y + 6}px,0) translate(-50%,-50%)`;
  }
}
function dragTick(time: number) {
  if (!drag) return;
  const dt = clamp((time - drag.lastFrame) / 1000, 0, 0.05);
  drag.lastFrame = time;
  if (drag.phase === 'follow') followGoals(dt);
  const steps = Math.max(1, Math.ceil(dt * 120));
  let moving = false;
  for (let step = 0; step < steps; step += 1) moving = stepSprings(dt / steps);
  paintDrag();
  if (drag.phase !== 'follow' && drag.done && (!moving || time - drag.phaseStart > 1100)) {
    const done = drag.done;
    drag.done = undefined;
    void done();
  }
  if (drag) drag.frame = requestAnimationFrame(dragTick);
}
function returnHome() {
  if (!drag) return;
  setDropTarget(undefined);
  drag.phase = 'return';
  drag.phaseStart = performance.now();
  for (const item of drag.layers) {
    const box = item.source.getBoundingClientRect();
    item.goal = { x: box.left + box.width / 2, y: box.top + box.height / 2, s: 1, r: 0, o: 1 };
  }
  drag.badge?.classList.add('leaving');
  drag.done = finishDrag;
}
function absorbInto(target: HTMLElement) {
  if (!drag) return;
  const path = target.dataset.dropFolder ?? '';
  const box = target.getBoundingClientRect();
  const center = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  drag.phase = 'absorb';
  drag.phaseStart = performance.now();
  drag.layers.forEach((item, index) => {
    item.goal = { x: center.x, y: center.y, s: 0.16, r: item.now.r * 0.3, o: 0 };
    item.k = Math.max(260, 640 - index * 70);
  });
  drag.badge?.classList.add('leaving');
  if (!reduceMotion.matches)
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], {
      duration: 380,
      delay: 90,
      easing: 'cubic-bezier(.34,1.56,.64,1)',
    });
  drag.done = async () => {
    setDropTarget(undefined);
    const moved = await flipLibrary(() => moveSelectionTo(path));
    if (moved) return finishDrag();
    drag?.badge?.classList.remove('leaving');
    returnHome();
  };
}
function finishDrag() {
  if (!drag) return;
  cancelAnimationFrame(drag.frame);
  drag.cleanup();
  setDropTarget(undefined);
  drag.layer.remove();
  drag.layers.forEach((item) => {
    delete item.source.dataset.lifted;
  });
  delete document.body.dataset.cardDragging;
  drag = undefined;
}
async function flipLibrary<T>(change: () => T | Promise<T>) {
  const scope = $('[data-library-home]');
  const before = new Map(
    [...scope.querySelectorAll<HTMLElement>('[data-drag-path]')].map((el) => [
      dragKey(el),
      el.getBoundingClientRect(),
    ]),
  );
  const result = await change();
  if (reduceMotion.matches) return result;
  for (const el of scope.querySelectorAll<HTMLElement>('[data-drag-path]')) {
    const old = before.get(dragKey(el));
    if (!old) {
      el.animate(
        [
          { opacity: 0, transform: 'scale(.94)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 280, easing: 'ease-out' },
      );
      continue;
    }
    const box = el.getBoundingClientRect();
    const dx = old.left - box.left;
    const dy = old.top - box.top;
    if (Math.abs(dx) + Math.abs(dy) > 1)
      el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], {
        duration: 460,
        easing: 'cubic-bezier(.22,1,.36,1)',
      });
  }
  return result;
}
function makeFileCard(file: RepoFile, className = 'recent-card') {
  const card = document.createElement('article');
  card.className = className;
  card.innerHTML = `<button type="button" class="selection-checkbox" aria-label="Chọn bài">${selectedFiles.has(file.path) ? '■' : '□'}</button><button type="button" class="file-open"><span class="file-icon" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path class="file-sheet" d="M8 3.5h10l7 7v17a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-23a1 1 0 0 1 1-1z"/><path class="file-fold" d="M18 3.5v7h7"/><path class="file-lines" d="M11 16h10M11 20h10M11 24h7"/></svg></span><strong></strong><small></small></button>`;
  card.querySelector('strong')!.textContent = articleName(file);
  card.querySelector('small')!.textContent = folderOf(file) || 'Chưa phân loại';
  card.dataset.selected = String(selectedFiles.has(file.path));
  if (hiddenOf(file)) {
    card.dataset.hidden = '';
    card.querySelector('small')!.textContent += ' · Đã ẩn';
  }
  if (isLocalOnly(file)) {
    card.dataset.local = '';
    card.querySelector('small')!.textContent += ' · Chưa publish';
    card.querySelector('.file-open')!.addEventListener('click', () => void openLocalPost(file));
    return card;
  }
  card.querySelector('.selection-checkbox')!.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSelectedFile(file.path);
  });
  card.querySelector('.file-open')!.addEventListener('click', () => {
    if (selectionMode()) toggleSelectedFile(file.path);
    else void openPost(file);
  });
  enableCardDrag(card, 'file', file.path);
  return card;
}
function makeFolderCard(path: string) {
  const postCount = repoFiles.filter((file) => inFolder(file, path)).length;
  const subCount = childFolders(path).length;
  const card = document.createElement('article');
  card.className = 'folder-card';
  card.dataset.selected = String(selectedFolders.has(path));
  card.innerHTML = `<button type="button" class="selection-checkbox" aria-label="Chọn folder">${selectedFolders.has(path) ? '■' : '□'}</button><button type="button" class="folder-open"><span class="folder-icon" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path class="folder-back" d="M4.5 8.5h8l3 3h12v13a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2z"/><path class="folder-front" d="M4.5 12.5h23l-2 11a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-2z"/></svg></span><strong></strong><small></small></button>`;
  card.querySelector('strong')!.textContent = leafName(path);
  card.title = path;
  card.querySelector('small')!.textContent =
    `${postCount} bài viết${subCount ? ` · ${subCount} folder con` : ''}`;
  card.querySelector('.selection-checkbox')!.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSelectedFolder(path);
  });
  card.querySelector('.folder-open')!.addEventListener('click', () => {
    if (selectionMode()) toggleSelectedFolder(path);
    else openFolder(path);
  });
  card.dataset.dropFolder = path;
  enableCardDrag(card, 'folder', path);
  return card;
}
function renderSidebar() {
  const tree = $('[data-tree]');
  if (!githubConnected) return;
  const here = currentFolder();
  const opened = currentPath();
  // Ancestors of the active folder always stay expanded so the current branch is visible.
  for (let at = here; at; at = parentOf(at)) treeOpen.add(at);
  const rows: HTMLElement[] = [];
  const path = document.createElement('p');
  path.className = 'tree-path';
  path.textContent = here || 'Thư mục gốc';
  rows.push(path);
  const navigate = (target: string) => {
    treeOpen.add(target);
    saveTreeOpen();
    showLibrary();
    openFolder(target);
  };
  const indent = (row: HTMLElement, depth: number) => row.style.setProperty('--depth', String(depth));
  const addFiles = (parent: string, depth: number) => {
    for (const file of repoFiles.filter((entry) => folderOf(entry) === parent)) {
      const item = document.createElement('div');
      item.className = 'tree-file';
      indent(item, depth);
      if (file.path === opened) item.dataset.current = '';
      item.innerHTML = `<button type="button" class="selection-checkbox" aria-label="Chọn bài">${selectedFiles.has(file.path) ? '■' : '□'}</button><button type="button" class="tree-open"><span></span><small></small></button>`;
      item.querySelector('span')!.textContent = articleName(file);
      item.querySelector('small')!.textContent =
        leafName(parentOf(file.path)) + (hiddenOf(file) ? ' · Đã ẩn' : '');
      item.title = relPath(file.path);
      item
        .querySelector('.selection-checkbox')!
        .addEventListener('click', () => toggleSelectedFile(file.path));
      item.querySelector('.tree-open')!.addEventListener('click', () => {
        if (selectionMode()) toggleSelectedFile(file.path);
        else void openPost(file);
      });
      rows.push(item);
    }
    for (const file of localOnly.filter((entry) => folderOf(entry) === parent)) {
      const item = document.createElement('div');
      item.className = 'tree-file';
      item.dataset.local = '';
      indent(item, depth);
      if (file.path === opened) item.dataset.current = '';
      item.innerHTML =
        '<span class="selection-checkbox" aria-hidden="true"></span><button type="button" class="tree-open"><span></span><small></small></button>';
      item.querySelector('span:not(.selection-checkbox)')!.textContent = articleName(file);
      item.querySelector('small')!.textContent = `${leafName(parentOf(file.path))} · Chưa publish`;
      item.title = relPath(file.path);
      item.querySelector('.tree-open')!.addEventListener('click', () => void openLocalPost(file));
      rows.push(item);
    }
  };
  const addBranch = (parent: string, depth: number) => {
    for (const child of childFolders(parent)) {
      const expanded = treeOpen.has(child);
      const hasChildren =
        childFolders(child).length > 0 ||
        [...repoFiles, ...localOnly].some((file) => folderOf(file) === child);
      const row = document.createElement('div');
      row.className = 'tree-branch';
      indent(row, depth);
      row.innerHTML =
        '<button type="button" class="tree-toggle"></button><button type="button" class="tree-folder"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4.5 8.5h8l3 3h12v13a2 2 0 0 1-2 2h-19a2 2 0 0 1-2-2z"/></svg><span></span></button>';
      const toggle = row.querySelector<HTMLButtonElement>('.tree-toggle')!;
      toggle.textContent = hasChildren ? (expanded ? '▾' : '▸') : '';
      toggle.disabled = !hasChildren;
      toggle.setAttribute('aria-label', expanded ? 'Thu gọn' : 'Mở rộng');
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.addEventListener('click', () => {
        if (expanded) treeOpen.delete(child);
        else treeOpen.add(child);
        saveTreeOpen();
        renderSidebar();
      });
      const folderButton = row.querySelector<HTMLButtonElement>('.tree-folder')!;
      folderButton.querySelector('span')!.textContent = leafName(child);
      folderButton.title = child;
      folderButton.dataset.dropFolder = child;
      if (child === here) folderButton.setAttribute('aria-current', 'true');
      folderButton.addEventListener('click', () => navigate(child));
      rows.push(row);
      if (expanded) {
        addBranch(child, depth + 1);
        addFiles(child, depth + 1);
      }
    }
  };
  addBranch('', 0);
  addFiles('', 0);
  if (rows.length === 1) {
    const empty = document.createElement('p');
    empty.className = 'empty-tree';
    empty.textContent = 'Chưa có folder nào.';
    rows.push(empty);
  }
  tree.replaceChildren(...rows);
}
function renderCrumbs(here: string) {
  const parts = here ? here.split('/') : [];
  const crumbs: Array<[string, string]> = [
    ['WU', ''],
    ...parts.map((part, index): [string, string] => [part, parts.slice(0, index + 1).join('/')]),
  ];
  $('[data-library-path]').replaceChildren(
    ...crumbs.flatMap(([label, path], index) => {
      const last = index === crumbs.length - 1;
      const crumb = document.createElement(last ? 'span' : 'button');
      crumb.textContent = label;
      if (last) crumb.setAttribute('aria-current', 'page');
      else {
        (crumb as HTMLButtonElement).type = 'button';
        crumb.dataset.dropFolder = path;
        crumb.addEventListener('click', () => openFolder(path));
      }
      if (!index) return [crumb];
      const divider = document.createElement('i');
      divider.textContent = '/';
      divider.setAttribute('aria-hidden', 'true');
      return [divider, crumb];
    }),
  );
}
function renderSelectionBar() {
  const parts = [
    selectedFolders.size ? `${selectedFolders.size} folder` : '',
    selectedFiles.size ? `${selectedFiles.size} bài` : '',
  ].filter(Boolean);
  const bar = $('[data-selection-bar]');
  bar.toggleAttribute('hidden', !parts.length);
  $('[data-selection-summary]').textContent = parts.length ? `Đã chọn ${parts.join(' và ')}` : '';
  const rename = $<HTMLButtonElement>('[data-folder-rename]');
  document.querySelectorAll<HTMLButtonElement>('[data-visibility]').forEach((button) => {
    button.disabled = !selectedFiles.size && !selectedFolders.size;
  });
  rename.disabled = selectedFolders.size !== 1;
  rename.title = selectedFolders.size === 1 ? 'Đổi tên folder đang chọn' : 'Chọn đúng một folder để đổi tên';
}
function renderFolderHome(files: RepoFile[] = repoFiles) {
  folderSet = collectFolders();
  const here = currentFolder();
  const subfolders = childFolders(here);
  const posts = [...files, ...localOnly].filter((file) => folderOf(file) === here);
  const grid = $('[data-folder-grid]');
  grid.replaceChildren(...subfolders.map(makeFolderCard));
  grid.toggleAttribute('hidden', !subfolders.length);
  $('[data-folder-posts]').toggleAttribute('hidden', !posts.length);
  $('[data-folder-posts-title]').textContent = here ? 'Bài trong folder' : 'Bài chưa phân loại';
  $('[data-folder-files]').replaceChildren(...posts.map((file) => makeFileCard(file, 'folder-file-card')));
  $('[data-folder-empty]').toggleAttribute('hidden', !here || Boolean(subfolders.length || posts.length));
  $('[data-folder-back]').toggleAttribute('hidden', !here);
  $('[data-folder-new]').toggleAttribute('hidden', !here);
  $('[data-folder-create]').textContent = here ? '+ Folder con' : '+ Folder mới';
  $('[data-library-title]').textContent = here ? leafName(here) : 'Thư mục write-up';
  renderCrumbs(here);
  renderSelectionBar();
}

type TreeEntry = { path: string; mode: '100644'; type: 'blob'; sha?: string | null; content?: string };
function refreshFolderView() {
  repoTree = [...remoteBlobs];
  for (const entry of pending.entries) {
    repoTree = repoTree.filter((item) => item.path !== entry.path);
    if (entry.sha) repoTree.push({ path: entry.path, sha: entry.sha, type: 'blob' });
  }
  repoFiles = repoTree
    .filter((item) => item.path.startsWith(`${postRoot}/`) && /\.md$/.test(item.path))
    .map((item) => ({ path: item.path, sha: item.sha }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const count = pending.messages.length;
  $('[data-pending-bar]').toggleAttribute('hidden', !count);
  $('[data-pending-count]').textContent = `${count} thay đổi folder chưa lưu`;
  renderFolderHome(repoFiles);
  renderSidebar();
}
function stageEntries(entries: TreeEntry[], message: string) {
  const remote = new Set(remoteBlobs.map((item) => item.path));
  const staged = new Map(pending.entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    if (entry.sha === null && !remote.has(entry.path)) staged.delete(entry.path);
    else staged.set(entry.path, entry);
  }
  pending = { entries: [...staged.values()], messages: [...pending.messages, message] };
  writePending();
  refreshFolderView();
}
async function savePending() {
  if (!pending.messages.length) return true;
  if (!token()) {
    setStatus('Cần kết nối GitHub để lưu thay đổi.', 'error');
    return false;
  }
  const count = pending.messages.length;
  const message =
    count === 1
      ? pending.messages[0]
      : [`content: cập nhật ${count} thay đổi folder`, ...pending.messages].join('\n');
  try {
    setStatus(`Đang lưu ${count} thay đổi folder…`);
    await commitEntries(pending.entries, message);
    pending = { entries: [], messages: [] };
    writePending();
    setStatus(`Đã lưu ${count} thay đổi folder lên GitHub.`, 'ok');
    await loadTree();
    return true;
  } catch (error) {
    setStatus(errorMessage(error), 'error');
    return false;
  }
}
function discardPending() {
  pending = { entries: [], messages: [] };
  writePending();
  selectedFiles.clear();
  selectedFolders.clear();
  setStatus('Đã bỏ các thay đổi folder chưa lưu.', 'info');
  refreshFolderView();
}
async function commitEntries(entries: TreeEntry[], message: string) {
  const ref = await api<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(repo.branch)}`);
  const parent = await api<{ tree: { sha: string } }>(`/git/commits/${ref.object.sha}`);
  const tree = await api<{ sha: string }>('/git/trees', {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }),
  });
  const commit = await api<{ sha: string }>('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await api(`/git/refs/heads/${encodeURIComponent(repo.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });
}
function validateFolderName(name: string) {
  if (!name) return 'Nhập tên folder.';
  if (/[\\/]/.test(name)) return 'Tên folder không được chứa dấu / hoặc \\.';
  if (name.startsWith('.')) return 'Tên folder không được bắt đầu bằng dấu chấm (loader bỏ qua folder ẩn).';
  if (/[<>:"|?*\u0000-\u001f]/.test(name) || /[. ]$/.test(name))
    return 'Tên folder chứa ký tự không hợp lệ trên Windows.';
  return '';
}
type NameRequest = {
  kicker: string;
  title: string;
  label: string;
  value: string;
  hint: string;
  submit: string;
};
function askName(request: NameRequest): Promise<string | null> {
  const dialog = $<HTMLDialogElement>('[data-name-dialog]');
  const form = $('[data-name-form]');
  const input = $<HTMLInputElement>('[data-name-input]');
  const hint = $('[data-name-hint]');
  const cancel = $('[data-name-cancel]');
  $('[data-name-kicker]').textContent = request.kicker;
  $('[data-name-title]').textContent = request.title;
  $('[data-name-label]').textContent = request.label;
  $('[data-name-submit]').textContent = request.submit;
  input.value = request.value;
  hint.textContent = request.hint;
  delete hint.dataset.kind;
  return new Promise((resolve) => {
    let result: string | null = null;
    const submit = (event: Event) => {
      event.preventDefault();
      const value = input.value.trim();
      const problem = validateFolderName(value);
      if (problem) {
        hint.textContent = problem;
        hint.dataset.kind = 'error';
        return;
      }
      result = value;
      dialog.close();
    };
    const dismiss = () => dialog.close();
    dialog.addEventListener(
      'close',
      () => {
        form.removeEventListener('submit', submit);
        cancel.removeEventListener('click', dismiss);
        resolve(result);
      },
      { once: true },
    );
    form.addEventListener('submit', submit);
    cancel.addEventListener('click', dismiss);
    dialog.showModal();
    input.focus();
    input.select();
  });
}
function retargetCtf(source: string, from: string, to: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!match) return source;
  const head = match[1].replace(/^ctf:[ \t]*(.*?)[ \t]*$/m, (line, value: string) =>
    value.replace(/^(["'])(.*)\1$/, '$2') === from ? stringifyYaml({ ctf: to }).trimEnd() : line,
  );
  return head === match[1] ? source : source.replace(match[1], () => head);
}
async function createFolder() {
  if (!token()) return setStatus('Cần kết nối GitHub để tạo folder.', 'error');
  const here = currentFolder();
  const name = await askName({
    kicker: here ? `Trong ${here}` : 'Thư mục gốc',
    title: here ? 'Thêm folder con' : 'Thêm folder mới',
    label: 'Tên folder',
    value: '',
    hint: 'Folder rỗng được giữ trên GitHub bằng file .gitkeep.',
    submit: 'Tạo folder',
  });
  if (!name) return;
  const path = joinPath(here, name);
  if ([...folderSet].some((existing) => existing.toLowerCase() === path.toLowerCase()))
    return setStatus(`Đã có folder "${path}".`, 'error');
  if (repoFiles.some((file) => file.path.startsWith(`${postRoot}/${path}/`)))
    return setStatus(`"${path}" đang là thư mục của một bài viết.`, 'error');
  try {
    setStatus(`Đang tạo folder "${path}"…`);
    const blob = await api<{ sha: string }>('/git/blobs', {
      method: 'POST',
      body: JSON.stringify({ content: '', encoding: 'utf-8' }),
    });
    stageEntries(
      [{ path: `${postRoot}/${path}/${KEEP_FILE}`, mode: '100644', type: 'blob', sha: blob.sha }],
      `content: tạo folder "${path}"`,
    );
    setStatus(`Đã thêm folder "${path}" vào danh sách chờ. Bấm Save để commit.`, 'ok');
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  }
}
async function renameSelectedFolder() {
  const [oldPath] = [...selectedFolders];
  if (selectedFolders.size !== 1 || !oldPath) return setStatus('Chọn đúng một folder để đổi tên.', 'info');
  if (!token()) return setStatus('Cần kết nối GitHub để đổi tên folder.', 'error');
  const oldName = leafName(oldPath);
  const name = await askName({
    kicker: 'Đổi tên folder',
    title: oldName,
    label: 'Tên mới',
    value: oldName,
    hint: `Vị trí: ${oldPath}. Frontmatter ctf trùng tên cũ sẽ được cập nhật theo.`,
    submit: 'Đổi tên',
  });
  if (!name || name === oldName) return;
  const newPath = joinPath(parentOf(oldPath), name);
  if (
    [...folderSet].some(
      (existing) => existing !== oldPath && existing.toLowerCase() === newPath.toLowerCase(),
    )
  )
    return setStatus(`Đã có folder "${newPath}".`, 'error');
  if (repoFiles.some((file) => file.path.startsWith(`${postRoot}/${newPath}/`) && !folderSet.has(newPath)))
    return setStatus(`"${newPath}" đang là thư mục của một bài viết.`, 'error');
  const prefix = `${postRoot}/${oldPath}/`;
  const items = repoTree.filter((item) => item.path.startsWith(prefix));
  if (!items.length) return setStatus('Folder này chưa có file nào trên GitHub để đổi tên.', 'error');
  try {
    setStatus(`Đang đổi tên "${oldPath}" thành "${newPath}"…`);
    let retargeted = 0;
    const entries = (
      await Promise.all(
        items.map(async (item): Promise<TreeEntry[]> => {
          const target = `${postRoot}/${newPath}/${item.path.slice(prefix.length)}`;
          const removal: TreeEntry = { path: item.path, mode: '100644', type: 'blob', sha: null };
          if (item.path.endsWith('.md')) {
            const source = decode((await api<{ content: string }>(`/git/blobs/${item.sha}`)).content);
            const updated = retargetCtf(source, oldName, name);
            if (updated !== source) {
              retargeted += 1;
              const blob = await api<{ sha: string }>('/git/blobs', {
                method: 'POST',
                body: JSON.stringify({ content: updated, encoding: 'utf-8' }),
              });
              return [removal, { path: target, mode: '100644', type: 'blob', sha: blob.sha }];
            }
          }
          return [removal, { path: target, mode: '100644', type: 'blob', sha: item.sha }];
        }),
      )
    ).flat();
    selectedFolders.clear();
    selectedFiles.clear();
    if (activeFolder === oldPath || activeFolder?.startsWith(`${oldPath}/`))
      activeFolder = newPath + activeFolder.slice(oldPath.length);
    stageEntries(entries, `content: đổi tên folder "${oldPath}" thành "${newPath}"`);
    setStatus(
      `Đã thêm đổi tên "${oldPath}" thành "${newPath}"${retargeted ? ` (cập nhật ctf trong ${retargeted} bài)` : ''} vào danh sách chờ. Bấm Save để commit.`,
      'ok',
    );
  } catch (error) {
    setStatus(errorMessage(error), 'error');
  }
}
async function moveSelectionTo(targetFolder: string): Promise<boolean> {
  const isInside = (path: string, parent: string) => path === parent || path.startsWith(`${parent}/`);
  const folders = [...selectedFolders]
    .filter((path) => !isInside(targetFolder, path) && parentOf(path) !== targetFolder)
    .filter((path, _, all) => !all.some((other) => other !== path && isInside(path, other)));
  const files = repoFiles.filter(
    (file) =>
      selectedFiles.has(file.path) &&
      folderOf(file) !== targetFolder &&
      !folders.some((path) => inFolder(file, path)),
  );
  if (!files.length && !folders.length) {
    setStatus('Chọn ít nhất một bài hoặc folder ở vị trí khác trước khi kéo thả.', 'info');
    return false;
  }
  if (!token()) {
    setStatus('Cần kết nối GitHub để sắp xếp bài.', 'error');
    return false;
  }
  const clash = folders.find((path) =>
    [...folderSet].some(
      (existing) => existing.toLowerCase() === joinPath(targetFolder, leafName(path)).toLowerCase(),
    ),
  );
  if (clash) {
    setStatus(`Folder đích đã có folder tên "${leafName(clash)}".`, 'error');
    return false;
  }
  const conflict = files.find((file) =>
    repoFiles.some(
      (candidate) => folderOf(candidate) === targetFolder && articleName(candidate) === articleName(file),
    ),
  );
  if (conflict) {
    setStatus(`Folder đích đã có bài trùng tên: ${articleName(conflict)}.`, 'error');
    return false;
  }
  try {
    setStatus(`Đang chuyển vào ${targetFolder || 'thư mục gốc'}…`);
    const entries: TreeEntry[] = [];
    for (const path of folders) {
      const prefix = `${postRoot}/${path}`;
      const base = `${joinPath(postRoot, targetFolder, leafName(path))}`;
      for (const item of repoTree.filter((entry) => entry.path.startsWith(`${prefix}/`))) {
        entries.push(
          { path: `${base}${item.path.slice(prefix.length)}`, mode: '100644', type: 'blob', sha: item.sha },
          { path: item.path, mode: '100644', type: 'blob', sha: null },
        );
      }
    }
    for (const file of files) {
      const oldDirectory = file.path.replace(/\/[^/]+$/, '');
      const moved = isIndexFile(file)
        ? repoTree
            .filter((entry) => entry.path === oldDirectory || entry.path.startsWith(`${oldDirectory}/`))
            .map((entry) => ({
              item: entry,
              target: `${joinPath(postRoot, targetFolder, articleName(file))}${entry.path.slice(oldDirectory.length)}`,
            }))
        : repoTree
            .filter((entry) => entry.path === file.path)
            .map((entry) => ({
              item: entry,
              target: joinPath(postRoot, targetFolder, leafName(entry.path)),
            }));
      for (const { item, target } of moved) {
        entries.push(
          { path: target, mode: '100644', type: 'blob', sha: item.sha },
          { path: item.path, mode: '100644', type: 'blob', sha: null },
        );
      }
    }
    selectedFiles.clear();
    selectedFolders.clear();
    const label = [
      folders.length ? `${folders.length} folder` : '',
      files.length ? `${files.length} write-up` : '',
    ]
      .filter(Boolean)
      .join(' và ');
    stageEntries(entries, `content: chuyển ${label} vào ${targetFolder || 'thư mục gốc'}`);
    setStatus(
      `Đã thêm việc chuyển ${label} vào ${targetFolder || 'thư mục gốc'} vào danh sách chờ. Bấm Save để commit.`,
      'ok',
    );
    return true;
  } catch (error) {
    setStatus(errorMessage(error), 'error');
    return false;
  }
}
const assetsList = $('[data-assets-list]');
const assetsDrawer = $('[data-assets-drawer]');
const assetsToggle = $<HTMLButtonElement>('[data-assets-toggle]');
const assetsCount = $('[data-assets-count]');
const unusedOnly = $<HTMLInputElement>('[data-assets-unused]');
const assetCards = new Map<Asset, HTMLLIElement>();
const isImageAsset = (asset: Asset) => asset.file.type.startsWith('image/');
const assetMarkdown = (asset: Asset) =>
  isImageAsset(asset) ? `![image](./${asset.name})` : `[${asset.name}](./${asset.name})`;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Rút gọn ở giữa, giữ đuôi file để vẫn đọc được loại tệp. */
function shortName(name: string, max = 18) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : '';
  const stem = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1;
  const head = Math.ceil(keep * 0.6);
  return `${stem.slice(0, head)}…${stem.slice(stem.length - (keep - head))}${ext}`;
}
const usedAssetNames = () =>
  new Set([...editorSource().matchAll(/\.\/([^\s)"'<>\]]+)/g)].map((match) => match[1]));
function jumpToAsset(asset: Asset) {
  const match = new RegExp(`\\./${escapeRegExp(asset.name)}(?![^\\s)"'<>\\]])`).exec(editorSource());
  if (!match) return;
  const from = editor.state.doc.lineAt(match.index).from;
  editor.dispatch({ selection: { anchor: from }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
  editor.focus();
}
/** Chèn trên dòng riêng, cách đoạn kề bên bằng dòng trống để marked không gộp ảnh vào đoạn văn. */
function insertOwnLine(text: string, at = editor.state.selection.main.head) {
  const doc = editor.state.doc;
  const line = doc.lineAt(at);
  const blank = !line.text.trim();
  const next = line.number < doc.lines && doc.line(line.number + 1).text.trim() ? '\n' : '';
  const before = blank ? (line.number > 1 && doc.line(line.number - 1).text.trim() ? '\n' : '') : '\n\n';
  editor.dispatch({
    changes: { from: blank ? line.from : line.to, to: line.to, insert: before + text + next },
    selection: { anchor: (blank ? line.from : line.to) + before.length + text.length },
  });
  editor.focus();
}
function updateUsage() {
  usageTimer = undefined;
  const used = usedAssetNames();
  let unused = 0;
  for (const [asset, card] of assetCards) {
    const isUsed = used.has(asset.name);
    if (!isUsed) unused++;
    card.dataset.used = String(isUsed);
    card.hidden = unusedOnly.checked && isUsed;
    card.querySelector('.asset-badge')!.textContent = isUsed ? 'đã dùng' : 'chưa dùng';
  }
  assetsCount.textContent = `📎 ${assets.length} tệp${unused ? ` · ${unused} chưa dùng` : ''}`;
}
const scheduleUsage = () => {
  usageTimer ??= setTimeout(updateUsage, 250);
};
function renderAssets() {
  assetCards.clear();
  assetsList.replaceChildren(
    ...assets.map((asset) => {
      const item = document.createElement('li');
      item.className = 'asset-card';
      item.draggable = true;
      item.title = asset.name;
      const face = document.createElement('div');
      face.className = 'asset-face';
      face.tabIndex = 0;
      face.setAttribute('role', 'button');
      face.innerHTML = `${isImageAsset(asset) ? `<img src="${asset.url}" alt="" loading="lazy" draggable="false" />` : `<b class="asset-ext">${escapeHtml(asset.name.split('.').pop()?.slice(0, 5) ?? 'file')}</b>`}<span>${escapeHtml(shortName(asset.name))}</span><em class="asset-badge"></em>`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'asset-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Bỏ ${asset.name}`);
      remove.addEventListener('click', () => {
        URL.revokeObjectURL(asset.url);
        assets = assets.filter((entry) => entry !== asset);
        if (writtenAssets.has(asset)) droppedAssets.push(asset);
        renderAssets();
        void renderPreview();
        scheduleDraft();
      });
      const use = (alt: boolean) => {
        if (alt && item.dataset.used === 'true') jumpToAsset(asset);
        else insertOwnLine(assetMarkdown(asset));
      };
      face.addEventListener('click', (event) => use(event.altKey));
      face.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          use(event.altKey);
        }
      });
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer!.setData(assetMime, asset.name);
        event.dataTransfer!.effectAllowed = 'copy';
      });
      item.append(face, remove);
      assetCards.set(asset, item);
      return item;
    }),
  );
  updateUsage();
}
function insertText(text: string) {
  const range = editor.state.selection.main;
  editor.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + text.length },
  });
  editor.focus();
}
function insertMarkdown(kind: string) {
  const selected =
    editor.state.sliceDoc(editor.state.selection.main.from, editor.state.selection.main.to) || 'nội dung';
  const snippets: Record<string, string> = {
    heading: `## ${selected}`,
    bold: `**${selected}**`,
    link: `[${selected}](https://)`,
    code: `\`${selected}\``,
    info: `:::info\n${selected}\n:::`,
    warning: `:::warning\n${selected}\n:::`,
    footnote: `${selected}[^1]\n\n[^1]: Chú thích ở cuối bài.`,
    highlight: `==${selected}==`,
    latex: `$$\n${selected === 'nội dung' ? 'E = mc^2' : selected}\n$$`,
    mermaid: `\`\`\`mermaid\ngraph TD\n  A[Bắt đầu] --> B[Kết thúc]\n\`\`\``,
    sup: `<sup>${selected}</sup>`,
    sub: `<sub>${selected}</sub>`,
    toc: '[TOC]',
    youtube: `[YouTube](https://www.youtube.com/watch?v=VIDEO_ID)`,
    task: `- [ ] ${selected}`,
    quote: `> ${selected}`,
  };
  insertText(snippets[kind] ?? selected);
}
/** Từ điển tag = tag lúc build + tag đọc trực tiếp từ các bài trên GitHub (gồm cả bài vừa publish). */
const tagVocabulary = () =>
  buildVocabulary(
    builtTags,
    repoFiles.flatMap((file) => tagsBySha.get(file.sha) ?? []).map((name) => ({ name, count: 1 })),
  );
const currentTags = () =>
  tags.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
/** API key Gemini (free tier) chỉ lưu trong trình duyệt này, như GitHub token. */
const geminiKeyStorage = 'ctf-wu.studio.gemini-key';
const geminiKeyInput = $<HTMLInputElement>('[data-gemini-key]');
const showKeyState = () => {
  $('[data-ai-key-state]').textContent = geminiKeyInput.value.trim() ? 'đã lưu' : 'chưa có';
};
try {
  geminiKeyInput.value = localStorage.getItem(geminiKeyStorage) ?? '';
} catch {
  /* storage unavailable */
}
showKeyState();
geminiKeyInput.addEventListener('change', () => {
  try {
    const key = geminiKeyInput.value.trim();
    if (key) localStorage.setItem(geminiKeyStorage, key);
    else localStorage.removeItem(geminiKeyStorage);
  } catch {
    /* storage unavailable */
  }
  showKeyState();
});
const providerStorage = 'ctf-wu.studio.ai-provider';
const providerSelect = $<HTMLSelectElement>('[data-ai-provider]');
try {
  const saved = localStorage.getItem(providerStorage);
  if (saved && [...providerSelect.options].some((option) => option.value === saved))
    providerSelect.value = saved;
} catch {
  /* storage unavailable */
}
providerSelect.addEventListener('change', () => {
  try {
    localStorage.setItem(providerStorage, providerSelect.value);
  } catch {
    /* storage unavailable */
  }
});
/** Claude chạy qua middleware của dev server (`claude -p` dùng gói Pro đã đăng nhập trên máy). */
async function claudeSuggestTags(input: object): Promise<Awaited<ReturnType<typeof geminiSuggestTags>>> {
  const reply = await fetch('/__studio/claude-tags', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-sync': '1' },
    body: JSON.stringify(input),
  });
  const data = (await reply.json().catch(() => ({}))) as Awaited<ReturnType<typeof geminiSuggestTags>> & {
    error?: string;
  };
  if (!reply.ok) throw new Error(data.error ?? `Claude ${reply.status}`);
  return data;
}
const aiName = () => (providerSelect.value === 'claude' ? 'Claude' : 'Gemini');
const tagExamples: TagExample[] = (() => {
  try {
    return JSON.parse($('[data-tag-examples]').textContent ?? '[]') as TagExample[];
  } catch {
    return [];
  }
})();
const tagInput = () => ({
  title: title.value,
  body: editorSource(),
  category: category.value,
  ctf: ctf.value,
  difficulty: difficulty.value,
  current: currentTags(),
});
const modelLabel = (model: string) =>
  model
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-(flash|pro)/, (_, kind: string) => ` ${kind[0]!.toUpperCase()}${kind.slice(1)}`)
    .replace(/-lite$/, '-Lite');
/** Mỗi bài có một lượt Gemini riêng, nên bấm bài khác khi bài trước chưa xong vẫn chạy song song được. */
const tagJobs = new Set<string>();
function refreshTagButtons() {
  document.querySelectorAll<HTMLButtonElement>('[data-auto-tags]').forEach((button) => {
    if (tagJobs.has(currentPath())) button.dataset.busy = '';
    else delete button.dataset.busy;
  });
}
type DifficultySource = 'dreamhack' | 'gemini';
const difficultySourceLabel: Record<DifficultySource, string> = {
  dreamhack: 'chính thức từ Dreamhack',
  gemini: 'AI ước lượng',
};
/** Tier chính thức qua /api/dreamhack (Pages Function khi deploy, middleware khi npm run dev); lỗi thì để Gemini đoán. */
async function dreamhackLookup(id: string): Promise<string | undefined> {
  try {
    const reply = await fetch(`/api/dreamhack/${id}`);
    if (!reply.ok) return undefined;
    return ((await reply.json()) as { difficulty?: string | null }).difficulty ?? undefined;
  } catch {
    return undefined;
  }
}
async function autoTags() {
  const postPath = currentPath();
  if (tagJobs.has(postPath))
    return setStatus(`${aiName()} vẫn đang đọc bài này, đợi thông báo hoặc chuyển sang bài khác.`, 'info');
  const vocabulary = tagVocabulary();
  const input = tagInput();
  const offline = suggestTags(input, vocabulary);
  const apiKey = geminiKeyInput.value.trim();
  // AI luôn chấm độ khó (không cho nó thấy mức tác giả đã chọn); bài có link Dreamhack thì tier chính thức được đề xuất thay.
  // Độ khó cũ chỉ đổi khi tác giả chọn mức đề xuất trong thông báo.
  const chosen = input.difficulty;
  const dreamhackId = dreamhackChallengeId(input.body);
  const official = dreamhackId ? dreamhackLookup(dreamhackId) : Promise.resolve(undefined);
  const useClaude = providerSelect.value === 'claude';
  const engine = aiName();
  if (!apiKey && !useClaude) {
    $<HTMLDetailsElement>('[data-ai-key]').open = true;
    const rated = await official;
    if (rated && !chosen && currentPath() === postPath) difficulty.value = rated;
    return applyTagResult(
      offline,
      undefined,
      `Chưa có Gemini API key nên đây là gợi ý tags offline${rated || chosen ? '' : ', chưa chấm độ khó'}. Dán key (miễn phí) vào ô bên dưới để Gemini đọc cả bài`,
      'info',
      rated ? `${rated} (Dreamhack)` : undefined,
    );
  }
  const postTitle = title.value.trim() || postPath.split('/').slice(-2, -1)[0] || postPath;
  tagJobs.add(postPath);
  refreshTagButtons();
  setTagNote(
    `${engine} đang đọc bài để chấm độ khó và chọn tags. Cứ làm việc khác (kể cả đánh giá bài khác), xong sẽ có thông báo giữa màn hình`,
    'info',
  );
  try {
    const request = {
      ...input,
      difficulty: undefined,
      vocabulary: [...vocabulary.values()],
      examples: tagExamples,
    };
    const gemini = useClaude ? claudeSuggestTags(request) : geminiSuggestTags({ ...request, apiKey });
    const [ai, rated] = await Promise.all([gemini, official]);
    const pick: [string | undefined, DifficultySource] = rated
      ? [rated, 'dreamhack']
      : [ai.difficulty, 'gemini'];
    showTagToast({
      ai: engine,
      previous: chosen || undefined,
      tags: ai.tags,
      difficulty: pick[0],
      difficultySource: pick[0] ? pick[1] : undefined,
      difficultyReason: ai.difficultyReason,
      model: modelLabel(ai.model),
      summary: ai.summary,
      skipped: ai.skipped?.map((reason) => modelLabel(reason)),
      postPath,
      postTitle,
    });
  } catch (error) {
    const rated = await official;
    showTagToast({
      ai: engine,
      previous: chosen || undefined,
      error: `${error instanceof Error ? error.message : String(error)} Có thể dùng gợi ý offline thay thế`,
      difficulty: rated,
      difficultySource: rated ? 'dreamhack' : undefined,
      postPath,
      postTitle,
    });
  } finally {
    tagJobs.delete(postPath);
    refreshTagButtons();
    renderTagToast();
  }
}
type TagToast = {
  ai: string;
  previous?: string;
  postPath: string;
  postTitle: string;
  difficulty?: string;
  difficultySource?: DifficultySource;
  difficultyReason?: string;
  summary?: string;
  skipped?: string[];
  curated?: boolean;
  tags?: string[];
  model?: string;
  error?: string;
};
/** Hàng đợi kết quả: bài nào xong trước hiện trước, bấm xử lý xong bài này mới tới bài kế. */
const toastQueue: TagToast[] = [];
let applying = false;
const toast = $<HTMLElement>('[data-tag-toast]');
function showTagToast(result: TagToast) {
  toastQueue.push(result);
  if (result.postPath === currentPath()) setTagNote('', 'info');
  renderTagToast();
}
function renderTagToast() {
  const result = toastQueue[0];
  toast.hidden = !result;
  if (!result) return;
  toast.dataset.kind = result.error ? 'error' : 'ok';
  const empty = toastEmpty(result);
  $('[data-toast-title]').textContent = result.error
    ? `${result.ai} không đánh giá được bài`
    : empty
      ? 'Không còn gì để thêm'
      : [
          result.difficulty ? `Độ khó ${result.difficulty}` : 'Chưa có độ khó',
          `${result.tags!.length} tags`,
        ].join(' · ');
  const difficultyPick = $<HTMLSelectElement>('[data-toast-difficulty]');
  // Ô đầu là "giữ độ khó cũ": chọn nó thì bài không đổi độ khó.
  difficultyPick.options[0]!.textContent = result.previous
    ? `Giữ ${result.previous} (đang chọn)`
    : 'Giữ nguyên';
  difficultyPick.value = result.difficulty ?? '';
  $('[data-toast-difficulty-row]').hidden = Boolean(result.error);
  $('[data-toast-difficulty-source]').textContent = result.difficultySource
    ? `Độ khó (${difficultySourceLabel[result.difficultySource]}${result.previous && result.previous !== result.difficulty ? `, đang chọn ${result.previous}` : ''})`
    : 'Độ khó';
  $('[data-toast-post]').textContent = result.postTitle;
  const list = $('[data-toast-tags]');
  // Mỗi pill là một ô sửa được tại chỗ; ô cuối để thêm tag mới (gợi ý từ tag sẵn có của blog).
  const pills = (result.tags ?? []).map((tag, index) => {
    const item = document.createElement('li');
    const edit = Object.assign(document.createElement('input'), {
      type: 'text',
      value: tag,
      size: Math.max(tag.length, 2),
      spellcheck: false,
    });
    edit.dataset.toastEdit = String(index);
    edit.setAttribute('aria-label', `Sửa tag ${tag}`);
    edit.setAttribute('list', 'tag-options');
    const remove = Object.assign(document.createElement('button'), {
      type: 'button',
      textContent: '×',
      title: `Bỏ tag ${tag}`,
    });
    remove.dataset.toastRemove = String(index);
    remove.setAttribute('aria-label', `Bỏ tag ${tag}`);
    item.append(edit, remove);
    return item;
  });
  const adder = document.createElement('li');
  adder.className = 'toast-add';
  const add = Object.assign(document.createElement('input'), {
    type: 'text',
    placeholder: '+ Thêm tag',
    size: 10,
    spellcheck: false,
  });
  add.dataset.toastAdd = '';
  add.setAttribute('aria-label', 'Thêm tag');
  add.setAttribute('list', 'tag-options');
  adder.append(add);
  list.replaceChildren(...pills, adder);
  list.hidden = Boolean(result.error);
  const body = $('[data-toast-body]');
  // Lý do chỉ có nghĩa khi độ khó đang hiện đúng là mức AI chấm.
  const reason =
    result.difficultySource === 'gemini' && result.difficultyReason
      ? `Vì sao ${result.difficulty}: ${result.difficultyReason}`
      : '';
  body.textContent =
    result.error ??
    [result.summary ? `${result.ai} hiểu bài: ${result.summary}` : '', reason].filter(Boolean).join('\n');
  body.hidden = !body.textContent;
  const more = [
    result.error
      ? ''
      : `${result.model} · đổi độ khó ở ô trên, bấm vào tag để sửa, × để bỏ · Not yet: chỉ áp vào bài, chưa publish`,
    result.skipped?.length ? `Đã bỏ qua ${result.skipped.join('; ')}` : '',
    result.postPath === currentPath() ? '' : 'Bài này không phải bài đang mở, bấm nút sẽ tự mở bài đó trước',
    toastQueue.length > 1 ? `Còn ${toastQueue.length - 1} bài đang chờ xử lý` : '',
    tagJobs.size ? `${aiName()} đang đọc thêm ${tagJobs.size} bài` : '',
  ].filter(Boolean);
  $('[data-toast-hint]').textContent = more.join(' · ');
  $<HTMLButtonElement>('[data-toast-publish]').hidden = Boolean(result.error) || empty;
  $('[data-toast-apply]').textContent = result.error ? 'Dùng gợi ý offline' : empty ? 'Đóng' : 'Not yet';
}
const toastEmpty = (result: TagToast) => !result.error && result.tags!.length === 0 && !result.difficulty;
function closeTagToast() {
  toastQueue.shift();
  renderTagToast();
}
/** Mở đúng bài của kết quả (nếu đang ở bài khác) để áp tag vào editor. */
async function openPostForTags(path: string): Promise<boolean> {
  if (currentPath() === path) return true;
  const local = localOnly.find((file) => file.path === path);
  const remote = remoteBlobs.find((item) => item.path === path);
  if (local) await openLocalPost(local);
  else if (remote) await openPost({ path, sha: remote.sha });
  return currentPath() === path;
}
/** Áp tag vào bài mà không làm nhảy vị trí đang xem / đang gõ. */
async function applyPendingTags(): Promise<boolean> {
  const result = toastQueue[0];
  if (!result || applying) return false;
  applying = true;
  try {
    if (!(await openPostForTags(result.postPath))) {
      setStatus(
        `Không mở lại được "${result.postTitle}" để áp độ khó và tags (bài đã bị đổi tên hoặc chưa lưu). Bấm Đánh giá độ khó và các tags phù hợp lại.`,
        'error',
      );
      closeTagToast();
      return false;
    }
    const scrolled = [document.scrollingElement, ...document.querySelectorAll('.workspace *')]
      .filter((el): el is Element => Boolean(el) && el!.scrollTop > 0)
      .map((el) => [el, el.scrollTop] as const);
    const focused = document.activeElement;
    const vocabulary = tagVocabulary();
    const offline = suggestTags(tagInput(), vocabulary);
    closeTagToast();
    const rated =
      result.difficulty &&
      `${result.difficulty}${result.difficultySource ? ` (${difficultySourceLabel[result.difficultySource]})` : ''}`;
    if (result.difficulty) difficulty.value = result.difficulty;
    if (result.error)
      await applyTagResult(offline, undefined, `${result.ai} lỗi nên đây là gợi ý offline`, 'info', rated);
    else
      await applyTagResult(
        mergeAiTags(offline, result.tags!, vocabulary, 8, !result.curated),
        result.model,
        undefined,
        'error',
        rated,
      );
    for (const [el, top] of scrolled) el.scrollTop = top;
    if (focused instanceof HTMLElement && focused !== document.body) focused.focus({ preventScroll: true });
    return true;
  } finally {
    applying = false;
  }
}
$('[data-toast-difficulty]').addEventListener('change', (event) => {
  const result = toastQueue[0];
  if (!result) return;
  result.difficulty = (event.target as HTMLSelectElement).value || undefined;
  result.difficultySource = undefined;
  renderTagToast();
});
toast.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  if (target === toast || target.closest('[data-toast-close]')) return closeTagToast();
  const remove = target.closest<HTMLElement>('[data-toast-remove]');
  if (remove && toastQueue[0]?.tags) {
    toastQueue[0].tags.splice(Number(remove.dataset.toastRemove), 1);
    toastQueue[0].curated = true;
    return renderTagToast();
  }
  if (target.closest('[data-toast-apply]'))
    return toastQueue[0] && toastEmpty(toastQueue[0]) ? closeTagToast() : void applyPendingTags();
  if (target.closest('[data-toast-publish]'))
    return void applyPendingTags().then((ok) => {
      if (ok) void publish();
    });
});
/** Sửa một tag trong hộp thoại (rỗng thì bỏ) hoặc thêm tag mới; "a, b" thêm được nhiều tag một lần. */
function editToastTag(field: HTMLInputElement) {
  const result = toastQueue[0];
  if (!result?.tags) return;
  const names = field.value
    .split(',')
    .map((name) => name.trim().replace(/^#/, ''))
    .filter(Boolean);
  const index = field.dataset.toastEdit === undefined ? -1 : Number(field.dataset.toastEdit);
  if (index < 0 && !names.length) return;
  const others = result.tags.filter((_, i) => i !== index).map(tagKey);
  const fresh = names.filter(
    (name, i) =>
      !others.includes(tagKey(name)) && names.findIndex((other) => tagKey(other) === tagKey(name)) === i,
  );
  if (index >= 0 && fresh.length === 1) {
    // Đổi tên một tag: sửa tại chỗ, không vẽ lại để khỏi mất ô người dùng vừa bấm sang.
    if (fresh[0] !== result.tags[index]) {
      result.tags[index] = fresh[0]!;
      result.curated = true;
    }
    field.value = fresh[0]!;
    return;
  }
  if (index >= 0) result.tags.splice(index, 1, ...fresh);
  else result.tags.push(...fresh);
  result.curated = true;
  renderTagToast();
  if (index < 0) $<HTMLInputElement>('[data-toast-add]').focus();
}
toast.addEventListener('change', (event) => {
  const field = (event.target as HTMLElement).closest<HTMLInputElement>(
    '[data-toast-edit], [data-toast-add]',
  );
  if (field) editToastTag(field);
});
toast.addEventListener('input', (event) => {
  const field = (event.target as HTMLElement).closest<HTMLInputElement>(
    '[data-toast-edit], [data-toast-add]',
  );
  if (field) field.size = Math.max(field.value.length, field.dataset.toastAdd === undefined ? 2 : 10);
});
toast.addEventListener('keydown', (event) => {
  const field = (event.target as HTMLElement).closest<HTMLInputElement>(
    '[data-toast-edit], [data-toast-add]',
  );
  if (!field) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    editToastTag(field);
  } else if (event.key === 'Escape' && field.dataset.toastEdit !== undefined) {
    // Esc trong ô đang sửa chỉ huỷ phần vừa gõ, không đóng hộp thoại.
    event.stopPropagation();
    field.value = toastQueue[0]?.tags?.[Number(field.dataset.toastEdit)] ?? field.value;
    field.blur();
  } else if (
    event.key === 'Backspace' &&
    field.dataset.toastAdd !== undefined &&
    !field.value &&
    toastQueue[0]?.tags?.length
  ) {
    toastQueue[0].tags.pop();
    toastQueue[0].curated = true;
    renderTagToast();
    $<HTMLInputElement>('[data-toast-add]').focus();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !toast.hidden && !applying) closeTagToast();
});
function setTagNote(message: string, kind: 'info' | 'error' | 'ok') {
  const note = $('[data-tag-note]');
  note.textContent = message;
  note.dataset.kind = kind;
  note.hidden = !message;
  setStatus(message, kind);
}
async function applyTagResult(
  result: TagSuggestion,
  source?: string,
  warning?: string,
  warningKind: 'info' | 'error' = 'error',
  rated?: string,
) {
  tags.value = result.tags.join(', ');
  const known = result.added.filter((name) => !result.novel.includes(name));
  const notes = [
    warning ?? '',
    rated ? `Độ khó: ${rated}` : '',
    known.length ? `Đã thêm tags${source ? ` (${source})` : ''}: ${known.join(', ')}` : '',
    result.novel.length ? `Tag mới (chưa có trong blog, soát lại nhé): ${result.novel.join(', ')}` : '',
    result.renamed.length
      ? `Đổi theo cách viết sẵn có: ${result.renamed.map(([from, to]) => `${from} → ${to}`).join(', ')}`
      : '',
    result.removed.length ? `Bỏ tag tên mảng (đã có category): ${result.removed.join(', ')}` : '',
  ].filter(Boolean);
  setTagNote(
    notes.join('. ') || 'Chưa tìm được tag mới từ nội dung.',
    warning ? warningKind : notes.length ? 'ok' : 'info',
  );
  scheduleDraft();
  await renderPreview();
}
/** Gợi ý tag đã có (chưa dùng) cho ô "Thêm tag…", khớp phần đang gõ. */
function updateTagOptions() {
  const needle = tagEntry.value.trim().toLowerCase();
  const used = new Set(currentTags().map(tagKey));
  const options = [...tagVocabulary().values()]
    .filter((term) => !used.has(tagKey(term.name)) && (!needle || term.name.toLowerCase().includes(needle)))
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(needle)) - Number(!b.name.toLowerCase().startsWith(needle)) ||
        b.count - a.count ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 30)
    .map((term) => Object.assign(document.createElement('option'), { value: term.name }));
  $('[data-tag-options]').replaceChildren(...options);
}
/** Tags thật nằm trong input ẩn `data-tags` (chuỗi cách nhau dấu phẩy); chip và ô nhập chỉ là lớp hiển thị. */
const tagEntry = $<HTMLInputElement>('[data-tag-entry]');
function setTags(list: string[]) {
  tags.value = list.join(', ');
  tags.dispatchEvent(new Event('input'));
}
function commitTagEntry() {
  const typed = tagEntry.value
    .split(',')
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean);
  tagEntry.value = '';
  if (!typed.length) return;
  const vocabulary = tagVocabulary();
  const seen = new Set(currentTags().map(tagKey));
  const fresh = typed
    .map((tag) => canonicalTag(tag, vocabulary))
    .filter((tag) => !seen.has(tagKey(tag)) && seen.add(tagKey(tag)));
  if (fresh.length) setTags([...currentTags(), ...fresh]);
  updateTagOptions();
}
let chipState = '';
/** Đồng bộ chip category / độ khó / tags theo giá trị hiện tại (gọi mỗi lần render preview). */
function renderMetaChips() {
  for (const group of document.querySelectorAll<HTMLElement>('[data-chip-group]')) {
    const value = group.dataset.chipGroup === 'category' ? category.value : difficulty.value;
    for (const chip of group.querySelectorAll<HTMLButtonElement>('[data-chip]'))
      chip.setAttribute('aria-pressed', String(chip.dataset.chip === value));
  }
  const list = currentTags();
  const vocabulary = tagVocabulary();
  const state = `${tags.value}|${vocabulary.size}`;
  if (state === chipState) return;
  chipState = state;
  $('[data-tag-chips]').replaceChildren(
    ...list.map((name, index) => {
      const chip = document.createElement('li');
      const novel = !vocabulary.has(tagKey(name));
      if (novel) {
        chip.dataset.novel = '';
        chip.title = 'Tag mới, chưa có bài nào dùng';
      }
      const label = document.createElement('span');
      label.textContent = name;
      const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '×' });
      remove.dataset.removeTag = String(index);
      remove.setAttribute('aria-label', `Bỏ tag ${name}`);
      chip.append(label, remove);
      return chip;
    }),
  );
}
function addFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
    const name = assets.some((asset) => asset.name === safe) ? `${Date.now()}-${safe}` : safe;
    assets.push({ file, name, url: URL.createObjectURL(file) });
    if (file.type.startsWith('image/')) insertText(`![${name}](./${name})`);
  }
  renderAssets();
  void renderPreview();
  scheduleDraft();
}
function renderTableOfContents() {
  const slugger = new GithubSlugger();
  for (const heading of preview.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')) {
    if (!heading.id) heading.id = slugger.slug(heading.textContent ?? '');
  }
  const headings = [...preview.querySelectorAll<HTMLHeadingElement>('h1,h2,h3')];
  const nav = document.createElement('nav');
  nav.className = 'studio-toc';
  nav.setAttribute('aria-label', 'Mục lục');
  nav.dataset.toc = '';
  if (headings.length < 2) return;
  const minDepth = Math.min(...headings.map((heading) => Number(heading.tagName.slice(1))));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'studio-toc-rail';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Mở mục lục');
  toggle.innerHTML = '<span class="studio-toc-label">Mục lục</span>';
  const pop = document.createElement('div');
  pop.className = 'studio-toc-pop';
  pop.innerHTML = '<p class="studio-toc-title">Mục lục</p>';
  const list = document.createElement('ol');
  headings.forEach((heading) => {
    const id = heading.id;
    heading.id = id;
    const bar = document.createElement('span');
    bar.className = `studio-toc-bar studio-toc-l${Number(heading.tagName.slice(1)) - minDepth}`;
    bar.dataset.tocBar = id;
    bar.setAttribute('aria-hidden', 'true');
    toggle.append(bar);
    const item = document.createElement('li');
    item.className = `studio-toc-l${Number(heading.tagName.slice(1)) - minDepth}`;
    const link = document.createElement('a');
    link.href = `#${id}`;
    link.dataset.tocLink = id;
    link.textContent = heading.textContent ?? '';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nav.removeAttribute('data-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
    item.append(link);
    list.append(item);
  });
  pop.append(list);
  nav.append(toggle, pop);
  preview.prepend(nav);
  const updateActive = () => {
    const limit = preview.getBoundingClientRect().top + preview.clientHeight * 0.35;
    let active: string | undefined;
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > limit) break;
      active = heading.id;
    }
    nav
      .querySelectorAll<HTMLElement>('[data-toc-bar]')
      .forEach((bar) => bar.toggleAttribute('data-active', bar.dataset.tocBar === active));
    nav
      .querySelectorAll<HTMLAnchorElement>('[data-toc-link]')
      .forEach((link) =>
        link.dataset.tocLink === active
          ? link.setAttribute('aria-current', 'true')
          : link.removeAttribute('aria-current'),
      );
  };
  if (tocScroll) preview.removeEventListener('scroll', tocScroll);
  tocScroll = updateActive;
  preview.addEventListener('scroll', updateActive, { passive: true });
  updateActive();
  toggle.addEventListener('click', () => {
    const open = !nav.hasAttribute('data-open');
    nav.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
}
const languageAlias: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  shellscript: 'bash',
  yml: 'yaml',
  html: 'html',
  svg: 'xml',
  plaintext: 'text',
  txt: 'text',
  console: 'shellsession',
  terminal: 'shellsession',
  rb: 'ruby',
  rs: 'rust',
  cpp: 'cpp',
  'c++': 'cpp',
  cs: 'csharp',
  'c#': 'csharp',
  golang: 'go',
  md: 'markdown',
};
const bundledLanguageIds = new Map<string, string>();
for (const language of bundledLanguagesInfo) {
  bundledLanguageIds.set(language.id.toLowerCase(), language.id);
  bundledLanguageIds.set(language.name.toLowerCase(), language.id);
  for (const alias of language.aliases ?? []) bundledLanguageIds.set(alias.toLowerCase(), language.id);
}
function resolveCodeLanguage(raw: string, source: string) {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/^language-/, '')
    .replace(/!+$/, '');
  const alias = languageAlias[name] ?? name;
  return name && alias !== 'text'
    ? (bundledLanguageIds.get(alias) ?? guessCodeLanguage(source))
    : guessCodeLanguage(source);
}
function guessCodeLanguage(source: string) {
  const text = source.trim();
  if (/^(?:\{[\s\S]*\}|\[[\s\S]*\])$/.test(text)) return 'json';
  if (/^<\?php\b/i.test(text) || /\$_(?:GET|POST|SERVER|FILES|COOKIE|SESSION)\b|\$[a-z_][\w]*\s*=/.test(text))
    return 'php';
  if (/^(?:#!.*\b(?:ba)?sh\b|(?:sudo|apt|curl|wget|chmod|grep|cat|cd|export)\s)/im.test(text)) return 'bash';
  if (/^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+\S+\s+HTTP\/|^HTTP\/\d/im.test(text)) return 'http';
  if (/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/im.test(text)) return 'sql';
  if (/^(?:<!doctype html|<html\b|<svg\b|<[a-z][^>]*>)/i.test(text))
    return /<svg\b/i.test(text) ? 'xml' : 'html';
  if (/^(?:from\s+\w+\s+import|import\s+\w+|def\s+\w+\s*\(|class\s+\w+\s*\(|print\s*\()/m.test(text))
    return 'python';
  if (/^(?:const|let|var|function|async\s+function|import\s+.*from|console\.log|document\.)\b/m.test(text))
    return 'javascript';
  return 'text';
}
/** Gom các lần gọi trong cùng một frame thành một lần render; promise trả về xong khi phần đồng bộ đã dựng DOM. */
function renderPreview(): Promise<void> {
  renderPending ??= new Promise<void>((resolve) => {
    const run = () => {
      renderPending = undefined;
      renderNow()
        .catch((error) => console.error('Preview render failed:', error))
        .finally(resolve);
    };
    if (document.hidden) setTimeout(run, 0);
    else requestAnimationFrame(run);
  });
  return renderPending;
}
async function highlightCode(code: string, lang: string) {
  const key = `${lang}\0${code}`;
  const cached = highlightCache.get(key);
  if (cached) return cached;
  const html = await codeToHtml(code, { lang, theme: 'github-dark-default' });
  if (highlightCache.size >= 200) highlightCache.delete(highlightCache.keys().next().value!);
  highlightCache.set(key, html);
  return html;
}
/** Thay khối bằng element mới nhưng giữ data-line/data-end để cuộn đồng bộ còn tìm được. */
function swapBlock(block: Element, next: Element) {
  const { line, end } = (block as HTMLElement).dataset;
  if (line !== undefined) (next as HTMLElement).dataset.line = line;
  if (end !== undefined) (next as HTMLElement).dataset.end = end;
  block.replaceWith(next);
}
const htmlElement = (html: string) =>
  Object.assign(document.createElement('template'), { innerHTML: html }).content.firstElementChild!;
/** Ảnh đã biết kích thước thì đặt width/height để trình duyệt giữ chỗ trước khi ảnh tải xong. */
function sizeImages() {
  for (const image of preview.querySelectorAll('img')) {
    const size = imageSizes.get(image.getAttribute('src') ?? '');
    if (size) {
      image.width = size.w;
      image.height = size.h;
    }
  }
}
async function renderNow() {
  renderMetaChips();
  const version = ++renderVersion;
  const source = editorSource().replace(/\]\(\.\/([^\s)]+)\)/g, (all, name) =>
    assetUrl(name) ? `](${assetUrl(name)})` : all,
  );
  if (!source.trim()) {
    preview.innerHTML = '<p class="placeholder">Preview Markdown sẽ hiện ở đây.</p>';
    previewState.textContent = 'Đang chờ nội dung';
    layoutNow();
    return;
  }
  previewState.textContent = 'Đang render…';
  const html = await renderStudioMarkdown(source, title.value);
  if (version !== renderVersion) return;
  preview.innerHTML = html;
  sizeImages();
  renderTableOfContents();
  layoutNow();
  const codeBlocks = [...preview.querySelectorAll<HTMLElement>('pre > code')];
  await Promise.all(
    codeBlocks.map(async (code) => {
      const rawLanguage = (
        code.dataset.lang ||
        [...code.classList].find((name) => name.startsWith('language-'))?.slice(9) ||
        ''
      )
        .replace(/!+$/, '')
        .toLowerCase();
      if (rawLanguage === 'mermaid') {
        const diagram = document.createElement('pre');
        diagram.className = 'mermaid';
        diagram.textContent = code.textContent ?? '';
        swapBlock(code.parentElement!, diagram);
        return;
      }
      const language = resolveCodeLanguage(rawLanguage, code.textContent ?? '');
      try {
        const html = await highlightCode(code.textContent ?? '', language);
        if (version === renderVersion) {
          const next = htmlElement(html);
          if (code.dataset.wrap === 'true') next.setAttribute('data-wrap', 'true');
          swapBlock(code.parentElement!, next);
        }
      } catch {
        try {
          const fallback = guessCodeLanguage(code.textContent ?? '');
          if (fallback !== 'text') {
            const html = await highlightCode(code.textContent ?? '', fallback);
            if (version === renderVersion) {
              const next = htmlElement(html);
              if (code.dataset.wrap === 'true') next.setAttribute('data-wrap', 'true');
              swapBlock(code.parentElement!, next);
            }
          } else code.innerHTML = escapeHtml(code.textContent ?? '');
        } catch {
          code.innerHTML = escapeHtml(code.textContent ?? '');
        }
      }
    }),
  );
  if (version === renderVersion) {
    scheduleLayout();
    await renderDiagrams(preview);
  }
  if (version === renderVersion) {
    previewState.textContent = 'Live preview';
    scheduleLayout();
  }
}
/** Chỉ có khi mở Studio qua `npm run dev`: git pull về máy để file Studio vừa ghi không chặn lần pull sau. Bản deploy không có endpoint: nếu đã ghi file local thì nhắc tự đồng bộ, vì git trên máy chưa biết commit vừa publish. */
async function pullToGit(localSynced: boolean): Promise<string | null> {
  const pending = localSynced
    ? 'Trên máy chạy npm run sync (hoặc npm run dev) để git nhận bài vừa publish.'
    : null;
  try {
    const reply = await fetch('/__studio/sync', { method: 'POST', headers: { 'x-studio-sync': '1' } });
    if (!reply.ok) return pending;
    const result = (await reply.json()) as { ok: boolean; message: string };
    return result.ok ? 'Đã git pull về máy.' : `Git: ${result.message}`;
  } catch {
    return pending;
  }
}
/** Ảnh dán rồi xoá khỏi bài: bỏ khỏi kho tệp và xoá file local để không publish và không thành untracked. File đã có trên GitHub thì giữ, vì xoá local sẽ thành thay đổi git. */
async function pruneUnusedAssets() {
  const used = usedAssetNames();
  const directory = articleDirectory();
  const unused = [...assets, ...droppedAssets].filter(
    (asset) =>
      !used.has(asset.name) && !remoteBlobs.some((item) => item.path === `${directory}/${asset.name}`),
  );
  if (!unused.length) return;
  const target = localDirectory ? await localEntry(directory).catch(() => undefined) : undefined;
  for (const asset of unused) {
    URL.revokeObjectURL(asset.url);
    if (target) await target.removeEntry(asset.name).catch(() => undefined);
  }
  assets = assets.filter((asset) => !unused.includes(asset));
  droppedAssets = [];
  renderAssets();
}
async function publish() {
  if (!token()) {
    $('[data-token-box]').hidden = false;
    return setStatus('Nhập GitHub token trước khi publish.', 'error');
  }
  if (!title.value.trim()) return setStatus('Cần nhập tiêu đề.', 'error');
  if (!slugify(title.value)) return setStatus('Tiêu đề chưa tạo được tên folder hợp lệ.', 'error');
  const issues = checkMetadata(composePost(), relativeFolder(), title.value).filter(
    (issue) => issue.severity === 'error',
  );
  if (issues.length)
    return setStatus(issues.map((issue) => `${issue.field}: ${issue.message}`).join('\n'), 'error');
  if (!(await savePending())) return;
  await settleDraft();
  await pruneUnusedAssets();
  const filePath = currentPath();
  if (!openFile && remoteBlobs.some((item) => item.path.startsWith(`${articleDirectory()}/`))) {
    return setStatus(
      `GitHub đã có ${relPath(articleDirectory())}; đổi tiêu đề hoặc folder để không ghi đè bài khác.`,
      'error',
    );
  }
  try {
    setStatus('Đang tạo commit…');
    const commit = await publishArticle(api, {
      path: filePath,
      source: composePost(),
      expectedSha: openFile?.sha,
      branch: repo.branch,
      message: `content: ${openFile ? 'sửa' : 'thêm'} "${title.value.trim()}"`,
      blobs: await Promise.all(
        assets
          .filter((asset) => !asset.remote)
          .map(async (asset) => ({
            path: `${articleDirectory()}/${asset.name}`,
            content: encodeBinary(new Uint8Array(await asset.file.arrayBuffer())),
          })),
      ),
    });
    const contentsPath = `/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;
    removeDraft();
    draftBase = await hashText(composePost());
    openFile = {
      path: filePath,
      sha: await api<{ sha: string }>(`${contentsPath}?ref=${commit.sha}`).then(
        (file) => file.sha,
        () => '',
      ),
    };
    localDraftPath = undefined;
    localDraftOwned = false;
    $('[data-file-label]').textContent = filePath.replace(`${postRoot}/`, '');
    activeFolder = relativeFolder();
    $('[data-save-state]').textContent = 'Đã publish';
    const localSynced = await syncLocal({ quiet: true });
    if (localSynced) localStorage.setItem(localBaselineKey(filePath), await hashText(composePost()));
    const git = await pullToGit(localSynced);
    setStatus(
      [
        localSynced
          ? 'Đã publish GitHub và đồng bộ file trong src/content/posts local.'
          : 'Đã publish GitHub. Kết nối thư mục src/content/posts để đồng bộ local.',
        git ?? '',
      ]
        .filter(Boolean)
        .join(' '),
      git && git.startsWith('Git:') ? 'error' : 'ok',
    );
    void loadTree();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'error');
  }
}
async function chooseLocalFolder(): Promise<boolean> {
  type DirectoryPickerWindow = Window & {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: FileSystemHandle;
    }) => Promise<LocalDirectoryHandle>;
  };
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) {
    setStatus('Trình duyệt này không hỗ trợ đồng bộ folder local. Dùng Chrome hoặc Edge desktop.', 'error');
    return false;
  }
  try {
    await dropStaleLocalDirectory();
    const selectedDirectory = await picker.call(window, {
      id: 'ctf-wu-blog-posts',
      mode: 'readwrite',
      ...(localDirectory ? { startIn: localDirectory } : {}),
    });
    if (selectedDirectory.name.toLowerCase() !== 'posts') {
      setStatus(
        `Hãy chọn đúng thư mục ${localPostsPath}. Thư mục D:\\Security\\CTF chỉ chứa source và file bài tập.`,
        'error',
      );
      return false;
    }
    localDirectory = selectedDirectory;
    localPermission = await selectedDirectory.requestPermission({ mode: 'readwrite' });
    if (localPermission !== 'granted') {
      updateLocalButton();
      setStatus('Chưa được cấp quyền đọc và ghi thư mục posts.', 'error');
      return false;
    }
    await saveLocalHandle(selectedDirectory);
    updateLocalButton();
    setStatus(
      'Đã kết nối thư mục posts. Bài local sẽ được đối chiếu với GitHub khi mở và sau khi Publish.',
      'ok',
    );
    void scanLocalDrafts();
    if (!openFile) saveDraft();
    return true;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError'))
      setStatus(
        `Không mở được hộp chọn thư mục (${errorMessage(error)}). Bấm nút "Local" để chọn lại.`,
        'error',
      );
    return false;
  }
}
async function connectLocalFolder() {
  if (localMode) {
    setStatus(
      'Studio đang chạy qua npm run dev: ghi thẳng vào src/content/posts trên máy, không cần chọn thư mục.',
      'info',
    );
    return;
  }
  if (!localDirectory) {
    await chooseLocalFolder();
    return;
  }
  try {
    const granted = await requestLocalPermission();
    if (!localDirectory) {
      await chooseLocalFolder();
      return;
    }
    void scanLocalDrafts();
    if (granted && !openFile) saveDraft();
    setStatus(
      granted ? 'Đã kết nối lại thư mục posts local.' : 'Chưa được cấp quyền đọc và ghi thư mục posts.',
      granted ? 'ok' : 'error',
    );
  } catch {
    await chooseLocalFolder();
  }
}
async function syncLocal({ quiet = false }: { quiet?: boolean } = {}) {
  if (!localDirectory) {
    if (!quiet) return chooseLocalFolder();
    return false;
  }
  try {
    if (!(await requestLocalPermission())) throw new Error('Cần cấp lại quyền thư mục posts local.');
    const filePath = currentPath();
    const parts = localRelativePath(filePath).split('/');
    let target: FileSystemDirectoryHandle = localDirectory;
    for (const part of parts.slice(0, -1)) target = await target.getDirectoryHandle(part, { create: true });
    const write = async (name: string, data: File | string) => {
      const handle = await target.getFileHandle(name, { create: true });
      const stream = await handle.createWritable();
      await stream.write(data);
      await stream.close();
    };
    await write(parts.at(-1)!, composePost());
    for (const asset of assets) if (!asset.remote) await write(asset.name, asset.file);
    if (!quiet) setStatus('Đã đồng bộ write-up và file đính kèm vào src/content/posts local.', 'ok');
    return true;
  } catch (error) {
    if (!quiet) setStatus(error instanceof Error ? error.message : String(error), 'error');
    return false;
  }
}
document
  .querySelectorAll<HTMLButtonElement>('[data-new]')
  .forEach((button) => button.addEventListener('click', () => void newWriteup()));
$('[data-reload]').addEventListener('click', () => void loadTree());
$('[data-local-connect]').addEventListener('click', () => void connectLocalFolder());
$('[data-connect]').addEventListener('click', () => {
  if (tokenInput.value.trim()) localStorage.setItem(STUDIO_TOKEN_KEY, tokenInput.value.trim());
  githubConnected = false;
  updateConnection();
  void loadTree();
});
$('[data-publish]').addEventListener('click', () => void publish());
$('[data-library]').addEventListener('click', showLibrary);
$('[data-folder-back]').addEventListener('click', () => openFolder(parentOf(currentFolder())));
$('[data-folder-create]').addEventListener('click', () => void createFolder());
document
  .querySelectorAll<HTMLButtonElement>('[data-visibility]')
  .forEach((button) =>
    button.addEventListener('click', () => void setVisibility(button.dataset.visibility === 'hide')),
  );
$('[data-folder-rename]').addEventListener('click', () => void renameSelectedFolder());
$('[data-pending-save]').addEventListener('click', () => void savePending());
$('[data-pending-discard]').addEventListener('click', discardPending);
$('[data-selection-clear]').addEventListener('click', () => {
  selectedFiles.clear();
  selectedFolders.clear();
  renderFolderHome();
  renderSidebar();
});
document
  .querySelectorAll('[data-auto-tags]')
  .forEach((button) => button.addEventListener('click', () => void autoTags()));
tagEntry.addEventListener('focus', updateTagOptions);
tagEntry.addEventListener('input', (event) => {
  // Chọn một dòng trong datalist (không phải gõ phím) thì chốt tag luôn.
  if (!(event instanceof InputEvent) || event.inputType === 'insertReplacementText') commitTagEntry();
  else updateTagOptions();
});
tagEntry.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ',') && !event.isComposing) {
    event.preventDefault();
    commitTagEntry();
  } else if (event.key === 'Backspace' && !tagEntry.value && currentTags().length)
    setTags(currentTags().slice(0, -1));
});
tagEntry.addEventListener('blur', commitTagEntry);
$('[data-tag-chips]').addEventListener('click', (event) => {
  const index = (event.target as HTMLElement).closest<HTMLElement>('[data-remove-tag]')?.dataset.removeTag;
  if (index !== undefined) setTags(currentTags().filter((_, i) => i !== Number(index)));
});
$('.tag-box').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) tagEntry.focus();
});
for (const group of document.querySelectorAll<HTMLElement>('[data-chip-group]')) {
  const target = group.dataset.chipGroup === 'category' ? category : difficulty;
  group.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-chip]');
    if (!chip) return;
    target.value = target.value === chip.dataset.chip ? '' : chip.dataset.chip!;
    target.dispatchEvent(new Event('input'));
  });
}
$('[data-metadata-toggle]').addEventListener('click', () => {
  const metadata = $<HTMLDetailsElement>('[data-metadata]');
  metadata.open = !metadata.open;
});
document
  .querySelectorAll<HTMLButtonElement>('[data-markdown]')
  .forEach((button) => button.addEventListener('click', () => insertMarkdown(button.dataset.markdown ?? '')));
$('[data-sidebar-toggle]').addEventListener('click', () => {
  const collapsed = document.querySelector('.studio')!.toggleAttribute('data-sidebar-collapsed');
  localStorage.setItem('ctf-wu.studio-sidebar-collapsed', String(collapsed));
});
$('[data-connection]').addEventListener('click', () => {
  if (localMode)
    return setStatus(
      'Studio local dùng git trên máy (push bằng credential của git), không cần GitHub token.',
      'info',
    );
  $('[data-token-box]').hidden = !$('[data-token-box]').hidden;
  if (!$('[data-token-box]').hidden) tokenInput.focus();
});
[title, summary, folder, date, ctf, category, difficulty, tags].forEach((input) =>
  input.addEventListener('input', () => {
    void renderPreview();
    scheduleDraft();
  }),
);
$('[data-resize]').addEventListener('pointerdown', (event) => {
  const handle = event.currentTarget as HTMLElement;
  const grid = document.querySelector<HTMLElement>('.editor-grid')!;
  const stacked = matchMedia('(max-width: 58rem)').matches;
  handle.setAttribute('aria-orientation', stacked ? 'horizontal' : 'vertical');
  handle.setPointerCapture(event.pointerId);
  document.body.dataset.resizing = '';
  const resize = (move: PointerEvent) => {
    const box = grid.getBoundingClientRect();
    const percent = stacked
      ? Math.max(30, Math.min(70, ((move.clientY - box.top) / box.height) * 100))
      : Math.max(30, Math.min(70, ((move.clientX - box.left) / box.width) * 100));
    if (stacked) grid.style.gridTemplateRows = `${percent}% .55rem minmax(0, 1fr)`;
    else grid.style.gridTemplateColumns = `${percent}% .55rem minmax(0, 1fr)`;
  };
  const finish = () => {
    document.body.removeAttribute('data-resizing');
    handle.removeEventListener('pointermove', resize);
    handle.removeEventListener('pointerup', finish);
    handle.removeEventListener('pointercancel', finish);
  };
  handle.addEventListener('pointermove', resize);
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
});
const syncButton = $<HTMLButtonElement>('[data-sync-mode]');
const syncModes: SyncMode[] = ['off', 'scroll', 'follow'];
const syncLabels: Record<SyncMode, string> = { off: '↕ Tắt', scroll: '↕ Cuộn', follow: '↕ Cuộn + con trỏ' };
const syncTitles: Record<SyncMode, string> = {
  off: 'Cuộn đồng bộ: tắt. Bấm để bật cuộn theo dòng nguồn',
  scroll: 'Cuộn đồng bộ theo dòng nguồn. Bấm để thêm theo con trỏ',
  follow: 'Cuộn đồng bộ và preview theo con trỏ. Bấm để tắt',
};
function applySyncMode(mode: SyncMode) {
  syncMode = mode;
  syncButton.dataset.mode = mode;
  syncButton.textContent = syncLabels[mode];
  syncButton.title = syncTitles[mode];
  syncButton.setAttribute('aria-label', syncTitles[mode]);
  try {
    localStorage.setItem(syncModeKey, mode);
  } catch {
    /* storage unavailable */
  }
}
syncButton.addEventListener('click', () => {
  applySyncMode(syncModes[(syncModes.indexOf(syncMode) + 1) % syncModes.length]);
  if (syncMode !== 'off') queueSync('editor');
});
applySyncMode(syncMode);

const lockScroll = (side: SyncSide, ms = 150) => {
  scrollLockUntil[side] = performance.now() + ms;
};
const isLocked = (side: SyncSide) => performance.now() < scrollLockUntil[side];
const atEnd = (element: HTMLElement) =>
  element.scrollTop > 0 && element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
/** Mọi lần code tự cuộn đều qua đây để khoá 150ms (smooth thì lâu hơn): sự kiện scroll do code gây ra không bị tính là người dùng cuộn. */
function scrollPreviewTo(top: number, smooth = false) {
  top = Math.min(Math.max(0, preview.scrollHeight - preview.clientHeight), Math.max(0, top));
  if (Math.abs(preview.scrollTop - top) < 1) return;
  lockScroll('preview', smooth ? 700 : 150);
  if (smooth) preview.scrollTo({ top, behavior: 'smooth' });
  else preview.scrollTop = top;
}
const editorPadding = () => editor.documentPadding.top;
/** Dòng (0-based, có phần lẻ) ở đỉnh vùng nhìn của editor. */
function editorTopLine() {
  const y = Math.max(0, editor.scrollDOM.scrollTop - editorPadding());
  const block = editor.lineBlockAtHeight(y);
  return (
    editor.state.doc.lineAt(block.from).number -
    1 +
    (block.height ? Math.min(1, (y - block.top) / block.height) : 0)
  );
}
function scrollEditorToLine(line: number) {
  const doc = editor.state.doc;
  const index = Math.min(doc.lines - 1, Math.max(0, Math.floor(line)));
  const block = editor.lineBlockAt(doc.line(index + 1).from);
  lockScroll('editor');
  editor.scrollDOM.scrollTop = block.top + (line - index) * block.height + editorPadding();
}
function queueSync(side: SyncSide) {
  syncSide = side;
  syncFrame ||= requestAnimationFrame(syncNow);
}
function syncNow() {
  syncFrame = 0;
  const side = syncSide;
  syncSide = undefined;
  if (!side || syncMode === 'off' || anchors.length < 2) return;
  if (side === 'editor') {
    viewLine = editorTopLine();
    scrollPreviewTo(atEnd(editor.scrollDOM) ? preview.scrollHeight : lineToTop(anchors, viewLine));
  } else if (atEnd(preview)) {
    lockScroll('editor');
    editor.scrollDOM.scrollTop = editor.scrollDOM.scrollHeight;
  } else scrollEditorToLine(topToLine(anchors, preview.scrollTop));
}
preview.addEventListener(
  'scroll',
  () => {
    viewLine = topToLine(anchors, preview.scrollTop);
    if (syncMode !== 'off' && !isLocked('preview')) queueSync('preview');
  },
  { passive: true },
);

/** Dựng lại bảng mốc {dòng nguồn, top trong preview} rồi đưa preview về đúng dòng neo. Gọi sau render và mỗi khi layout đổi. */
function scheduleLayout() {
  layoutFrame ||= requestAnimationFrame(layoutNow);
}
function layoutNow() {
  layoutFrame = 0;
  const elements = [...preview.querySelectorAll<HTMLElement>(':scope > [data-line]')];
  const origin = preview.getBoundingClientRect().top - preview.scrollTop;
  previewBlocks = elements.map((el) => {
    const box = el.getBoundingClientRect();
    return {
      el,
      line: Number(el.dataset.line),
      end: Number(el.dataset.end),
      top: box.top - origin,
      bottom: box.bottom - origin,
    };
  });
  anchors = normalizeAnchors(
    previewBlocks.flatMap((block) => [
      { line: block.line, top: block.top },
      { line: block.end, top: block.bottom },
    ]),
    editor.state.doc.lines,
    preview.scrollHeight,
  );
  layoutObserver ??= new ResizeObserver(scheduleLayout);
  for (const el of elements)
    if (!observedBlocks.has(el)) {
      observedBlocks.add(el);
      layoutObserver.observe(el);
    }
  if (cursorBlockLine !== undefined)
    previewBlocks.find((block) => block.line === cursorBlockLine)?.el.classList.add('is-cursor-block');
  if (!isLocked('preview')) scrollPreviewTo(lineToTop(anchors, viewLine));
}
new ResizeObserver(scheduleLayout).observe(preview);
preview.addEventListener(
  'load',
  (event) => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.naturalWidth) {
      imageSizes.set(image.getAttribute('src') ?? '', { w: image.naturalWidth, h: image.naturalHeight });
      scheduleLayout();
    }
  },
  true,
);
/** Sửa nội dung phía trên khối neo thì dời dòng neo theo, để preview không trượt sang nội dung khác. */
function shiftViewLine(update: ViewUpdate) {
  const before = update.startState.doc;
  const index = Math.min(before.lines - 1, Math.max(0, Math.floor(viewLine)));
  viewLine =
    update.state.doc.lineAt(update.changes.mapPos(before.line(index + 1).from, 1)).number -
    1 +
    (viewLine - index);
}

function markCursorBlock(el: HTMLElement) {
  preview
    .querySelectorAll('.is-cursor-block')
    .forEach((old) => old !== el && old.classList.remove('is-cursor-block'));
  el.classList.add('is-cursor-block');
  cursorBlockLine = Number(el.dataset.line);
  clearTimeout(cursorBlockTimer);
  cursorBlockTimer = setTimeout(() => {
    cursorBlockLine = undefined;
    preview.querySelector('.is-cursor-block')?.classList.remove('is-cursor-block');
  }, 1200);
}
function scheduleFollow() {
  if (syncMode === 'follow') followFrame ||= requestAnimationFrame(followCursor);
}
function followCursor() {
  followFrame = 0;
  if (syncMode !== 'follow') return;
  const line = editor.state.doc.lineAt(editor.state.selection.main.head).number - 1;
  let block: PreviewBlock | undefined;
  for (const candidate of previewBlocks) {
    if (candidate.line > line) break;
    block = candidate;
  }
  if (!block) return;
  markCursorBlock(block.el);
  if (skipFollow) {
    skipFollow = false;
    return;
  }
  const height = preview.clientHeight;
  const small = block.bottom - block.top <= height * 0.6;
  const first = small ? block.top : lineToTop(anchors, line);
  const last = small ? block.bottom : lineToTop(anchors, line + 1);
  if (first - preview.scrollTop < height * 0.2 || last - preview.scrollTop > height * 0.8)
    scrollPreviewTo(first - height / 3, true);
}
preview.addEventListener('dblclick', (event) => {
  const block = (event.target as Element).closest<HTMLElement>('[data-line]');
  if (!block) return;
  const pos = editor.state.doc.line(Math.min(editor.state.doc.lines, Number(block.dataset.line) + 1)).from;
  getSelection()?.removeAllRanges();
  skipFollow = syncMode === 'follow';
  lockScroll('editor', 400);
  editor.focus();
  editor.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 24 }),
  });
});

assetsInput.addEventListener('change', () => {
  if (assetsInput.files) addFiles(assetsInput.files);
  assetsInput.value = '';
});
$('[data-assets-add]').addEventListener('click', () => assetsInput.click());
function setAssetsOpen(open: boolean) {
  assetsDrawer.hidden = !open;
  assetsToggle.setAttribute('aria-expanded', String(open));
  assetsToggle.setAttribute('aria-label', open ? 'Đóng kho tệp' : 'Mở kho tệp');
  try {
    localStorage.setItem(assetsOpenKey, String(open));
  } catch {
    /* storage unavailable */
  }
}
assetsToggle.addEventListener('click', () => setAssetsOpen(Boolean(assetsDrawer.hidden)));
unusedOnly.addEventListener('change', updateUsage);
try {
  if (localStorage.getItem(assetsOpenKey) === 'true') setAssetsOpen(true);
} catch {
  /* storage unavailable */
}
// Kéo file từ hệ điều hành vào bất kỳ đâu trên source pane: overlay "Thả để thêm". Đếm enter/leave để overlay không chớp khi con trỏ đi qua phần tử con.
const sourcePane = $('.source-pane');
const dropOverlay = $('[data-drop-overlay]');
let dragDepth = 0;
const hasFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes('Files');
const endFileDrag = () => {
  dragDepth = 0;
  dropOverlay.hidden = true;
};
sourcePane.addEventListener('dragenter', (event) => {
  if (hasFiles(event)) {
    event.preventDefault();
    dragDepth++;
    dropOverlay.hidden = false;
  }
});
sourcePane.addEventListener('dragover', (event) => {
  if (hasFiles(event)) {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
  }
});
sourcePane.addEventListener('dragleave', (event) => {
  if (hasFiles(event) && --dragDepth <= 0) endFileDrag();
});
sourcePane.addEventListener('drop', (event) => {
  const handledByEditor = event.defaultPrevented;
  endFileDrag();
  if (!hasFiles(event)) return;
  event.preventDefault();
  if (!handledByEditor && event.dataTransfer?.files.length) addFiles(event.dataTransfer.files);
});
window.addEventListener('dragend', endFileDrag);
window.addEventListener('drop', endFileDrag);
initEditor();
editor.scrollDOM.addEventListener(
  'scroll',
  () => {
    if (
      syncMode === 'off' ||
      isLocked('editor') ||
      (syncMode === 'follow' && performance.now() - cursorMovedAt < 250)
    )
      return;
    queueSync('editor');
  },
  { passive: true },
);
if (localStorage.getItem('ctf-wu.studio-sidebar-collapsed') === 'true')
  document.querySelector('.studio')!.setAttribute('data-sidebar-collapsed', '');
// npm run dev: mỗi khi file trong src/content/posts đổi (Studio ghi nháp, git pull sau Publish), Astro gửi full-reload không có
// triggeredBy tới mọi trang -> Studio tải lại giữa chừng, mất bài đang soạn. Đổi path sang trang .html khác để Vite bỏ qua;
// reload do sửa code phía client (có triggeredBy) vẫn giữ.
import.meta.hot?.on('vite:beforeFullReload', (payload: { path?: string; triggeredBy?: string }) => {
  if (!payload.triggeredBy && (payload.path === undefined || payload.path === '*'))
    payload.path = '/__studio-keep-open.html';
});
resetEditor();
void probeLocalStudio().then((local) => {
  localMode = local;
  loadConfig();
});
