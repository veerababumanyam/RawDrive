import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { useDecryptedAssetUrl } from "../use-decrypted-asset-url";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import {
  encryptBlob,
  exportRawMediaKey,
  generateRawMediaKey,
  type MediaEncryptionManifest,
} from "../media-crypto";
import {
  importGalleryMediaKeyFromInput,
  versionedGalleryKeyId,
} from "../media-key-store";
import type { EncryptedAssetLike } from "../asset-media";
import { clearAuthTokens, persistAuthTokens } from "@/lib/auth";

// Non-encrypted asset used by the non-encrypted-branch tests below: it must paint
// the network storage URL synchronously on first commit, then upgrade to the
// offline Cache Storage blob when one is present.
const PLAIN_ASSET: EncryptedAssetLike = {
  id: "asset-plain",
  filename: "photo.webp",
  is_encrypted: false,
  thumbnail_urls: { thumb_md_webp: "gallery/asset-plain/thumb_md.webp" },
  media_encryption: undefined,
};

const TEST_VARIANTS = ["thumb_md_webp"] as const;

function Probe({
  asset,
  token,
  assetAccessToken,
}: {
  asset: EncryptedAssetLike;
  token?: string | null;
  assetAccessToken?: string | null;
}) {
  const media = useDecryptedAssetUrl(
    asset,
    TEST_VARIANTS,
    token,
    assetAccessToken,
  );
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
    window.localStorage.clear();
    window.history.replaceState(null, "", "/g/wedding");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:decrypted-webp");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearAuthTokens();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("decrypts encrypted media bytes with the gallery key from the URL hash", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    window.history.replaceState(null, "", `/g/wedding#rd_key=${exported}`);

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId: "gallery:gallery-hook-test",
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(ciphertextBytes.slice(0), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "gallery/asset-1/thumb_md.webp.enc",
          },
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
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/storage/gallery/asset-1/thumb_md.webp.enc",
      { credentials: "include" },
    );
  });

  it("sends dashboard auth on cross-origin encrypted media fetches", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    window.history.replaceState(null, "", `/dashboard#rd_key=${exported}`);

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId: "gallery:dashboard-token-test",
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(ciphertextBytes.slice(0), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        token="jwt-token"
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "gallery/asset-1/thumb_md.webp.enc",
          },
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
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/storage/gallery/asset-1/thumb_md.webp.enc",
      {
        credentials: "include",
        headers: { Authorization: "Bearer jwt-token" },
      },
    );
  });

  it("hydrates owner-synced gallery media keys when a new browser has no local key", async () => {
    persistAuthTokens("owner-token");
    const galleryId = "gallery-owner-hydrate-test";
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    const keyId = await versionedGalleryKeyId(galleryId, exported);

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId,
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/api/v1/galleries/${galleryId}/media-keys`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              keys: [{ key_id: keyId, exported_key: exported }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(
        new Response(ciphertextBytes.slice(0), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        token="owner-token"
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "gallery/asset-1/thumb_md.webp.enc",
          },
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
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes(`/api/v1/galleries/${galleryId}/media-keys`),
      ),
    ).toBe(true);
    const mediaKeyCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes(`/api/v1/galleries/${galleryId}/media-keys`),
    );
    expect(new Headers(mediaKeyCall?.[1]?.headers).get("Authorization")).toBe(
      "Bearer owner-token",
    );
  });

  it("decrypts encrypted WebP variants even when the storage key has no .enc suffix", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    window.history.replaceState(null, "", `/dashboard#rd_key=${exported}`);

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId: "gallery:plain-webp-key-test",
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(ciphertextBytes.slice(0), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        token="jwt-token"
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "thumbnails/asset-1/thumb_md_webp.webp",
          },
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
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/storage/thumbnails/asset-1/thumb_md_webp.webp",
      {
        credentials: "include",
        headers: { Authorization: "Bearer jwt-token" },
      },
    );
  });

  it("falls back from legacy .webp.enc thumbnail keys to current encrypted .webp keys", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    window.history.replaceState(null, "", `/dashboard#rd_key=${exported}`);

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId: "gallery:legacy-thumbnail-key-test",
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith(".webp.enc")) {
        return Promise.resolve(new Response("", { status: 404 }));
      }
      return Promise.resolve(
        new Response(ciphertextBytes.slice(0), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        token="jwt-token"
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "thumbnails/asset-1/thumb_md_webp.webp.enc",
          },
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
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8080/storage/thumbnails/asset-1/thumb_md_webp.webp.enc",
      {
        credentials: "include",
        headers: { Authorization: "Bearer jwt-token" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8080/storage/thumbnails/asset-1/thumb_md_webp.webp",
      {
        credentials: "include",
        headers: { Authorization: "Bearer jwt-token" },
      },
    );
  });

  it("fetches clear WebP thumbnail keys with dashboard auth on encrypted assets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      // Realm-agnostic byte body — do NOT wrap a Blob here. undici's Response
      // extracts a Blob body via Blob.prototype.stream(), which throws
      // "object.stream is not a function" in CI's vitest+jsdom+undici realm
      // (the Blob the test constructs has no undici-compatible stream()). The
      // other mocks in this file pass a byte body for the same reason.
      new Response(new TextEncoder().encode("webp-bytes"), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        token="jwt-token"
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "thumbnails/asset-1/thumb_md.webp",
          },
          media_encryption: {
            scheme: "rawdrive-e2ee-v1",
            variants: {
              thumb_md_webp: { scheme: "rawdrive-e2ee-v1" },
            },
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/storage/thumbnails/asset-1/thumb_md.webp",
      {
        credentials: "include",
        headers: { Authorization: "Bearer jwt-token" },
      },
    );
  });

  it("keeps public gallery session auth in the storage URL without a dashboard bearer header", async () => {
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    window.history.replaceState(null, "", `/g/wedding#rd_key=${exported}`);

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId: "gallery:public-session-test",
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(ciphertextBytes.slice(0), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        assetAccessToken="gallery-session"
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "gallery/asset-1/thumb_md.webp.enc",
          },
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
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8080/storage/gallery/asset-1/thumb_md.webp.enc?at=gallery-session",
      { credentials: "include" },
    );
  });

  it("retries locked encrypted media after a gallery key is imported without remounting", async () => {
    const galleryId = "hook-retry-import-test";
    const key = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    const keyId = await versionedGalleryKeyId(galleryId, exported);

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId,
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(ciphertextBytes.slice(0), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "gallery/asset-1/thumb_md.webp.enc",
          },
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
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Photo key unavailable",
      );
    });

    await act(async () => {
      await importGalleryMediaKeyFromInput({
        galleryId,
        input: exported,
        expectedKeyIds: [keyId],
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry locked media when an unrelated gallery key is imported", async () => {
    const galleryId = "hook-scoped-import-test";
    const unrelatedGalleryId = "hook-unrelated-import-test";
    const key = await generateRawMediaKey();
    const unrelatedKey = await generateRawMediaKey();
    const exported = await exportRawMediaKey(key);
    const unrelatedExported = await exportRawMediaKey(unrelatedKey);
    const keyId = await versionedGalleryKeyId(galleryId, exported);
    const unrelatedKeyId = await versionedGalleryKeyId(
      unrelatedGalleryId,
      unrelatedExported,
    );

    const encrypted = await encryptBlob(
      new Blob(["webp-bytes"], { type: "image/webp" }),
      {
        key,
        keyId,
        objectType: "thumb_md_webp",
        contentType: "image/webp",
      },
    );
    const ciphertextBytes = await encrypted.ciphertext.arrayBuffer();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(ciphertextBytes.slice(0), { status: 200 }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Probe
        asset={{
          id: "asset-1",
          filename: "photo.webp",
          is_encrypted: true,
          thumbnail_urls: {
            thumb_md_webp: "gallery/asset-1/thumb_md.webp.enc",
          },
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
      expect(screen.getByTestId("error")).toHaveTextContent(
        "Photo key unavailable",
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await importGalleryMediaKeyFromInput({
        galleryId: unrelatedGalleryId,
        input: unrelatedExported,
        expectedKeyIds: [unrelatedKeyId],
      });
    });

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await importGalleryMediaKeyFromInput({
        galleryId,
        input: exported,
        expectedKeyIds: [keyId],
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("src")).toHaveTextContent(
        "blob:decrypted-webp",
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ── Non-encrypted branch: sync first paint + offline cache upgrade ─────────────
//
// The non-encrypted <img> branch MUST paint the network storage URL
// synchronously on the first commit (single setState, loading:false) so RTL's
// synchronous `getByAltText` in the grid tests and the online grid see a real
// src on first render — the T7 regression this guards against (no empty-string
// {src:"",loading:true} intermediate).
//
// It MUST THEN asynchronously upgrade to the cached blob from Cache Storage when
// one is present. Storage byte URLs are CROSS-ORIGIN and the Service Worker does
// NOT intercept cross-origin requests (service-worker.js: url.origin !==
// self.location.origin -> return). So offline serving of these assets is
// client-managed by this hook reading the `rawdrive-offline-<galleryId>` bucket.

describe("useDecryptedAssetUrl — non-encrypted sync paint + offline upgrade", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/g/wedding");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:should-not-be-used");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("synchronous network-URL first paint (cache miss)", () => {
    // Cache miss: the async upgrade is a no-op, so first-paint stays stable.
    const matchSpy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("caches", { match: matchSpy });

    const expectedUrl = getStorageBackedUrl(
      PLAIN_ASSET.thumbnail_urls?.thumb_md_webp,
      undefined,
      undefined,
    );

    const { result } = renderHook(() =>
      useDecryptedAssetUrl(PLAIN_ASSET, TEST_VARIANTS),
    );

    // First settled render: network URL painted synchronously inside the effect.
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.src).toBe(expectedUrl);
    expect(result.current.src).not.toBe("");
    expect(result.current.src).not.toMatch(/^blob:/);
  });

  it("upgrades to cached blob when offline (cache hit)", async () => {
    // Offline: Cache Storage holds the asset bytes. The hook must swap the
    // network URL for an object URL built from the cached blob.
    const cachedBlob = new Blob(["cached-bytes"], { type: "image/webp" });
    const matchSpy = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(cachedBlob),
    });
    vi.stubGlobal("caches", { match: matchSpy });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:offline-upgrade");

    const { result } = renderHook(() =>
      useDecryptedAssetUrl(PLAIN_ASSET, TEST_VARIANTS),
    );

    await waitFor(() => {
      expect(result.current.src).toBe("blob:offline-upgrade");
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(matchSpy).toHaveBeenCalled();
  });

  it("renders the <img>-ready URL synchronously without an empty-string flash (T7 regression)", () => {
    render(<Probe asset={PLAIN_ASSET} />);

    // No waitFor: the value is available on the first synchronous render.
    const expectedUrl = getStorageBackedUrl(
      PLAIN_ASSET.thumbnail_urls?.thumb_md_webp,
      undefined,
      undefined,
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
    expect(screen.getByTestId("src")).toHaveTextContent(expectedUrl);
    expect(screen.getByTestId("error")).toBeEmptyDOMElement();
  });
});
