import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatDisplayDate, formatIsoDate, parseSiteDate } from '../../src/lib/content/dates';
import { getGitFirstCommitDates, pathKey } from '../../src/lib/content/git-dates';

describe('dates in Asia/Ho_Chi_Minh (66.5-F, 16)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    // Máy build ở múi giờ khác (UTC-7/-8) không được làm lệch ngày.
    process.env.TZ = 'America/Los_Angeles';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('date: 2026-09-25 displays as 25/09/2026', () => {
    const d = parseSiteDate('2026-09-25')!;
    expect(d.toISOString()).toBe('2026-09-24T17:00:00.000Z');
    expect(formatDisplayDate(d)).toBe('25/09/2026');
    expect(formatIsoDate(d)).toBe('2026-09-25');
    expect(new Date(d).getDate()).not.toBe(25); // chứng minh TZ máy khác thật sự
  });

  it('late-evening local times keep the same day', () => {
    expect(formatDisplayDate(parseSiteDate('2026-09-25 23:59')!)).toBe('25/09/2026');
    expect(formatDisplayDate(parseSiteDate('2026-09-25T00:00:00')!)).toBe('25/09/2026');
  });

  it('respects explicit time zones', () => {
    expect(parseSiteDate('2026-09-25T20:00:00Z')!.toISOString()).toBe('2026-09-25T20:00:00.000Z');
    expect(formatDisplayDate(parseSiteDate('2026-09-25T20:00:00Z')!)).toBe('26/09/2026');
  });

  it('accepts dd/mm/yyyy and Date objects', () => {
    expect(formatIsoDate(parseSiteDate('25/09/2026')!)).toBe('2026-09-25');
    expect(formatIsoDate(parseSiteDate(new Date('2026-09-25T00:00:00Z'))!)).toBe('2026-09-25');
  });

  it('rejects invalid dates', () => {
    for (const v of ['2026-02-30', 'hello', '', 123, null, '2026-13-01']) {
      expect(parseSiteDate(v)).toBeNull();
    }
  });
});

describe('git first-commit dates', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'ctf-git-date-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, stdio: 'ignore' });
    git('init', '-q');
    mkdirSync(path.join(dir, 'posts', 'Giải CTF'), { recursive: true });
    writeFileSync(path.join(dir, 'posts', 'a.md'), 'a');
    git('add', '.');
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'a'], {
      cwd: dir,
      stdio: 'ignore',
      env: { ...process.env, GIT_AUTHOR_DATE: '2024-01-01T10:00:00+07:00', GIT_COMMITTER_DATE: '2024-01-01T10:00:00+07:00' },
    });
    writeFileSync(path.join(dir, 'posts', 'a.md'), 'a2');
    writeFileSync(path.join(dir, 'posts', 'Giải CTF', 'b.md'), 'b');
    git('add', '.');
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'b'], {
      cwd: dir,
      stdio: 'ignore',
      env: { ...process.env, GIT_AUTHOR_DATE: '2025-06-15T10:00:00+07:00', GIT_COMMITTER_DATE: '2025-06-15T10:00:00+07:00' },
    });
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the first commit date of each file', () => {
    const dates = getGitFirstCommitDates(path.join(dir, 'posts'));
    expect(dates.get(pathKey(path.join(dir, 'posts', 'a.md')))?.toISOString()).toBe('2024-01-01T03:00:00.000Z');
    expect(dates.get(pathKey(path.join(dir, 'posts', 'Giải CTF', 'b.md')))?.toISOString()).toBe('2025-06-15T03:00:00.000Z');
  });

  it('returns an empty map outside a git repo', () => {
    const outside = mkdtempSync(path.join(os.tmpdir(), 'ctf-no-git-'));
    try {
      expect(getGitFirstCommitDates(outside).size).toBe(0);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
