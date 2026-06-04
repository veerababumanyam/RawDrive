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

  it("preview page requests server-embedded assets for the gallery path", () => {
    const source = read(previewPagePath);
    expect(source).toContain("includeAssets: true");
    // Both the gallery and album paths consume the embedded asset; getAsset()
    // remains only the fallback for degraded includes (older server).
    expect(source).toMatch(/row\.asset !== undefined/);
  });

  it("preview page album branch requests server-embedded assets (Q-2b)", () => {
    const source = read(previewPagePath);
    // Q-2b: the album branch must opt into ?include_assets=true so it no longer
    // loops getAsset() per asset. Assert the listAlbumAssets call passes the
    // includeAssets flag — proving the album path is one list request, not N.
    expect(source).toMatch(
      /listAlbumAssets\(\s*token,\s*albumId,\s*\{\s*includeAssets:\s*true\s*\}\s*\)/,
    );
  });
});
