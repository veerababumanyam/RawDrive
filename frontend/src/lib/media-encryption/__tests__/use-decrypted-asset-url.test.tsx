import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useDecryptedAssetUrl } from "../use-decrypted-asset-url";
import {
  encryptBlob,
  exportRawMediaKey,
  generateRawMediaKey,
  type MediaEncryptionManifest,
} from "../media-crypto";
import type { EncryptedAssetLike } from "../asset-media";

const TEST_VARIANTS = ["thumb_md_webp"] as const;

function Probe({ asset }: { asset: EncryptedAssetLike }) {
  const media = useDecryptedAssetUrl(asset, TEST_VARIANTS);
  return (
    <div>
      <span data-testid="loading">{String(media.loading)}</span>
      <span data-testid="src">{media.src}</span>
      <span data-testid="error">{media.error}</span>
    </div>
  );
}

describe("useDecryptedAssetUrl", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/g/wedding");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:decrypted-webp");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("decrypts encrypted media bytes with the gallery key from the URL hash", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    window.history.replaceState(null, "", `/g/wedding#rd_key=${exported}`);

    const encrypted = await encryptBlob(new Blob(["webp-bytes"], { type: "image/webp" }), {
      key,
      keyId: "gallery:gallery-hook-test",
      objectType: "thumb_md_webp",
      contentType: "image/webp",
    });
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi.fn().mockImplementation(
      () => Promise.resolve(new Response(ciphertextBytes.slice(0), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: { thumb_md_webp: "gallery/asset-1/thumb_md.webp.enc" },
          media_encryption: {
            scheme: "rawdrive-e2ee-v1",
            variants: {
              thumb_md_webp: encrypted.manifest as MediaEncryptionManifest,
            },
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("src")).toHaveTextContent("blob:decrypted-webp");
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/storage/gallery/asset-1/thumb_md.webp.enc",
      { credentials: "same-origin" },
    );
  });
});
