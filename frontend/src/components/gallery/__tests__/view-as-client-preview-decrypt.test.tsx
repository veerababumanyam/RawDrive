import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import type { Gallery, PublicAsset } from "@/lib/api/galleries";

// Regression: the owner "View as client" preview renders the SHARED public
// Hero + Grid components. Those components decrypt E2EE photos via
// useDecryptedAssetUrl, which fetches the encrypted /storage bytes and (when
// given a bearer `token`, its 3rd arg) attaches `Authorization: Bearer`.
//
// Before this fix the public components hardcoded `null` for that token, so in
// the owner preview every encrypted byte fetch went out unauthenticated and
// 401/403'd — the photographer saw blank/"Image unavailable" tiles ("this view
// is not decrypting the photos"). The owner preview must thread the
// photographer's access token (the same pattern the working dashboard detail
// page's GalleryAssetTileImage uses) so the bytes authenticate against the
// owner's workspace and decrypt.
//
// We spy on the hook to assert the components forward the owner token as the
// 3rd positional arg (`token`), not `null`.
const decryptSpy = vi.fn((..._args: unknown[]) => ({
  src: "blob:stub",
  loading: false,
  error: null as string | null,
}));
vi.mock("@/lib/media-encryption/use-decrypted-asset-url", () => ({
  useDecryptedAssetUrl: (...args: unknown[]) => decryptSpy(...args),
}));

// Favorites API fires on mount (fire-and-forget); stub so the grid's hook
// never reaches the network in jsdom.
vi.mock("@/lib/api/favorites", () => ({
  addPublicFavorite: vi.fn().mockResolvedValue(undefined),
  removePublicFavorite: vi.fn().mockResolvedValue(undefined),
  listPublicFavoriteAssetIds: vi.fn().mockResolvedValue([]),
  getGalleryFavoritesSummary: vi.fn().mockResolvedValue(null),
}));

const { PublicGalleryGrid } = await import("../public-gallery-grid");
const { PublicGalleryHero } = await import("../public-gallery-hero");

const OWNER_TOKEN = "owner-access-token";

function encryptedAsset(): PublicAsset {
  return {
    id: "enc-1",
    filename: "veera.jpg",
    content_type: "image/jpeg",
    width: 1600,
    height: 1067,
    is_encrypted: true,
    media_encryption: {
      scheme: "rawdrive-e2ee-v1",
      key_id: "gallery:g1:abcd1234",
      variants: {
        thumb_md_webp: {
          scheme: "rawdrive-e2ee-v1",
          algorithm: "AES-GCM",
          key_id: "gallery:g1:abcd1234",
          object_type: "derivative",
          iv_b64: "AAAA",
          ciphertext_sha256: "deadbeef",
          ciphertext_size: 10,
        },
      },
    },
    thumbnail_urls: {
      thumb_md_webp: "/storage/derivatives/enc-1/thumb_md_webp.webp.enc",
    },
    sort_order: 1,
  };
}

beforeEach(() => {
  decryptSpy.mockClear();
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

describe("View-as-client owner preview decryption auth", () => {
  it("PublicGalleryGrid forwards the owner viewerToken into useDecryptedAssetUrl", () => {
    render(
      <PublicGalleryGrid
        slug="g1"
        assets={[encryptedAsset()]}
        viewerToken={OWNER_TOKEN}
      />,
    );
    expect(decryptSpy).toHaveBeenCalled();
    // 3rd positional arg is the bearer `token` the hook attaches as
    // Authorization. Must be the owner token, never the pre-fix `null`.
    expect(decryptSpy.mock.calls.some((call) => call[2] === OWNER_TOKEN)).toBe(
      true,
    );
    expect(decryptSpy.mock.calls.some((call) => call[2] === null)).toBe(false);
  });

  it("PublicGalleryHero forwards the owner viewerToken into the cover useDecryptedAssetUrl", () => {
    const gallery = {
      id: "g1",
      title: "wedding veeru",
      slug: "wedding-veeru",
    } as unknown as Gallery;
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[encryptedAsset()]}
        viewerToken={OWNER_TOKEN}
      />,
    );
    expect(decryptSpy).toHaveBeenCalled();
    expect(decryptSpy.mock.calls.some((call) => call[2] === OWNER_TOKEN)).toBe(
      true,
    );
  });

  it("PublicGalleryHero forwards the owner viewerToken into slideshow slides", () => {
    const gallery = {
      id: "g1",
      title: "wedding veeru",
      slug: "wedding-veeru",
    } as unknown as Gallery;
    render(
      <PublicGalleryHero
        gallery={gallery}
        assets={[encryptedAsset()]}
        slug="wedding-veeru"
        hasMusic
        viewerToken={OWNER_TOKEN}
      />,
    );
    expect(
      decryptSpy.mock.calls.some(
        (call) =>
          Array.isArray(call[1]) &&
          call[1][0] === "display_webp" &&
          call[2] === OWNER_TOKEN,
      ),
    ).toBe(true);
  });
});
