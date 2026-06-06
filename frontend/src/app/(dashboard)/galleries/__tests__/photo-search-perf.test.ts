import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-static regression test for the gallery PHOTO-SEARCH page. Face search
// returns the matched cluster's asset_ids (all of which belong to THIS gallery,
// since the cluster is gallery-scoped). The page previously hydrated them with
// one getAsset() per match — an N+1 that scales with the number of matched
// photos (a frequently-photographed person can match hundreds). It must instead
// resolve them from a single ?include_assets=true gallery-assets fetch. Same
// style as cover-preview-perf.test.ts: fails on the pre-fix source, passes after.

const repoRoot = path.resolve(__dirname, "../../../../..");
const photoSearchPath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/photo-search/page.tsx",
);
const faceReviewPanelPath = path.join(
  repoRoot,
  "src/components/ai/FaceIdentityReviewPanel.tsx",
);

const read = (p: string): string => fs.readFileSync(p, "utf8");

describe("gallery photo-search — batch hydration (PERF-23)", () => {
  it("resolves matched assets from one ?include_assets=true fetch, not a per-match getAsset loop", () => {
    const source = read(photoSearchPath);
    // One bulk gallery-assets fetch with the assets embedded.
    expect(source).toContain("includeAssets: true");
    // Matched asset_ids are resolved from the embedded-asset map by id.
    expect(source).toMatch(/\.get\(aid\)/);
    expect(source).not.toContain("getAsset(");
    expect(source).not.toContain("Promise.allSettled");
  });

  it("windows photographer face-review thumbnails for large people clusters", () => {
    const source = read(faceReviewPanelPath);
    expect(source).toContain("FACE_REVIEW_PAGE_SIZE");
    expect(source).toContain("visibleFaces.map");
    expect(source).not.toContain("faces.map((face)");
  });
});
