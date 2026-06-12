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
    expect(source).toContain("images: [shareImageUrl]");
  });

  it("falls back to the studio logo when the cover is encrypted/absent", () => {
    // E2EE galleries (the default) have .enc covers a crawler can't fetch, so
    // the share preview must fall back to the public studio branding logo.
    expect(source).toContain("const logoPath = branding?.can_customize");
    expect(source).toContain("const logoImageUrl =");
    // .enc logos are skipped just like covers.
    expect(source).toContain('.endsWith(".enc")');
    // Crawlers need an absolute URL — resolve the relative branding-logo path
    // against the BROWSER (public) API base, never the internal SSR base.
    expect(source).toContain("getBrowserApiBaseUrl()");
    // Cover is preferred; logo is the fallback.
    expect(source).toContain("const shareImageUrl = ogImageUrl ?? logoImageUrl");
    expect(source).toContain("const shareImageIsCover = Boolean(ogImageUrl)");
    // The card type + fixed dimensions track which image actually shipped.
    expect(source).toContain(
      'shareImageIsCover ? "summary_large_image" : "summary"',
    );
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
