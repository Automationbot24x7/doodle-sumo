// Fighters the visitor forged from their own doodles live in this browser only (IndexedDB).
const DB = 'doodle-sumo', STORE = 'fighters';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export const listCustom = () => tx('readonly', (s) => s.getAll()).catch(() => []);
export const saveCustom = (rec) => tx('readwrite', (s) => s.put(rec));
export const deleteCustom = (id) => tx('readwrite', (s) => s.delete(id));
