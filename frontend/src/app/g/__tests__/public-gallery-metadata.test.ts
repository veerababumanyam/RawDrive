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

  it("prefers the gallery cover image for Open Graph and Twitter previews", () => {
    expect(source).toContain('coverManifest["og_image"]');
    expect(source).toContain('coverManifest["cover_1280"]');
    expect(source).toContain('coverManifest["cover_1920"]');
    expect(source).toContain('coverManifest["display_webp"]');
    expect(source).toContain('coverManifest["thumb_lg_webp"]');
    expect(source).toContain("getStorageBackedUrl(ogKey)");
    expect(source).toContain("summary_large_image");
    expect(source).toContain("images: [ogImageUrl]");
  });
});
