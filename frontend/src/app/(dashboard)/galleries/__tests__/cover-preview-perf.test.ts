import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-static regression tests for the gallery COVER and PREVIEW pages.
// Same style as gallery-detail-perf-a11y.test.ts (PERF-23): the gallery
// detail grid already batch-hydrates via ?include_assets=true; the cover
// picker and the preview page still looped getAsset() once per asset. These
// assert the two surfaces now request the server-embedded asset and consume
// it, instead of issuing an N-wide per-asset fan-out. No DB / network / render
// harness — they fail against the pre-fix source and pass after the fix.

const repoRoot = path.resolve(__dirname, "../../../../..");
const coverPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/cover/page.tsx",
);
const previewPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/preview/page.tsx",
);

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("gallery cover & preview — batch hydration (PERF-23)", () => {
  it("cover page requests server-embedded assets via ?include_assets=true", () => {
    const source = read(coverPagePath);
    // Opt into the embedded-asset response on the gallery-asset fetch.
    expect(source).toContain("includeAssets: true");
    // Consume the embedded asset; the per-asset getAsset() loop is only the
    // fallback when the server did not embed (older server / degraded include).
    expect(source).toMatch(/entry\.asset !== undefined/);
  });

  it("cover page bounds degraded asset-hydration fallback concurrency", () => {
    const source = read(coverPagePath);
    expect(source).toContain("HYDRATE_CONCURRENCY");
    expect(source).toContain("Math.min(HYDRATE_CONCURRENCY, rows.length)");
    expect(source).not.toContain("Promise.all(\n        rows.map(async");
  });

  it("cover page pages the gallery-photo picker instead of rendering every asset", () => {
    const source = read(coverPagePath);
    expect(source).toContain("COVER_PHOTO_PAGE_SIZE");
    expect(source).toContain("pagedCoverAssets.map");
    expect(source).not.toContain("assets.map((a, index)");
  });

  it("preview page delegates gallery assets to the client-preview endpoint", () => {
    const source = read(previewPagePath);
    expect(source).toContain("getGalleryClientPreview");
    expect(source).not.toContain("listGalleryAssets");
    expect(source).not.toContain("getAsset(");
  });

  it("preview page forwards album scope to the client-preview endpoint", () => {
    const source = read(previewPagePath);
    expect(source).toContain("getGalleryClientPreview(token, id, { albumId })");
    expect(source).not.toContain("listAlbumAssets");
  });
});
