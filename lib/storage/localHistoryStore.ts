/**
 * Local form history in IndexedDB. Two stores:
 *  - "forms": FormRecord metadata + fields (keyPath: id)
 *  - "files": original/filled binaries keyed by `${formId}:${kind}`
 * Nothing here ever touches the network.
 */
import type { FormRecord } from "../types";

const DB_NAME = "swaram";
const DB_VERSION = 1;
const FORMS = "forms";
const FILES = "files";

export type FileKind = "original" | "filled";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FORMS)) {
        db.createObjectStore(FORMS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FILES)) {
        db.createObjectStore(FILES);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveForm(record: FormRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(FORMS, "readwrite");
  tx.objectStore(FORMS).put({ ...record, updatedAt: Date.now() });
  await txDone(tx);
  db.close();
}

export async function getForm(id: string): Promise<FormRecord | null> {
  const db = await openDb();
  const record = await reqResult<FormRecord | undefined>(
    db.transaction(FORMS).objectStore(FORMS).get(id),
  );
  db.close();
  return record ?? null;
}

export async function listForms(): Promise<FormRecord[]> {
  const db = await openDb();
  const all = await reqResult<FormRecord[]>(
    db.transaction(FORMS).objectStore(FORMS).getAll(),
  );
  db.close();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteForm(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([FORMS, FILES], "readwrite");
  tx.objectStore(FORMS).delete(id);
  tx.objectStore(FILES).delete(`${id}:original`);
  tx.objectStore(FILES).delete(`${id}:filled`);
  await txDone(tx);
  db.close();
}

export async function saveFile(id: string, kind: FileKind, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(FILES, "readwrite");
  tx.objectStore(FILES).put(blob, `${id}:${kind}`);
  await txDone(tx);
  db.close();
}

export async function getFile(id: string, kind: FileKind): Promise<Blob | null> {
  const db = await openDb();
  const blob = await reqResult<Blob | undefined>(
    db.transaction(FILES).objectStore(FILES).get(`${id}:${kind}`),
  );
  db.close();
  return blob ?? null;
}
