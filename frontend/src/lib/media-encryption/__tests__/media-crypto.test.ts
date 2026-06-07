import { describe, expect, it } from "vitest";
import {
  appendGalleryKeyFragment,
  decryptBlob,
  encryptBlob,
  exportRawMediaKey,
  generateRawMediaKey,
  importRawMediaKey,
  readGalleryKeyFromHash,
} from "../media-crypto";

describe("media E2EE crypto", () => {
  it("encrypts and decrypts media bytes without storing plaintext in the manifest", async () => {
    const key = await generateRawMediaKey();
    const input = new Blob([new Uint8Array([1, 2, 3, 4, 5])], {
      type: "image/jpeg",
    });

    const encrypted = await encryptBlob(input, {
      key,
      keyId: "gallery:test",
      objectType: "original",
      contentType: "image/jpeg",
    });

    expect(encrypted.manifest.scheme).toBe("rawdrive-e2ee-v1");
    expect(encrypted.manifest.algorithm).toBe("AES-256-GCM");
    expect(encrypted.manifest.iv_b64).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encrypted.manifest.ciphertext_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(encrypted.manifest)).not.toContain("1,2,3,4,5");
    expect(await encrypted.ciphertext.text()).not.toBe(await input.text());

    const decrypted = await decryptBlob(
      encrypted.ciphertext,
      encrypted.manifest,
      key,
    );
    expect([...new Uint8Array(await decrypted.arrayBuffer())]).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(decrypted.type).toBe("image/jpeg");
  });

  it("round-trips exported gallery keys and keeps share keys in URL fragments", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    const imported = await importRawMediaKey(exported);

    const encrypted = await encryptBlob(new Blob(["secret"]), {
      key: imported,
      keyId: "gallery:test",
      objectType: "thumb_md_webp",
      contentType: "image/webp",
    });
    const decrypted = await decryptBlob(
      encrypted.ciphertext,
      encrypted.manifest,
      key,
    );
    expect(await decrypted.text()).toBe("secret");

    const shared = appendGalleryKeyFragment(
      "https://rawdrive.in/g/wedding?album=a1",
      exported,
    );
    expect(shared).toBe(
      `https://rawdrive.in/g/wedding?album=a1#rd_key=${exported}`,
    );
    expect(new URL(shared).search).toBe("?album=a1");
    expect(readGalleryKeyFromHash(new URL(shared).hash)).toBe(exported);
    expect(readGalleryKeyFromHash("#rq_key=legacy-key")).toBe("legacy-key");
  });
});
