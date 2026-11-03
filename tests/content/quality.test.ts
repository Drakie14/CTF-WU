import { expect, it } from 'vitest';
import { checkMetadata } from '../../src/lib/content/quality';
it('phát hiện sai CTF và hệ difficulty cũ', () => {
  const issues = checkMetadata(
    '---\ntitle: X\nctf: Bronze\ndifficulty: easy\n---\n',
    'Dreamhack/Extra/Bronze',
  );
  expect(issues.map((i) => i.field)).toEqual(expect.arrayContaining(['ctf', 'difficulty']));
});
it('không đánh giá văn phong, flag hoặc phần sau flag', () => {
  const issues = checkMetadata(
    '---\ntitle: X\nctf: Dreamhack\n---\nTôi thử.\n-> Flag: `DH{testflag}`\n\nNhận xét của mình.',
    'Dreamhack',
  );
  expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
});
