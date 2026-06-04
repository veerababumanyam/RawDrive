import {
  decryptBlob,
  exportRawMediaKey,
  generateRawMediaKey,
  importRawMediaKey,
  readGalleryKeyFromHash,
  type MediaEncryptionManifest,
} from "./media-crypto";

const KEY_PREFIX = "rawdrive:media-key:";
const ACTIVE_KEY_PREFIX = "rawdrive:media-key-active:";
const VERSION_FINGERPRINT_BYTES = 8;
export const MEDIA_KEY_UNAVAILABLE_MESSAGE = "Photo key unavailable. Reopen with the gallery key or reupload this photo.";
export const MEDIA_KEY_MISMATCH_MESSAGE = "Photo key does not match this encrypted file.";

const memoryKeys = new Map<string, string>();
const memoryActiveKeys = new Map<string, string>();

export type GalleryMediaKey = {
  keyId: string;
  key: CryptoKey;
  exportedKey: string;
};

export async function getOrCreateGalleryMediaKey(galleryId: string): Promise<GalleryMediaKey> {
  const baseKeyId = galleryKeyId(galleryId);

  const fragmentKey = typeof window !== "undefined"
    ? readGalleryKeyFromHash(window.location.hash)
    : null;
  if (fragmentKey) {
    return rememberGalleryMediaKey(galleryId, fragmentKey);
  }

  const activeKeyId = readActiveKeyId(baseKeyId);
  const activeKey = activeKeyId ? readStoredKey(activeKeyId) : null;
  if (activeKeyId && activeKey) {
    return { keyId: activeKeyId, key: await importRawMediaKey(activeKey), exportedKey: activeKey };
  }

  const legacyKey = readStoredKey(baseKeyId);
  if (legacyKey) {
    return rememberGalleryMediaKey(galleryId, legacyKey);
  }

  const key = await generateRawMediaKey();
  const exportedKey = await exportRawMediaKey(key);
  const keyId = await versionedGalleryKeyId(galleryId, exportedKey);
  writeStoredKey(keyId, exportedKey);
  writeActiveKeyId(baseKeyId, keyId);
  return { keyId, key, exportedKey };
}

export async function getMediaKeyForKeyId(keyId: string): Promise<CryptoKey | null> {
  const keys = await getMediaKeysForKeyId(keyId);
  return keys[0] ?? null;
}

export async function getMediaKeysForKeyId(keyId: string): Promise<CryptoKey[]> {
  const exportedKeys = await getExportedKeysForKeyId(keyId);
  const keys: CryptoKey[] = [];
  for (const exported of exportedKeys) {
    try {
      keys.push(await importRawMediaKey(exported));
    } catch {
      // Ignore malformed local entries; another candidate may still decrypt.
    }
  }
  return keys;
}

export async function decryptBlobWithAvailableMediaKeys(
  ciphertext: Blob,
  manifest: MediaEncryptionManifest,
): Promise<Blob> {
  const keys = await getMediaKeysForKeyId(manifest.key_id);
  if (keys.length === 0) {
    throw new Error(MEDIA_KEY_UNAVAILABLE_MESSAGE);
  }

  for (const key of keys) {
    try {
      return await decryptBlob(ciphertext, manifest, key);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message === "ENCRYPTED_MEDIA_HASH_MISMATCH" ||
          err.message === "ENCRYPTED_MEDIA_SIZE_MISMATCH" ||
          err.message.startsWith("UNSUPPORTED_MEDIA_ENCRYPTION_"))
      ) {
        throw err;
      }
    }
  }

  throw new Error(MEDIA_KEY_MISMATCH_MESSAGE);
}

export async function rememberGalleryMediaKey(
  galleryId: string,
  exportedKey: string,
): Promise<GalleryMediaKey> {
  const baseKeyId = galleryKeyId(galleryId);
  const keyId = await versionedGalleryKeyId(galleryId, exportedKey);
  writeStoredKey(keyId, exportedKey);
  writeActiveKeyId(baseKeyId, keyId);
  return { keyId, key: await importRawMediaKey(exportedKey), exportedKey };
}

async function getExportedKeysForKeyId(keyId: string): Promise<string[]> {
  const out: string[] = [];
  const add = (value: string | null) => {
    if (value && !out.includes(value)) out.push(value);
  };
  const galleryId = galleryIdFromKeyId(keyId);
  const requestedVersionedKey = isVersionedGalleryKeyId(keyId);
  const addIfMatchesRequestedVersion = async (value: string | null) => {
    if (!value) return;
    if (!galleryId || !requestedVersionedKey) {
      add(value);
      return;
    }
    const candidateKeyId = await versionedGalleryKeyId(galleryId, value);
    if (candidateKeyId === keyId) add(value);
  };

  add(readStoredKey(keyId));
  if (typeof window !== "undefined") {
    const fragmentKey = readGalleryKeyFromHash(window.location.hash);
    if (fragmentKey) {
      await addIfMatchesRequestedVersion(fragmentKey);
      if (galleryId && (!requestedVersionedKey || await versionedGalleryKeyId(galleryId, fragmentKey) === keyId)) {
        await rememberGalleryMediaKey(galleryId, fragmentKey);
      }
    }
  }

  const baseKeyId = galleryBaseKeyId(keyId);
  if (baseKeyId) {
    const activeKeyId = readActiveKeyId(baseKeyId);
    if (activeKeyId && activeKeyId !== keyId) await addIfMatchesRequestedVersion(readStoredKey(activeKeyId));
    if (baseKeyId !== keyId) await addIfMatchesRequestedVersion(readStoredKey(baseKeyId));
    for (const candidateKeyId of storedMediaKeyIds()) {
      if (candidateKeyId === baseKeyId || candidateKeyId.startsWith(`${baseKeyId}:`)) {
        await addIfMatchesRequestedVersion(readStoredKey(candidateKeyId));
      }
    }
  }

  return out;
}

export function getStoredExportedMediaKey(keyId: string): string | null {
  const baseKeyId = galleryBaseKeyId(keyId);
  if (baseKeyId && baseKeyId === keyId) {
    const activeKeyId = readActiveKeyId(baseKeyId);
    if (activeKeyId) {
      const active = readStoredKey(activeKeyId);
      if (active) return active;
    }
  }
  return readStoredKey(keyId);
}

export function galleryKeyId(galleryId: string): string {
  return `gallery:${galleryId}`;
}

export async function versionedGalleryKeyId(galleryId: string, exportedKey: string): Promise<string> {
  const fingerprint = await keyFingerprint(exportedKey);
  return `${galleryKeyId(galleryId)}:${fingerprint}`;
}

function storageKey(keyId: string): string {
  return `${KEY_PREFIX}${keyId}`;
}

function activeStorageKey(baseKeyId: string): string {
  return `${ACTIVE_KEY_PREFIX}${baseKeyId}`;
}

function readStoredKey(keyId: string): string | null {
  const memory = memoryKeys.get(keyId);
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey(keyId));
    if (stored) memoryKeys.set(keyId, stored);
    return stored;
  } catch {
    return null;
  }
}

function writeStoredKey(keyId: string, exportedKey: string): void {
  memoryKeys.set(keyId, exportedKey);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(keyId), exportedKey);
  } catch {
    // Private browsing or locked-down clients may reject localStorage. The
    // in-memory CryptoKey returned to the caller still works for this session.
  }
}

function readActiveKeyId(baseKeyId: string): string | null {
  const memory = memoryActiveKeys.get(baseKeyId);
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(activeStorageKey(baseKeyId));
    if (stored) memoryActiveKeys.set(baseKeyId, stored);
    return stored;
  } catch {
    return null;
  }
}

function writeActiveKeyId(baseKeyId: string, keyId: string): void {
  memoryActiveKeys.set(baseKeyId, keyId);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(activeStorageKey(baseKeyId), keyId);
  } catch {
    // In-memory active key is enough for the current browser session.
  }
}

function storedMediaKeyIds(): string[] {
  const ids = new Set<string>(memoryKeys.keys());
  if (typeof window !== "undefined") {
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(KEY_PREFIX)) ids.add(key.slice(KEY_PREFIX.length));
      }
    } catch {
      // Storage may be blocked; memory keys above are still usable.
    }
  }
  return Array.from(ids);
}

function galleryBaseKeyId(keyId: string): string | null {
  const galleryId = galleryIdFromKeyId(keyId);
  return galleryId ? galleryKeyId(galleryId) : null;
}

function galleryIdFromKeyId(keyId: string): string | null {
  const parts = keyId.split(":");
  if (parts[0] !== "gallery" || !parts[1]) return null;
  return parts[1];
}

function isVersionedGalleryKeyId(keyId: string): boolean {
  const parts = keyId.split(":");
  return parts.length === 3 && parts[0] === "gallery" && Boolean(parts[1]) && /^[a-f0-9]{16}$/.test(parts[2]);
}

async function keyFingerprint(exportedKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(exportedKey);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, VERSION_FINGERPRINT_BYTES), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
