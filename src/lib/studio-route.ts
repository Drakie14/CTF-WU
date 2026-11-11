export const STUDIO_BASE = '/admin/studio/';

export type StudioRoute =
  | { kind: 'library'; folder: string }
  | { kind: 'new'; folder: string }
  | { kind: 'post'; path: string };

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export function studioRouteUrl(route: StudioRoute): string {
  if (route.kind === 'library') return route.folder ? `${STUDIO_BASE}folder/${encodePath(route.folder)}/` : STUDIO_BASE;
  if (route.kind === 'new') return `${STUDIO_BASE}new/${route.folder ? `${encodePath(route.folder)}/` : ''}`;
  return `${STUDIO_BASE}post/${encodePath(route.path)}/`;
}

export function parseStudioRoute(pathname: string): StudioRoute | undefined {
  if (pathname === STUDIO_BASE || pathname === STUDIO_BASE.slice(0, -1)) return { kind: 'library', folder: '' };
  if (!pathname.startsWith(STUDIO_BASE)) return;
  const [kind, ...parts] = pathname.slice(STUDIO_BASE.length).replace(/\/$/, '').split('/');
  if (!['folder', 'new', 'post'].includes(kind)) return;
  try {
    const decoded = parts.map(decodeURIComponent);
    if (decoded.some((part) => !part || part === '.' || part === '..' || /[\\/\u0000-\u001f]/.test(part))) return;
    const path = decoded.join('/');
    if (kind === 'post') return /\.md$/i.test(path) ? { kind: 'post', path } : undefined;
    return { kind: kind === 'folder' ? 'library' : 'new', folder: path };
  } catch {
    return;
  }
}

/** Cùng một trang Studio phục vụ các URL con, kể cả folder/bài vừa tạo chưa build. */
export function studioPagePath(pathname: string): string | undefined {
  if (/^\/admin\/studio\/(?:folder|post|new)(?:\/|$)/.test(pathname)) return STUDIO_BASE;
}
