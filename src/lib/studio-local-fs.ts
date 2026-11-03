/**
 * Thư mục src/content/posts đi qua dev server (/__studio/fs) cho Studio local, thay cho File System Access API.
 * Chỉ cài phần API mà Studio dùng: getDirectoryHandle, getFileHandle, entries, removeEntry, getFile, createWritable,
 * queryPermission/requestPermission (luôn granted). Không được lưu vào IndexedDB (object có hàm, không clone được).
 */

type Kind = 'file' | 'directory';
type CreateOption = { create?: boolean };
interface PostsFile {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
}
interface PostsDirectory {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, options?: CreateOption): Promise<PostsDirectory>;
  getFileHandle(name: string, options?: CreateOption): Promise<PostsFile>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncGenerator<[string, PostsFile | PostsDirectory]>;
  queryPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
}

const join = (base: string, name: string) => (base ? `${base}/${name}` : name);
const endpoint = (route: string, relative: string, extra = '') => `/__studio/fs/${route}?path=${encodeURIComponent(relative)}${extra}`;

async function call(input: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, { cache: 'no-store', ...init, headers: { 'x-studio-sync': '1' } });
  // Cùng loại lỗi với File System Access API để code Studio (bắt NotFoundError) chạy như cũ.
  if (response.status === 404) throw new DOMException(`Không tìm thấy ${decodeURIComponent(input.split('path=')[1] ?? '')}`, 'NotFoundError');
  if (response.status === 409) throw new DOMException(await response.text(), 'TypeMismatchError');
  if (!response.ok) throw new Error(`Dev server ${response.status}: ${await response.text()}`);
  return response;
}

async function kindOf(relative: string): Promise<Kind | undefined> {
  return ((await (await call(endpoint('stat', relative))).json()) as { kind: Kind | null }).kind ?? undefined;
}

function fileHandle(relative: string, name: string): PostsFile {
  return {
    kind: 'file',
    name,
    async getFile(): Promise<File> {
      const blob = await (await call(endpoint('file', relative))).blob();
      return new File([blob], name, { type: blob.type === 'application/octet-stream' ? '' : blob.type });
    },
    async createWritable() {
      const parts: BlobPart[] = [];
      return {
        async write(data: BlobPart) { parts.push(data); },
        async close() { await call(endpoint('file', relative), { method: 'PUT', body: new Blob(parts) }); },
      };
    },
  };
}

function directoryHandle(relative: string, name: string): PostsDirectory {
  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(child: string, options: CreateOption = {}) {
      const target = join(relative, child);
      if (options.create) await call(endpoint('dir', target), { method: 'POST' });
      else {
        const kind = await kindOf(target);
        if (!kind) throw new DOMException(`Không tìm thấy ${target}`, 'NotFoundError');
        if (kind !== 'directory') throw new DOMException(`${target} không phải thư mục`, 'TypeMismatchError');
      }
      return directoryHandle(target, child);
    },
    async getFileHandle(child: string, options: CreateOption = {}) {
      const target = join(relative, child);
      const kind = await kindOf(target);
      if (kind === 'directory') throw new DOMException(`${target} là thư mục`, 'TypeMismatchError');
      if (!kind) {
        if (!options.create) throw new DOMException(`Không tìm thấy ${target}`, 'NotFoundError');
        await call(endpoint('file', target), { method: 'PUT', body: new Blob([]) });
      }
      return fileHandle(target, child);
    },
    async removeEntry(child: string, options: { recursive?: boolean } = {}) {
      await call(endpoint('entry', join(relative, child), options.recursive ? '&recursive=1' : ''), { method: 'DELETE' });
    },
    async *entries(): AsyncGenerator<[string, PostsFile | PostsDirectory]> {
      const list = (await (await call(endpoint('entries', relative))).json()) as Array<{ name: string; kind: Kind }>;
      for (const entry of list) {
        const target = join(relative, entry.name);
        yield [entry.name, entry.kind === 'directory' ? directoryHandle(target, entry.name) : fileHandle(target, entry.name)];
      }
    },
    async queryPermission(): Promise<PermissionState> { return 'granted'; },
    async requestPermission(): Promise<PermissionState> { return 'granted'; },
  };
}

/** Gốc là src/content/posts; đường dẫn con giống handle thật (`Dreamhack/abc/index.md`). */
export const localPostsDirectory = () => directoryHandle('', 'posts');

/** 200 + JSON `{ ok: true }` chỉ có khi Studio chạy qua `npm run dev`; bản deploy trả 404/HTML nên coi như không có. */
export async function probeLocalStudio(): Promise<boolean> {
  try {
    const reply = await fetch('/__studio/local', { cache: 'no-store', headers: { 'x-studio-sync': '1' } });
    if (!reply.ok) return false;
    return ((await reply.json()) as { ok?: unknown }).ok === true;
  } catch { return false; }
}
