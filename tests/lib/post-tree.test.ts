import { describe, expect, it } from 'vitest';
import { branchKeys, buildPostTree, folderSegments } from '../../src/lib/post-tree';

const post = (id: string, sourcePath: string, day: number, ctf = '') => ({
  id,
  data: { sourcePath, ctf, date: new Date(Date.UTC(2026, 9, day)) },
});

const posts = [
  post('carve', 'src/content/posts/Dreamhack/Extra/Bronze/carve-party/index.md', 23, 'Dreamhack'),
  post('absurd', 'src/content/posts/CTF Tournament/CSS CTF/absurd-admin/index.md', 20),
  post('ptml', 'src/content/posts/Dreamhack/Class/C1/PTML/index.md', 21),
  post('xss', 'src/content/posts/PortSwigger/XSS.md', 5),
  post('golf', 'src/content/posts/CTF Tournament/CSAW/golf-heist/index.md', 10),
  post('loose', 'src/content/posts/hello.md', 1),
];

describe('folderSegments', () => {
  it('takes folders after posts/, without the post folder or file', () => {
    expect(folderSegments(posts[0]!)).toEqual(['Dreamhack', 'Extra', 'Bronze']);
    expect(folderSegments(posts[3]!)).toEqual(['PortSwigger']);
    expect(folderSegments(posts[5]!)).toEqual([]);
    expect(folderSegments(post('old', '', 1, 'NNS CTF'))).toEqual(['NNS CTF']);
  });
});

describe('buildPostTree', () => {
  const tree = buildPostTree(posts);

  it('nests by path, newest branch first, loose posts last', () => {
    expect(tree.map((n) => [n.label, n.count])).toEqual([['Dreamhack', 2], ['CTF Tournament', 2], ['PortSwigger', 1], ['Khác', 1]]);
    expect(tree[1]!.children.map((n) => n.label)).toEqual(['CSS CTF', 'CSAW']);
  });

  it('merges single-child folders into one label', () => {
    expect(tree[0]!.children.map((n) => [n.label, n.key])).toEqual([
      ['Extra / Bronze', 'Dreamhack/Extra/Bronze'],
      ['Class / C1', 'Dreamhack/Class/C1'],
    ]);
  });

  it('finds the branch of the current post', () => {
    expect(branchKeys(tree, 'ptml')).toEqual(['Dreamhack', 'Dreamhack/Class/C1']);
    expect(branchKeys(tree, 'nope')).toEqual([]);
  });
});
