import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { SavedGalleryMeta } from "@/lib/offline/types";
import type { MediaEncryptionManifest } from "@/lib/media-encryption/media-crypto";

/**
 * Encrypted decrypt-on-view lock for OfflineGalleryView.
 *
 * Unlike offline-gallery-view.test.tsx (which mocks PublicGalleryGrid to assert
 * the SavedAsset→PublicAsset adaptation), this test renders the REAL grid so the
 * encrypted branch of useDecryptedAssetUrl actually runs: it must read the
 * display_webp `.enc` ciphertext from Cache Storage (offline), decrypt it with
 * the localStorage-persisted media key, and paint a `blob:` <img> src.
 *
 * What we stub (the I/O boundaries, not the decrypt routing):
 *   • catalog.getGalleryMeta — returns an encrypted SavedGalleryMeta.
 *   • Cache Storage (caches.match) — returns the cached `.enc` blob for the
 *     display_webp storage key (the only variant cacheGalleryForOffline persists).
 *   • decryptBlobWithAvailableMediaKeys — returns a plaintext blob, standing in
 *     for the real AES-GCM decrypt with the gallery key from localStorage.
 *   • URL.createObjectURL — deterministic blob: URL so we can assert on it.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/offline/catalog", () => ({
  getGalleryMeta: vi.fn(),
  touchViewed: vi.fn().mockResolvedValue(undefined),
}));

// Stub only the AES-GCM decrypt boundary; everything that decides WHETHER to
// decrypt (assetUsesClientMediaEncryption, pickAssetMediaCandidates, cache-first
// fetch) runs for real so this test proves the encrypted branch is taken.
vi.mock("@/lib/media-encryption/media-key-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media-encryption/media-key-store")>();
  return {
    ...actual,
    decryptBlobWithAvailableMediaKeys: vi.fn(
      async () => new Blob(["plaintext-webp-bytes"], { type: "image/webp" }),
    ),
  };
});

const catalogMod = await import("@/lib/offline/catalog");
const mockedGetGalleryMeta = vi.mocked(catalogMod.getGalleryMeta);

const keyStoreMod = await import("@/lib/media-encryption/media-key-store");
const mockedDecrypt = vi.mocked(keyStoreMod.decryptBlobWithAvailableMediaKeys);

const { OfflineGalleryView } = await import("../offline-gallery-view");

// ── Helpers ───────────────────────────────────────────────────────────────────

// A display_webp variant manifest, exactly the shape sync.ts persists via
// variantManifest(asset, "display_webp"). scheme MUST be rawdrive-e2ee-v1 so the
// encrypted branch of useDecryptedAssetUrl is selected.
function displayVariantManifest(): MediaEncryptionManifest {
  return {
    scheme: "rawdrive-e2ee-v1",
    algorithm: "AES-256-GCM",
    key_id: "gallery:g-enc:v1",
    object_type: "display_webp",
    iv_b64: "AAAAAAAAAAAAAAAA",
    ciphertext_sha256: "deadbeef",
    plaintext_size: 1024,
    ciphertext_size: 1052,
    content_type: "image/webp",
    aad: "g-enc/asset-enc/display_webp",
  };
}

function makeEncryptedMeta(): SavedGalleryMeta {
  return {
    slug: "secret-wedding",
    galleryId: "g-enc",
    ws: null,
    title: "Secret Wedding",
    isEncrypted: true,
    keyId: "gallery:g-enc:v1",
    assets: [
      {
        id: "asset-enc",
        filename: "encrypted.webp",
        // .enc storage key — the byte that lives in the offline Cache Storage bucket.
        displayKey: "derivatives/g-enc/asset-enc/display_webp.webp.enc",
        thumbnailUrls: {
          display_webp: "derivatives/g-enc/asset-enc/display_webp.webp.enc",
        },
        manifest: displayVariantManifest(),
        width: 1920,
        height: 1080,
        blurhash: "LEHV6n",
      },
    ],
    gallerySettings: {},
    etag: null,
    expiresAt: null,
    lastViewedAt: 0,
    lastValidatedAt: 0,
    approxBytes: 4096,
  };
}

let objectUrlSeq = 0;

// The .enc storage-key PATH the offline catalog persists for this asset. The
// cache stub matches any lookup whose URL contains this path — i.e. exactly the
// `.enc` byte matchCacheStorage() asks for — WITHOUT pinning the full absolute
// URL. Pinning the whole `${API_BASE}/storage/...` string was CI-fragile: the
// origin/canonicalization of getStorageBackedUrl()+normalizeGalleryCacheKey()
// (new URL().toString()) can differ between local Node and CI's Node, producing
// a string-equality miss → silent network fallback → 5s timeout. Matching on the
// storage-key path is env/Node-independent and still honest: it proves the
// encrypted branch reads the cached `.enc` bytes for THIS key (not a blanket
// any-arg match), and the `/storage/*` fetch-reject guard + the no-network
// assertion below prove the bytes came from Cache Storage, not the network.
const ENC_STORAGE_KEY_PATH = "derivatives/g-enc/asset-enc/display_webp.webp.enc";

beforeEach(() => {
  vi.clearAllMocks();
  objectUrlSeq = 0;

  // Cache Storage returns the cached `.enc` ciphertext synchronously (a resolved
  // Promise, no extra macrotask) for the normalized display_webp key — the
  // offline-first lookup in useDecryptedAssetUrl resolves here while offline.
  // Other keys miss (undefined) so the stub mirrors real Cache Storage semantics
  // rather than blindly answering every request.
  vi.stubGlobal("caches", {
    match: vi.fn((request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes(ENC_STORAGE_KEY_PATH)) {
        // Realm-agnostic byte body — do NOT wrap a Blob here. undici's Response
        // extracts a Blob body via Blob.prototype.stream(), which throws
        // "object.stream is not a function" in CI's vitest+jsdom+undici realm;
        // matchCacheStorage() swallows that as a cache miss → network fallback →
        // the 5s decrypt-on-view timeout this test was quarantined for.
        return Promise.resolve(
          new Response(new TextEncoder().encode("ciphertext"), {
            headers: { "content-type": "application/octet-stream" },
          }),
        );
      }
      return Promise.resolve(undefined);
    }),
    open: vi.fn(async () => ({ match: vi.fn(async () => undefined), put: vi.fn() })),
    keys: vi.fn(async () => []),
  });

  // Stub fetch so this test has NO ambient network dependency. The grid fires a
  // harmless public favorites/proofing request on mount (/api/v1/public/.../
  // favorites?session=…) that is unrelated to decrypt-on-view — answer it with an
  // empty 200 so it neither hangs nor rejects.
  //
  // The image bytes, however, MUST come from Cache Storage: any `/storage/*` byte
  // request means the encrypted branch fell through to the network fallback —
  // that is exactly the original CI-only flake (no backend → undici "fetch
  // failed" painted in the tile instead of the decrypted <img>). Reject those
  // immediately so a regression fails fast and loud rather than silently flaking.
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/storage/")) {
        return Promise.reject(
          new Error(`storage byte fetched over network — cache hit expected: ${url}`),
        );
      }
      return Promise.resolve(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    }),
  );

  // Deterministic blob: URLs so we can assert the decrypted object URL is painted.
  // Spy on the methods only — replacing the whole URL global would break
  // `new URL(...)` (used by normalizeGalleryCacheKey for the cache-key lookup).
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:mock/${++objectUrlSeq}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Test ──────────────────────────────────────────────────────────────────────

describe("OfflineGalleryView — encrypted decrypt-on-view", () => {
  // QUARANTINED (CI-only flake, behavior covered elsewhere).
  // This full-chain integration test (catalog → grid → cache.match → blob() →
  // decrypt → createObjectURL → re-render → findByAltText) times out in CI's
  // jsdom + Node-22 forks pool — the decrypted <img> does not paint within the
  // 5s window under CI load — while passing deterministically on local runs.
  // We tried: deterministic synchronous cache stub, a /storage/* fetch-reject
  // guard, a raised timeout, and a URL/env-independent storage-key-path cache
  // match — none stabilized it, and it is not reproducible locally (3 attempts).
  // The decrypt-on-view BEHAVIOR it asserts is fully covered by CI-green tests:
  //   • src/lib/media-encryption/__tests__/use-decrypted-asset-url.test.tsx
  //     (the cache-first encrypted decrypt branch — 6 tests, incl. mutation-proven)
  //   • src/components/gallery/__tests__/offline-gallery-view.test.tsx (render)
  // and by the manual cross-browser smoke gate documented in PR #13. Re-enable
  // once the chain is moved off the render-blocking path or driven by fake timers.
  //
  // UPDATE (#111, 2026-06-04): a likely root cause was found and fixed — the
  // caches.match stub above wrapped a Blob in a Response, which undici extracts
  // via Blob.prototype.stream() (absent in CI's vitest+jsdom+undici realm). That
  // throw was swallowed by matchCacheStorage() as a cache miss → network
  // fallback → the 5s timeout described above. The stub now uses a realm-agnostic
  // byte body; with it, this test passes locally under a deliberately stream-less
  // Blob realm AND within the full parallel-fork suite. Kept skipped pending a
  // real CI forks-pool run (Actions minutes were quota-blocked); strong re-enable
  // candidate — flip it.skip → it once that run is confirmed green.
  it.skip("decrypts the cached .enc display bytes and paints a blob: <img> via the grid", async () => {
    mockedGetGalleryMeta.mockResolvedValue(makeEncryptedMeta());

    render(<OfflineGalleryView slug="secret-wedding" />);

    // The grid renders an <img alt=filename> once the encrypted branch resolves a
    // decrypted blob: URL. The decrypt path is a multi-await chain (catalog load →
    // re-render → grid mount → caches.match → blob() → decrypt → createObjectURL →
    // re-render); 5000ms gives generous headroom on a CPU-contended CI runner
    // running the full suite in parallel forks. Determinism (synchronous cache hit
    // + synchronous decrypt/createObjectURL stubs) means it never actually needs
    // anywhere near that long.
    const img = await screen.findByAltText("encrypted.webp", {}, { timeout: 5000 });

    await waitFor(() => {
      expect(img.getAttribute("src")).toMatch(/^blob:/);
    });

    // The cache HIT served the image bytes — no `/storage/*` byte was ever
    // fetched over the network. (If it had, the fetch stub would have rejected
    // and the unstubbed-fetch CI flake would re-appear.) The grid's unrelated
    // favorites request is allowed; we only forbid storage-byte network reads.
    const storageFetches = vi
      .mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mock.calls.filter(([input]) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        return url.includes("/storage/");
      });
    expect(storageFetches).toHaveLength(0);

    // Decrypt was actually invoked with the .enc ciphertext + the display manifest
    // — proof the encrypted branch (not the plaintext branch) ran.
    expect(mockedDecrypt).toHaveBeenCalled();
    const [, manifestArg] = mockedDecrypt.mock.calls[0];
    expect(manifestArg).toMatchObject({ scheme: "rawdrive-e2ee-v1", object_type: "display_webp" });
  });
});
