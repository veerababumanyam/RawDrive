import type { SavedGalleryMeta } from "./types";

const DB_NAME = "rawdrive-offline";
const DB_VERSION = 1;
const STORE = "galleries";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "slug" });
        store.createIndex("byLastViewed", "lastViewedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function saveGalleryMeta(meta: SavedGalleryMeta): Promise<void> {
  await tx("readwrite", (s) => s.put(meta));
}

export async function getGalleryMeta(slug: string): Promise<SavedGalleryMeta | null> {
  const r = await tx<SavedGalleryMeta | undefined>("readonly", (s) => s.get(slug));
  return r ?? null;
}

export async function listSaved(): Promise<SavedGalleryMeta[]> {
  return (await tx<SavedGalleryMeta[]>("readonly", (s) => s.getAll())) ?? [];
}

export async function removeGallery(slug: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(slug));
}

export async function markValidated(slug: string, etag: string | null, at: number): Promise<void> {
  const meta = await getGalleryMeta(slug);
  if (!meta) return;
  await saveGalleryMeta({ ...meta, etag, lastValidatedAt: at });
}

export async function touchViewed(slug: string, at: number): Promise<void> {
  const meta = await getGalleryMeta(slug);
  if (!meta) return;
  await saveGalleryMeta({ ...meta, lastViewedAt: at });
}
