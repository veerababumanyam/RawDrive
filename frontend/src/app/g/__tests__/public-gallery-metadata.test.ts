import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(process.cwd(), "src/app/g/[slug]/page.tsx");

describe("public gallery metadata", () => {
  const source = fs.readFileSync(pagePath, "utf8");

  it("uses share tokens when generating rich link previews", () => {
    expect(source).toContain("const shareToken =");
    expect(source).toMatch(
      /getPublicGallery\(\s*slug,\s*ws,\s*undefined,\s*shareToken\s*\)/,
    );
    expect(source).toMatch(
      /getPublicGalleryBranding\(\s*slug,\s*ws,\s*shareToken\s*\)/,
    );
  });

  it("prefers the phone cover profile image for Open Graph and Twitter previews", () => {
    expect(source).toContain("pickSharePreviewCoverKey");
    expect(source).toContain("readPublicCoverProfileThumbnails");
    expect(source).toContain("const phoneCoverManifest");
    expect(source).toContain("pickSharePreviewCoverKey(phoneCoverManifest)");
    expect(source).toContain("pickSharePreviewCoverKey(coverManifest)");
    expect(source).toContain("getStorageBackedUrl(ogKey)");
    expect(source).toContain("summary_large_image");
    expect(source).toContain("images: [ogImageUrl]");
  });

  it("includes the studio name in crawler-visible share previews", () => {
    expect(source).toContain("const studioName =");
    expect(source).toContain("branding?.studio_name?.trim()");
    expect(source).toContain("const shareTitle = gallery.title");
    expect(source).toContain("Photo collection by ${studioName}");
    expect(source).toContain("title: shareTitle");
    expect(source).toContain("siteName: studioName");
    expect(source).toContain("const canonicalUrl = `${SITE_URL}${canonicalPath}`");
    expect(source).toContain("url: canonicalUrl");
  });
});
