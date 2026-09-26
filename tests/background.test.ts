import { describe, expect, it } from 'vitest';
import { generateLowPolySvg } from '../src/lib/background';

describe('low-poly background', () => {
  it('is deterministic, small and self-contained', () => {
    const a = generateLowPolySvg();
    expect(a).toBe(generateLowPolySvg());
    expect(a.startsWith('<svg')).toBe(true);
    expect(a.length).toBeLessThan(40_000);
    expect(a).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect((a.match(/<path/g) ?? []).length).toBe(14 * 9 * 2);
  });
});
