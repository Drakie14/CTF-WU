import { describe, expect, it } from 'vitest';
import { ctfFromFolder } from '../../src/lib/studio';

describe('ctfFromFolder', () => {
  it('uses the top folder, or the second one under a tournament folder', () => {
    expect(ctfFromFolder('Dreamhack/Extra/Bronze')).toBe('Dreamhack');
    expect(ctfFromFolder('Dreamhack/Class/C1')).toBe('Dreamhack');
    expect(ctfFromFolder('CTF Tournament/CSS CTF')).toBe('CSS CTF');
    expect(ctfFromFolder('CTF Tournament')).toBe('CTF Tournament');
    expect(ctfFromFolder('aochinh26')).toBe('aochinh26');
    expect(ctfFromFolder('')).toBe('');
  });
});
