import { beforeEach, describe, expect, it } from "vitest";
import { encryptBlob, exportRawMediaKey, generateRawMediaKey } from "../media-crypto";
import {
  decryptBlobWithAvailableMediaKeys,
  galleryKeyId,
  getMediaKeysForKeyId,
  getOrCreateGalleryMediaKey,
  getStoredExportedMediaKey,
  MEDIA_KEY_MISMATCH_MESSAGE,
  MEDIA_KEY_UNAVAILABLE_MESSAGE,
  versionedGalleryKeyId,
} from "../media-key-store";

const KEY_PREFIX = "rawdrive:media-key:";
const ACTIVE_PREFIX = "rawdrive:media-key-active:";

describe("media key store", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/galleries/gallery-test");
  });

  it("upgrades a legacy gallery key into an active versioned key without overwriting legacy storage", async () => {
    const galleryId = "gallery-test";
    const baseKeyId = galleryKeyId(galleryId);
    const legacyKey = await generateRawMediaKey();
    const legacyExport = await exportRawMediaKey(legacyKey);
    window.localStorage.setItem(`${KEY_PREFIX}${baseKeyId}`, legacyExport);

    const mediaKey = await getOrCreateGalleryMediaKey(galleryId);
    const expectedVersionedKeyId = await versionedGalleryKeyId(galleryId, legacyExport);

    expect(mediaKey.keyId).toBe(expectedVersionedKeyId);
    expect(window.localStorage.getItem(`${KEY_PREFIX}${baseKeyId}`)).toBe(legacyExport);
    expect(window.localStorage.getItem(`${KEY_PREFIX}${expectedVersionedKeyId}`)).toBe(legacyExport);
    expect(window.localStorage.getItem(`${ACTIVE_PREFIX}${baseKeyId}`)).toBe(expectedVersionedKeyId);
    expect(getStoredExportedMediaKey(baseKeyId)).toBe(legacyExport);
  });

  it("tries the gallery key ring so legacy assets survive key-id collisions when old keys are still stored", async () => {
    const galleryId = "gallery-test";
    const baseKeyId = galleryKeyId(galleryId);
    const correctKey = await generateRawMediaKey();
    const wrongKey = await generateRawMediaKey();
    const correctExport = await exportRawMediaKey(correctKey);
    const wrongExport = await exportRawMediaKey(wrongKey);
    const correctVersionedKeyId = await versionedGalleryKeyId(galleryId, correctExport);

    window.localStorage.setItem(`${KEY_PREFIX}${baseKeyId}`, wrongExport);
    window.localStorage.setItem(`${KEY_PREFIX}${correctVersionedKeyId}`, correctExport);

    const encrypted = await encryptBlob(new Blob(["preview"], { type: "image/webp" }), {
      key: correctKey,
      keyId: baseKeyId,
      objectType: "thumb_md_webp",
      contentType: "image/webp",
    });

    const candidates = await getMediaKeysForKeyId(baseKeyId);
    expect(candidates.length).toBeGreaterThanOrEqual(2);

    const decrypted = await decryptBlobWithAvailableMediaKeys(encrypted.ciphertext, encrypted.manifest);
    expect(await decrypted.text()).toBe("preview");
  });

  it("does not try an unrelated active gallery key for versioned media", async () => {
    const galleryId = "gallery-versioned-missing-test";
    const baseKeyId = galleryKeyId(galleryId);
    const correctKey = await generateRawMediaKey();
    const wrongKey = await generateRawMediaKey();
    const correctExport = await exportRawMediaKey(correctKey);
    const wrongExport = await exportRawMediaKey(wrongKey);
    const correctVersionedKeyId = await versionedGalleryKeyId(galleryId, correctExport);
    const wrongVersionedKeyId = await versionedGalleryKeyId(galleryId, wrongExport);

    window.localStorage.setItem(`${KEY_PREFIX}${wrongVersionedKeyId}`, wrongExport);
    window.localStorage.setItem(`${ACTIVE_PREFIX}${baseKeyId}`, wrongVersionedKeyId);

    const encrypted = await encryptBlob(new Blob(["preview"], { type: "image/webp" }), {
      key: correctKey,
      keyId: correctVersionedKeyId,
      objectType: "thumb_md_webp",
      contentType: "image/webp",
    });

    await expect(
      decryptBlobWithAvailableMediaKeys(encrypted.ciphertext, encrypted.manifest),
    ).rejects.toThrow(MEDIA_KEY_UNAVAILABLE_MESSAGE);
  });

  it("uses URL hash keys only when they match a versioned media key", async () => {
    const galleryId = "gallery-versioned-hash-test";
    const correctKey = await generateRawMediaKey();
    const wrongKey = await generateRawMediaKey();
    const correctExport = await exportRawMediaKey(correctKey);
    const wrongExport = await exportRawMediaKey(wrongKey);
    const correctVersionedKeyId = await versionedGalleryKeyId(galleryId, correctExport);

    const encrypted = await encryptBlob(new Blob(["preview"], { type: "image/webp" }), {
      key: correctKey,
      keyId: correctVersionedKeyId,
      objectType: "thumb_md_webp",
      contentType: "image/webp",
    });

    window.history.replaceState(null, "", `/galleries/${galleryId}#rd_key=${wrongExport}`);
    await expect(
      decryptBlobWithAvailableMediaKeys(encrypted.ciphertext, encrypted.manifest),
    ).rejects.toThrow(MEDIA_KEY_UNAVAILABLE_MESSAGE);

    window.history.replaceState(null, "", `/galleries/${galleryId}#rd_key=${correctExport}`);
    const decrypted = await decryptBlobWithAvailableMediaKeys(encrypted.ciphertext, encrypted.manifest);
    expect(await decrypted.text()).toBe("preview");
  });

  it("reports unavailable and mismatched keys without leaking browser crypto errors", async () => {
    const galleryId = "gallery-error-test";
    const baseKeyId = galleryKeyId(galleryId);
    const correctKey = await generateRawMediaKey();
    const wrongKey = await generateRawMediaKey();
    const wrongExport = await exportRawMediaKey(wrongKey);

    const encrypted = await encryptBlob(new Blob(["preview"], { type: "image/webp" }), {
      key: correctKey,
      keyId: baseKeyId,
      objectType: "thumb_md_webp",
      contentType: "image/webp",
    });

    await expect(
      decryptBlobWithAvailableMediaKeys(encrypted.ciphertext, encrypted.manifest),
    ).rejects.toThrow(MEDIA_KEY_UNAVAILABLE_MESSAGE);

    window.localStorage.setItem(`${KEY_PREFIX}${baseKeyId}`, wrongExport);

    await expect(
      decryptBlobWithAvailableMediaKeys(encrypted.ciphertext, encrypted.manifest),
    ).rejects.toThrow(MEDIA_KEY_MISMATCH_MESSAGE);
  });
});
