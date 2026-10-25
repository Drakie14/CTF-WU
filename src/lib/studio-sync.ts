/** Quyết định đồng bộ bài giữa file local và GitHub từ 3 hash; I/O (File System Access, localStorage) nằm ở studio.astro. */
export type ReconcileAction = 'in-sync' | 'use-remote' | 'use-local-unpublished' | 'conflict';

/** `baseline` là hash lần đồng bộ gần nhất (undefined nếu chưa có), thiếu baseline thì không phân biệt được bên nào đổi nên coi là conflict. */
export function reconcileAction(baseline: string | undefined, localHash: string, remoteHash: string): ReconcileAction {
  if (localHash === remoteHash) return 'in-sync';
  if (baseline && localHash === baseline) return 'use-remote';
  if (baseline && remoteHash === baseline) return 'use-local-unpublished';
  return 'conflict';
}
