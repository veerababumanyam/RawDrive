import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const singlePhotoPagePath = path.join(
  repoRoot,
  "app/g/[slug]/photo/[assetId]/page.tsx",
);

function readSinglePhotoPage(): string {
  return fs.readFileSync(singlePhotoPagePath, "utf8");
}

describe("public single-photo route contracts", () => {
  it("preserves workspace scope for body fetches and metadata fetches", () => {
    const source = readSinglePhotoPage();

    expect(source).toContain("searchParams?: Promise<{ ws?: string }>");
    expect(source).toContain(
      "const query = searchParams ? await searchParams : {}",
    );
    expect(source).toContain(
      'const ws = typeof query.ws === "string" && query.ws ? query.ws : undefined',
    );
    expect(source).toContain(
      "gallery = await getPublicGallery(slug, ws, sessionToken)",
    );
    expect(source).toContain(
      "assets = await getPublicGalleryAssets(slug, undefined, ws, sessionToken)",
    );
    expect(source).toContain(
      "const branding = await getPublicGalleryBranding(slug, ws).catch(() => null)",
    );
    expect(source).toContain("getPublicGallery(slug, ws)");
    expect(source).toContain(
      "getPublicGalleryBranding(slug, ws).catch(() => null)",
    );
    expect(source).not.toContain(
      "getPublicGallery(slug, undefined, sessionToken)",
    );
    expect(source).not.toContain(
      "getPublicGalleryBranding(slug).catch(() => null)",
    );
  });
});
