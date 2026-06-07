import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hydrateOwnerGalleryMediaKeys,
  getOrCreateSyncedGalleryMediaKey,
  syncStoredGalleryMediaKeyForKeyId,
} from "../gallery-media-key-sync";
import {
  galleryKeyId,
  getStoredExportedMediaKey,
  rememberGalleryMediaKey,
  versionedGalleryKeyId,
} from "../media-key-store";
import { exportRawMediaKey, generateRawMediaKey } from "../media-crypto";
import { clearAuthTokens, persistAuthTokens } from "@/lib/auth";

const apiMocks = vi.hoisted(() => ({
  listGalleryMediaKeys: vi.fn(),
  upsertGalleryMediaKey: vi.fn(),
}));

vi.mock("@/lib/api/galleries", () => ({
  listGalleryMediaKeys: apiMocks.listGalleryMediaKeys,
  upsertGalleryMediaKey: apiMocks.upsertGalleryMediaKey,
}));

describe("gallery media key owner sync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/galleries/gallery-sync-test");
    persistAuthTokens("owner-token");
    apiMocks.listGalleryMediaKeys.mockReset();
    apiMocks.upsertGalleryMediaKey.mockReset();
  });

  afterEach(() => {
    clearAuthTokens();
  });

  it("syncs generated upload keys to the owner gallery media-key API", async () => {
    apiMocks.upsertGalleryMediaKey.mockResolvedValue({});

    const key = await getOrCreateSyncedGalleryMediaKey("gallery-sync-test");

    expect(apiMocks.upsertGalleryMediaKey).toHaveBeenCalledWith(
      "gallery-sync-test",
      {
        key_id: key.keyId,
        exported_key: key.exportedKey,
      },
    );
  });

  it("hydrates server-synced gallery keys into the browser key store", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    const keyId = await versionedGalleryKeyId("gallery-sync-test", exported);
    apiMocks.listGalleryMediaKeys.mockResolvedValue([
      { key_id: keyId, exported_key: exported },
    ]);

    await expect(
      hydrateOwnerGalleryMediaKeys("gallery-sync-test"),
    ).resolves.toBe(true);

    expect(getStoredExportedMediaKey(galleryKeyId("gallery-sync-test"))).toBe(
      exported,
    );
    expect(apiMocks.listGalleryMediaKeys).toHaveBeenCalledWith(
      "gallery-sync-test",
    );
  });

  it("backfills an existing local gallery key after successful decrypt", async () => {
    apiMocks.upsertGalleryMediaKey.mockResolvedValue({});
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    const remembered = await rememberGalleryMediaKey(
      "gallery-sync-test",
      exported,
    );

    await expect(
      syncStoredGalleryMediaKeyForKeyId(remembered.keyId),
    ).resolves.toBe(true);
    await expect(
      syncStoredGalleryMediaKeyForKeyId(remembered.keyId),
    ).resolves.toBe(true);

    expect(apiMocks.upsertGalleryMediaKey).toHaveBeenCalledWith(
      "gallery-sync-test",
      {
        key_id: remembered.keyId,
        exported_key: exported,
      },
    );
    expect(apiMocks.upsertGalleryMediaKey).toHaveBeenCalledTimes(1);
  });
});
