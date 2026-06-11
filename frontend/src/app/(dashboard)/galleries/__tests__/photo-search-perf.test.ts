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
const publicPhotoSearchPath = path.join(
  repoRoot,
  "src/app/g/[slug]/photo-search/page.tsx",
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

  it("windows matched result photos for large galleries", () => {
    const source = read(photoSearchPath);
    expect(source).toContain("MATCHED_PHOTO_PAGE_SIZE");
    expect(source).toContain("pagedMatchedAssets.map");
    expect(source).not.toContain("matchedAssets.map((asset)");
  });

  it("hides duplicate photo-search matches for the same photo", () => {
    const dashboardSource = read(photoSearchPath);
    const publicSource = read(publicPhotoSearchPath);

    expect(dashboardSource).toContain("uniqueAssetsById");
    expect(dashboardSource).toContain("setMatchedAssets(ok)");
    expect(dashboardSource).toContain("matchedAssets.length");

    expect(publicSource).toContain("uniquePublicAssetsById");
    expect(publicSource).toContain("uniqueSearchResultAssets.map");
    expect(publicSource).not.toContain("(searchResult.assets ?? []).map");
  });

  it("windows photographer face-review thumbnails for large people clusters", () => {
    const source = read(faceReviewPanelPath);
    expect(source).toContain("FACE_REVIEW_PAGE_SIZE");
    expect(source).toContain("visibleFaces.map");
    expect(source).not.toContain("faces.map((face)");
  });

  it("defaults detected-person review to all detected people", () => {
    const source = read(faceReviewPanelPath);
    expect(source).toContain("All detected persons");
    expect(source).toContain('return "";');
    expect(source).toContain("clusters.map((cluster) =>");
    expect(source).toContain("uniqueFacesById");
    expect(source).not.toContain("return next[0]?.cluster_label");
  });

  it("offers browser FaceID sync from all manual gallery folders", () => {
    const source = read(faceReviewPanelPath);
    expect(source).toContain("indexAssetFacesFromBrowser");
    expect(source).toContain("getGalleryFaceIndexStatus");
    expect(source).toContain("includeAssets: true");
    expect(source).toContain("listFaceIndexAssetsAcrossGalleryFolders");
    expect(source).toContain("listGalleryAlbums(token, galleryId");
    expect(source).toContain("listAlbumAssets(token, album.id");
    expect(source).toContain("albumIsManualFolder");
    expect(source).toContain("function uniqueAssetsById(assets: Asset[])");
    expect(source).toContain("uniqueAssetsById([");
    expect(source).toContain("Math.max(");
    expect(source).toContain("Sync now");
    expect(source).toContain("FACE_INDEX_CONCURRENCY");
    expect(source).not.toContain("getAsset(");
  });

  it("links detected face identities to existing CRM contacts", () => {
    const source = read(faceReviewPanelPath);
    expect(source).toContain("listContacts");
    expect(source).toContain("linkClusterContact");
    expect(source).toContain("unlinkClusterContact");
    expect(source).toContain("CRM client link");
    expect(source).toContain("Linked to");
  });

  it("shows a distinct empty-index result instead of a no-match result", () => {
    const source = read(photoSearchPath);
    expect(source).toContain("result-index-empty");
    expect(source).toContain('result.index_status === "empty"');
    expect(source).toContain("FaceID is not synced for this gallery yet");
    expect(source).toContain("<FaceIdentityReviewPanel");
  });

  it("shows People Review on the Photo Search page while auto-syncing gallery photos", () => {
    const source = read(photoSearchPath);
    expect(source).toContain("autoSync");
    expect(source).toContain('mode="review"');
    expect(source).toContain("ResizableWorkspaceSplit");
    expect(source).toContain("gallery-photo-search-rail");
    expect(source).not.toContain('mode="sync-status"');
  });

  it("uses a portrait camera focus reticle for face capture", () => {
    const source = read(photoSearchPath);
    expect(source).toContain("h-[88%] w-[56%] rounded-full");
    expect(source).not.toContain("h-4/5 w-2/5 rounded-full");
    expect(source).not.toContain("h-2/3 w-2/3 rounded-full");
  });
});
