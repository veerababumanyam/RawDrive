import { describe, expect, it } from "vitest";
import { assetIsProcessing, getAssetPreviewUrl, getStorageBackedUrl } from "../dashboard-ui";

describe("assetIsProcessing — gallery skeleton predicate", () => {
  // Locks the predicate used by gallery/[id]/page.tsx to choose
  // between the real <img> and the "Processing…" skeleton tile while
  // the thumbnail worker is still generating derivatives. Each case
  // documents a state the predicate must classify correctly so a
  // worker change to status/thumbnail_urls semantics cannot silently
  // re-introduce the "broken <img> before thumbnails ready" bug.

  it("treats a fully-ready asset as not processing", () => {
    expect(
      assetIsProcessing({
        status: "ready",
        thumbnail_urls: { thumb_md_webp: "derivatives/abc/thumb_md_webp.webp" },
      }),
    ).toBe(false);
  });

  it("treats a null/missing asset as processing (race during hydrate)", () => {
    expect(assetIsProcessing(null)).toBe(true);
    expect(assetIsProcessing(undefined)).toBe(true);
  });

  it("treats status=processing as processing even with thumbnails populated", () => {
    expect(
      assetIsProcessing({
        status: "processing",
        thumbnail_urls: { thumb_md: "thumbnails/abc/thumb_md.jpg" },
      }),
    ).toBe(true);
  });

  it("treats empty thumbnail_urls as processing even when status=ready", () => {
    // Worker writes thumbnail_urls and status in two separate UPDATEs;
    // a listing fetch can land between them. Empty-thumbs is the
    // load-bearing signal.
    expect(assetIsProcessing({ status: "ready", thumbnail_urls: {} })).toBe(true);
    expect(assetIsProcessing({ status: "ready", thumbnail_urls: null })).toBe(true);
    expect(assetIsProcessing({ status: "ready" })).toBe(true);
  });

  it("treats status=error as processing (not-displayable)", () => {
    expect(
      assetIsProcessing({
        status: "error",
        thumbnail_urls: { thumb_md_webp: "derivatives/abc/thumb_md_webp.webp" },
      }),
    ).toBe(true);
  });

  it("treats legacy JPG-only thumbnails as processing until WebP exists", () => {
    expect(
      assetIsProcessing({
        status: "ready",
        thumbnail_urls: { thumb_md: "thumbnails/abc/thumb_md.jpg" },
      }),
    ).toBe(true);
  });
});

describe("dashboard UI asset URLs", () => {
  it("prefixes backend storage paths and appends the session token", () => {
    expect(getStorageBackedUrl("/storage/workspaces/w1/photo.webp", "jwt-token")).toBe(
      "http://localhost:8080/storage/workspaces/w1/photo.webp?token=jwt-token",
    );
  });

  it("converts bare derivative storage keys into authenticated backend storage URLs", () => {
    expect(getStorageBackedUrl("derivatives/asset-1/display_webp.webp", "jwt-token")).toBe(
      "http://localhost:8080/storage/derivatives/asset-1/display_webp.webp?token=jwt-token",
    );
  });

  it("does not rewrite app-relative non-storage URLs", () => {
    expect(getStorageBackedUrl("/api/v1/public/galleries/wedding/branding/logo", "jwt-token")).toBe(
      "/api/v1/public/galleries/wedding/branding/logo",
    );
  });

  it("does not rewrite data or blob URLs", () => {
    expect(getStorageBackedUrl("data:image/webp;base64,abc", "jwt-token")).toBe("data:image/webp;base64,abc");
    expect(getStorageBackedUrl("blob:http://localhost/photo", "jwt-token")).toBe("blob:http://localhost/photo");
  });

  it("does not rewrite external presigned URLs", () => {
    const url = "https://example.r2.cloudflarestorage.com/photo.webp?signature=abc";

    expect(getStorageBackedUrl(url, "jwt-token")).toBe(url);
  });

  it("selects WebP thumbnails before legacy variants", () => {
    expect(
      getAssetPreviewUrl(
        {
          thumbnail_urls: {
            thumb_sm: "/storage/workspaces/w1/photo-small.jpg",
            thumb_sm_webp: "/storage/workspaces/w1/photo-small.webp",
          },
        },
        "jwt-token",
      ),
    ).toBe("http://localhost:8080/storage/workspaces/w1/photo-small.webp?token=jwt-token");
  });

  it("prefers thumb_md_webp over thumb_sm_webp for gallery tile size", () => {
    // The gallery grid tile renders at ~400px wide (4:3 aspect, 1/2/3-column
    // grid). thumb_sm_webp (200px source) gets browser-upscaled and looks
    // blurry; thumb_md_webp (600px source) scales down cleanly. Both live
    // under the same public storage prefix so the latter has identical
    // auth characteristics. This test locks the picker order.
    expect(
      getAssetPreviewUrl(
        {
          thumbnail_urls: {
            thumb_sm_webp: "thumbnails/abc/thumb_sm_webp.webp",
            thumb_md_webp: "thumbnails/abc/thumb_md_webp.webp",
            thumb_md: "thumbnails/abc/thumb_md.jpg",
          },
        },
        "jwt-token",
      ),
    ).toContain("thumb_md_webp.webp");
  });

  it("does not fall back to legacy JPG thumbnails or original download URLs", () => {
    expect(
      getAssetPreviewUrl(
        {
          thumbnail_urls: {
            thumb_md: "thumbnails/abc/thumb_md.jpg",
          },
          download_url: "originals/abc/photo.jpg",
        },
        "jwt-token",
      ),
    ).toBe("");
  });

  it("accepts non-standard WebP keys when the storage value is WebP", () => {
    expect(
      getAssetPreviewUrl(
        {
          thumbnail_urls: {
            preview: "thumbnails/abc/custom-preview.webp",
          },
        },
        "jwt-token",
      ),
    ).toBe("http://localhost:8080/storage/thumbnails/abc/custom-preview.webp?token=jwt-token");
  });
});

describe("getStorageBackedUrl — gallery-session (?gs=) channel (S4-G1)", () => {
  // The public viewer fetches protected gallery bytes cross-origin (the
  // /storage/* path is NOT proxied by the Next rewrites, so <img> requests go
  // straight to the API origin). The httpOnly gallery_session cookie is
  // SameSite=Strict on the API origin and never rides a cross-origin <img>,
  // so the session token MUST be appended as ?gs= for protected bytes to
  // authenticate. These tests lock that contract.

  it("appends the gallery-session token as ?gs= for storage paths", () => {
    expect(
      getStorageBackedUrl("/storage/derivatives/asset-1/display_webp.webp", null, "gs-token"),
    ).toBe("http://localhost:8080/storage/derivatives/asset-1/display_webp.webp?gs=gs-token");
  });

  it("URL-encodes the gallery-session token", () => {
    expect(
      getStorageBackedUrl("thumbnails/abc/thumb_md_webp.webp", null, "a/b+c=="),
    ).toBe("http://localhost:8080/storage/thumbnails/abc/thumb_md_webp.webp?gs=a%2Fb%2Bc%3D%3D");
  });

  it("omits ?gs= when no session token is supplied (open gallery, anonymous bytes)", () => {
    expect(getStorageBackedUrl("thumbnails/abc/thumb_md_webp.webp")).toBe(
      "http://localhost:8080/storage/thumbnails/abc/thumb_md_webp.webp",
    );
    expect(getStorageBackedUrl("thumbnails/abc/thumb_md_webp.webp", null, null)).toBe(
      "http://localhost:8080/storage/thumbnails/abc/thumb_md_webp.webp",
    );
  });

  it("can carry BOTH the dashboard JWT (?token=) and the gallery session (?gs=)", () => {
    expect(
      getStorageBackedUrl("/storage/derivatives/asset-1/display_webp.webp", "jwt-token", "gs-token"),
    ).toBe(
      "http://localhost:8080/storage/derivatives/asset-1/display_webp.webp?token=jwt-token&gs=gs-token",
    );
  });

  it("never appends ?gs= to non-storage, data, blob, or external URLs", () => {
    expect(getStorageBackedUrl("/api/v1/public/galleries/x/branding", null, "gs-token")).toBe(
      "/api/v1/public/galleries/x/branding",
    );
    expect(getStorageBackedUrl("data:image/webp;base64,abc", null, "gs-token")).toBe(
      "data:image/webp;base64,abc",
    );
    const external = "https://example.r2.cloudflarestorage.com/p.webp?sig=abc";
    expect(getStorageBackedUrl(external, null, "gs-token")).toBe(external);
  });
});
