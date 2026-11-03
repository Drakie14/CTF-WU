/** Kho local của Studio; chỉ báo thành công khi transaction đã commit. */
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ctf-wu-studio-local', 2);
    request.onupgradeneeded = () => {
      for (const store of ['handles', 'draft-assets'])
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Đóng các tab Studio khác để nâng cấp kho nháp.'));
  });
}
async function transaction<T>(
  table: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(table, mode);
      const request = run(tx.objectStore(table));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Không lưu được dữ liệu Studio.'));
    });
  } finally {
    db.close();
  }
}
export const getStored = <T>(table: string, key: string) =>
  transaction<T | undefined>(table, 'readonly', (store) => store.get(key));
export const putStored = (table: string, key: string, value: unknown) =>
  transaction(table, 'readwrite', (store) => store.put(value, key));
export const removeStored = (table: string, key: string) =>
  transaction(table, 'readwrite', (store) => store.delete(key));
export type StoredAsset = { name: string; file: File };
export const putDraftAssets = (key: string, list: StoredAsset[]) =>
  list.length ? putStored('draft-assets', key, list) : removeStored('draft-assets', key);
export const getDraftAssets = async (key: string) =>
  (await getStored<StoredAsset[]>('draft-assets', key)) ?? [];
