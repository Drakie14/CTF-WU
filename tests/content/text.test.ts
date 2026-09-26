import { describe, expect, it } from 'vitest';
import { readingTimeMinutes, truncate } from '../../src/lib/content/text';

describe('text helpers', () => {
  it('truncates on a word boundary', () => {
    const s = truncate('word '.repeat(100).trim(), 50);
    expect(s.length).toBeLessThanOrEqual(50);
    expect(s.endsWith('…')).toBe(true);
    expect(truncate('short', 50)).toBe('short');
  });
  it('computes reading time ≥ 1', () => {
    expect(readingTimeMinutes('short')).toBe(1);
    expect(readingTimeMinutes('word '.repeat(1000))).toBe(5);
  });
});
