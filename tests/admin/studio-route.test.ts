import { describe, expect, it } from 'vitest';
import { parseStudioRoute, studioPagePath, studioRouteUrl, type StudioRoute } from '../../src/lib/studio-route';

describe('Studio URL paths', () => {
  it.each<StudioRoute>([
    { kind: 'library', folder: '' },
    { kind: 'library', folder: 'CTF Tournament/CSCTF 2026' },
    { kind: 'new', folder: 'Giải #1/100% & thử nghiệm' },
    { kind: 'new', folder: '' },
    { kind: 'post', path: 'CTF Tournament/CSCTF 2026/two-key-turn/index.md' },
    { kind: 'post', path: 'PortSwigger/XSS.md' },
  ])('round trips $kind without losing path characters', (route) => {
    const url = studioRouteUrl(route);
    expect(parseStudioRoute(url)).toEqual(route);
    expect(new URL(url, 'https://blog.test').pathname).toBe(url);
  });

  it.each([
    '/admin/studio/post/../secret.md/', '/admin/studio/post/%2Fetc%2Fpasswd.md/',
    '/admin/studio/post/%5Csecret.md/', '/admin/studio/folder/a//b/',
    '/admin/studio/post/%00.md/', '/admin/studio/folder/%invalid/',
    '/admin/studio/post/file.zip/', '/posts/example/', '/admin/studio/unknown/',
  ])('rejects invalid or unrelated URL %s', (path) => {
    expect(parseStudioRoute(path)).toBeUndefined();
  });

  it('rewrites only Studio subroutes, leaving assets, APIs and public 404s alone', () => {
    for (const path of ['/admin/studio/folder/new/', '/admin/studio/new/', '/admin/studio/post/new/index.md/']) {
      expect(studioPagePath(path)).toBe('/admin/studio/');
    }
    for (const path of ['/admin/studio/', '/admin/import/', '/__studio/fs/file', '/_astro/studio.js', '/missing/']) {
      expect(studioPagePath(path)).toBeUndefined();
    }
  });
});
