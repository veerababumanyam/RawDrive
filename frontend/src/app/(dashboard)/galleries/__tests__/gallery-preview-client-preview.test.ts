import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../../../..");
const previewPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/preview/page.tsx",
);
const publicPagePath = path.join(repoRoot, "src/app/g/[slug]/page.tsx");
const sharedBodyPath = path.join(
  repoRoot,
  "src/components/gallery/public-gallery-body.tsx",
);
const galleriesApiPath = path.join(repoRoot, "src/lib/api/galleries.ts");

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("Preview as client shared public render contract", () => {
  it("renders public and owner preview bodies through the shared component", () => {
    expect(read(publicPagePath)).toContain("<PublicGalleryBody");
    expect(read(previewPagePath)).toContain("<PublicGalleryBody");

    const body = read(sharedBodyPath);
    const sectionOrder = [
      "<PublicGalleryHero",
      "<GalleryExpiryBanner",
      "<PublicGalleryBanners",
      "<PublicGalleryAlbumChips",
      "<EmbeddedVideosPanel",
      "<PublicGalleryGrid",
      "<PublicGalleryProducts",
      "<PublicGalleryEnhancements",
    ];
    let lastIndex = -1;
    for (const marker of sectionOrder) {
      const nextIndex = body.indexOf(marker);
      expect(nextIndex).toBeGreaterThan(lastIndex);
      lastIndex = nextIndex;
    }
  });

  it("uses the server canonical URL instead of rebuilding from dashboard origin", () => {
    const source = read(previewPagePath);
    expect(source).toContain("publicUrl: result.public_url || \"\"");
    expect(source).toContain("mediaKeyIdsForAsset");
    expect(source).toContain("const expectedKeyIds = Array.from(");
    expect(source).toMatch(
      /appendStoredGalleryKeyFragment\(\s*payload\.publicUrl,\s*id,\s*expectedKeyIds,\s*\)/,
    );
    expect(source).toContain("createGalleryShareLink");
    expect(source).toContain("setUrlSearchParamBeforeFragment(");
    expect(source).toContain("created.token");
    expect(source).toContain("getShareUrl={getPreviewShareUrl}");
    expect(source).not.toContain("window.location.origin");
  });

  it("forwards album scope through the authenticated client-preview endpoint", () => {
    const source = read(galleriesApiPath);
    expect(source).toContain("/api/v1/galleries/${galleryId}/client-preview${qs}");
    expect(source).toContain("album=${encodeURIComponent(albumId)}");
  });

  it("marks preview-mode public side effects as disabled", () => {
    const body = read(sharedBodyPath);
    expect(body).toContain("previewMode={previewMode}");
    expect(body).toContain("favoritesDisabledReason=");
    expect(body).toContain("publicActionsDisabledReason=");
    expect(body).toContain("baseHref={previewBaseHref}");
  });
});
