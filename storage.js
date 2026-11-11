/** Fila persistente local: nenhum registro é removido antes do envio confirmado. */
const DATABASE = 'vistoria_onedrive_backup_v1';
const STORE = 'pending';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB indisponível neste navegador.'));
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'queueId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Falha no IndexedDB'));
  });
}

async function transaction(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const req = operation(tx.objectStore(STORE));
      let value;
      req.onsuccess = () => { value = req.result; };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao salvar fila local'));
      tx.onabort = () => reject(tx.error ?? new Error('Operação local cancelada'));
    });
  } finally {
    database.close();
  }
}

export function addPending(entry) { return transaction('readwrite', store => store.put(entry)); }
export function listPending() { return transaction('readonly', store => store.getAll()); }
export function removePending(queueId) { return transaction('readwrite', store => store.delete(queueId)); }
export async function countPending() { return (await listPending()).length; }
