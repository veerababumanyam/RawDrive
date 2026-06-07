"use client";

import {
  listGalleryMediaKeys,
  upsertGalleryMediaKey,
} from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";
import {
  galleryIdFromMediaKeyId,
  getStoredExportedMediaKey,
  getOrCreateGalleryMediaKey,
  rememberGalleryMediaKey,
  versionedGalleryKeyId,
  type GalleryMediaKey,
} from "./media-key-store";

const inflightHydration = new Map<string, Promise<boolean>>();
const inflightSync = new Map<string, Promise<void>>();
const syncedKeys = new Set<string>();

function canUseOwnerMediaKeyAPI(): boolean {
  return Boolean(getStoredAccessToken());
}

export async function getOrCreateSyncedGalleryMediaKey(
  galleryId: string,
): Promise<GalleryMediaKey> {
  const key = await getOrCreateGalleryMediaKey(galleryId);
  await syncGalleryMediaKey(galleryId, key);
  return key;
}

export async function syncGalleryMediaKey(
  galleryId: string,
  key: Pick<GalleryMediaKey, "keyId" | "exportedKey">,
): Promise<void> {
  if (!galleryId || !canUseOwnerMediaKeyAPI()) return;
  const syncKey = `${galleryId}:${key.keyId}`;
  if (syncedKeys.has(syncKey)) return;
  const existing = inflightSync.get(syncKey);
  if (existing) return existing;

  const promise = upsertGalleryMediaKey(galleryId, {
    key_id: key.keyId,
    exported_key: key.exportedKey,
  })
    .then(() => {
      syncedKeys.add(syncKey);
    })
    .finally(() => {
      inflightSync.delete(syncKey);
    });
  inflightSync.set(syncKey, promise);
  return promise;
}

export function syncGalleryMediaKeyBestEffort(
  galleryId: string,
  key: Pick<GalleryMediaKey, "keyId" | "exportedKey">,
): void {
  void syncGalleryMediaKey(galleryId, key).catch(() => undefined);
}

export async function syncStoredGalleryMediaKeyForKeyId(
  keyId: string,
): Promise<boolean> {
  const galleryId = galleryIdFromMediaKeyId(keyId);
  if (!galleryId) return false;
  const exportedKey = getStoredExportedMediaKey(keyId);
  if (!exportedKey) return false;
  await syncGalleryMediaKey(galleryId, {
    keyId: await versionedGalleryKeyId(galleryId, exportedKey),
    exportedKey,
  });
  return true;
}

export async function hydrateOwnerGalleryMediaKeys(
  galleryId: string,
): Promise<boolean> {
  if (!galleryId || !canUseOwnerMediaKeyAPI()) return false;
  const existing = inflightHydration.get(galleryId);
  if (existing) return existing;

  const promise = (async () => {
    const records = await listGalleryMediaKeys(galleryId);
    let restored = false;
    for (const record of records) {
      if (!record.key_id || !record.exported_key) continue;
      try {
        await rememberGalleryMediaKey(galleryId, record.exported_key);
        restored = true;
      } catch {
        // Ignore malformed legacy rows; another stored key may still decrypt.
      }
    }
    return restored;
  })().finally(() => {
    inflightHydration.delete(galleryId);
  });
  inflightHydration.set(galleryId, promise);
  return promise;
}

export async function hydrateOwnerGalleryMediaKeyIds(
  keyIds: readonly string[],
): Promise<boolean> {
  const galleryIds = Array.from(
    new Set(
      keyIds
        .map((keyId) => galleryIdFromMediaKeyId(keyId))
        .filter((galleryId): galleryId is string => Boolean(galleryId)),
    ),
  );
  if (galleryIds.length === 0) return false;
  const results = await Promise.all(
    galleryIds.map((galleryId) =>
      hydrateOwnerGalleryMediaKeys(galleryId).catch(() => false),
    ),
  );
  return results.some(Boolean);
}
