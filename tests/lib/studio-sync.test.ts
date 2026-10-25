import { describe, expect, it } from 'vitest';
import { reconcileAction } from '../../src/lib/studio-sync';

describe('reconcileAction', () => {
  it('local và remote giống nhau thì in-sync, kể cả khi chưa có baseline', () => {
    expect(reconcileAction('a', 'b', 'b')).toBe('in-sync');
    expect(reconcileAction(undefined, 'b', 'b')).toBe('in-sync');
  });

  it('local chưa đổi so với baseline, remote đã đổi thì lấy remote', () => {
    expect(reconcileAction('a', 'a', 'b')).toBe('use-remote');
  });

  it('remote chưa đổi so với baseline, local đã đổi thì giữ local chưa publish', () => {
    expect(reconcileAction('a', 'b', 'a')).toBe('use-local-unpublished');
  });

  it('cả hai cùng đổi thì conflict', () => {
    expect(reconcileAction('a', 'b', 'c')).toBe('conflict');
  });

  it('chưa có baseline mà hai bên khác nhau thì conflict', () => {
    expect(reconcileAction(undefined, 'b', 'c')).toBe('conflict');
  });
});
