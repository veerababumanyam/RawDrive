import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const coverPagePath = join(
  process.cwd(),
  "src/app/(dashboard)/galleries/[id]/cover/page.tsx",
);
const previewSurfacePaths = [
  "src/app/(dashboard)/galleries/page.tsx",
  "src/app/(dashboard)/dashboard/page.tsx",
  "src/app/(dashboard)/galleries/[id]/photo-search/page.tsx",
].map((path) => join(process.cwd(), path));

function readCoverPage() {
  return readFileSync(coverPagePath, "utf8");
}

describe("gallery cover editor E2EE preview contracts", () => {
  it("renders cover, thumbnail, and grid previews through decrypted WebP media", () => {
    const source = readCoverPage();

    expect(source).toContain("useDecryptedAssetUrl");
    expect(source).toContain("LIGHTBOX_VARIANTS");
    expect(source).toContain("GRID_VARIANTS");
    expect(source).toContain("FILMSTRIP_VARIANTS");
    expect(source).not.toContain("getAssetPreviewUrl");
  });

  it("keeps dashboard gallery preview surfaces off raw storage image URLs", () => {
    for (const path of previewSurfacePaths) {
      expect(readFileSync(path, "utf8")).not.toContain("getAssetPreviewUrl");
    }
  });

  it("keeps owner gallery preview surfaces explicit about missing encrypted keys", () => {
    for (const path of [
      "src/app/(dashboard)/galleries/page.tsx",
      "src/app/(dashboard)/dashboard/page.tsx",
    ].map((sourcePath) => join(process.cwd(), sourcePath))) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("LockedMediaFallback");
      expect(source).toContain("media.error");
    }
  });
});
