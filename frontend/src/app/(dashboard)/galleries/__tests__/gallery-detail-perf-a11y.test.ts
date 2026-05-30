import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-static regression tests for the gallery detail page
// (galleries/[id]/page.tsx). These mirror the F-042 style in
// route-contracts.test.ts: read the file and assert structural
// guarantees that the audit findings F-043/F-045/F-046/F-047 require.
// They fail against the pre-fix source and pass after the fix, with no
// DB, network, or render harness needed.

const repoRoot = path.resolve(__dirname, "../../../../..");
const detailPagePath = path.join(
  repoRoot,
  "src/app/(dashboard)/galleries/[id]/page.tsx",
);

function readDetailPage(): string {
  return fs.readFileSync(detailPagePath, "utf8");
}

describe("gallery detail page — perf & a11y contracts", () => {
  // F-043: both toast dismiss controls were raw <button> wrappers around an
  // inline close-glyph <svg> sized h-6 w-6 (24px) — a compound violation
  // (ad-hoc icon button + sub-44px touch target). They must render via the
  // shared GlassIconButton + the registry XMark icon instead.
  it("F-043: toast dismiss buttons use GlassIconButton + registry XMark, not raw <button>+svg", () => {
    const source = readDetailPage();

    // XMark must be imported from the icon registry and used.
    expect(source).toMatch(
      /import\s*{[^}]*\bXMark\b[^}]*}\s*from\s*"@\/components\/icons"/,
    );
    expect(source).toContain("<XMark");

    // No hand-rolled close-glyph SVG path may remain anywhere on this page.
    expect(source).not.toContain("M6 18L18 6M6 6l12 12");

    // No sub-44px (h-6 w-6 = 24px) inline-flex icon button may remain.
    expect(source).not.toContain("inline-flex h-6 w-6");

    // Both dismiss actions must be wired through GlassIconButton with a label.
    const dismissButtons = source.match(
      /<GlassIconButton[^>]*label="Dismiss"/g,
    );
    expect(dismissButtons?.length ?? 0).toBe(2);
  });

  // F-045: hydration must not fire one getAsset() per entry concurrently via
  // an unbounded Promise.all(entries.map(getAsset)). It must run through the
  // bounded-concurrency worker pool so the HTTP/1.1 connection pool is not
  // saturated on large galleries.
  it("F-045: asset hydration goes through a bounded-concurrency helper, not unbounded Promise.all(map(getAsset))", () => {
    const source = readDetailPage();

    // The bounded helper and its concurrency cap must exist.
    expect(source).toContain("hydrateGalleryAssets");
    expect(source).toContain("HYDRATE_CONCURRENCY");

    // The unbounded per-entry pattern must be gone (it called getAsset
    // directly inside galleryAssets.map under a Promise.all).
    expect(source).not.toMatch(/galleryAssets\.map\(async/);
  });

  // F-046: the grid must render a bounded window of the filtered assets with
  // a load-more affordance, not map the entire visibleAssets set at once.
  it("F-046: grid renders a paged window with a Load-more control, not the full set", () => {
    const source = readDetailPage();

    // The grid must iterate the paged slice, never the full filtered list.
    expect(source).toContain("pagedAssets.map(");
    expect(source).not.toContain("visibleAssets.map((entry)");

    // The windowing machinery must be present.
    expect(source).toContain("GRID_PAGE_SIZE");
    expect(source).toContain("visibleLimit");
    expect(source).toContain("Load more photos");
  });

  // F-047: every grid thumbnail must defer its network fetch and decode so a
  // 100+ photo gallery does not fire all thumbnail requests on first paint.
  it("F-047: grid thumbnails set loading=lazy and decoding=async", () => {
    const source = readDetailPage();
    expect(source).toContain('loading="lazy"');
    expect(source).toContain('decoding="async"');
  });
});
