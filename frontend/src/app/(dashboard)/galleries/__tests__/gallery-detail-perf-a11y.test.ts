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

  it("deduplicates gallery-asset junction rows by asset_id before hydration", () => {
    const source = readDetailPage();

    expect(source).toContain("dedupeGalleryAssetEntries");
    expect(source).toContain("seenAssetIds");
    expect(source).toContain("seenAssetIds.has(entry.asset_id)");
    expect(source).toContain("const uniqueEntries = dedupeGalleryAssetEntries(entries)");
    expect(source).toContain("uniqueEntries.length");
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

  it("keeps per-tile quick actions visible, named, and directly accessible", () => {
    const source = readDetailPage();

    expect(source).not.toContain(
      '"absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"',
    );
    expect(source).not.toContain("openMenuAssetId");
    expect(source).not.toContain("EllipsisVertical");
    expect(source).toContain('`Share ${entry.asset.filename}`');
    expect(source).toContain('`Delete ${entry.asset.filename}`');
    expect(source).toContain("void handleShareAsset(e, entry.asset!.id)");
    expect(source).toContain("setDeleteConfirm({ assetId: entry.asset!.id");
    expect(source).toContain('className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5"');
    expect(source).toContain("if (e.currentTarget !== e.target) return;");
  });

  it("uses a gallery-scoped YouTube-style upload dialog instead of an inline-only uploader", () => {
    const source = readDetailPage();

    expect(source).toContain("showUploadDialog");
    expect(source).toContain('data-testid="gallery-upload-dialog"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("Upload photos to gallery");
    expect(source).toContain("Details");
    expect(source).toContain("Processing");
    expect(source).toContain("Visibility");
    expect(source).toContain("Select files");
    expect(source).toContain("Choose folder");
    expect(source).toContain("setShowUploadDialog(true)");
  });

  it("shows only completed backend WebP as the upload dropzone background", () => {
    const source = readDetailPage();

    expect(source).toContain("uploadPreviewBackendAsset");
    expect(source).toContain("UPLOAD_DROPZONE_BACKEND_PREVIEW_VARIANTS");
    expect(source).toContain('item.status === "complete" && item.assetId');
    expect(source).toContain("completedAssetIds.has(entry.asset.id)");
    expect(source).not.toContain("uploadPreviewUrl");
    expect(source).not.toContain("URL.createObjectURL");
    expect(source).not.toContain("URL.revokeObjectURL");
    expect(source).not.toContain('data-testid="upload-dropzone-preview"');
    expect(source).toContain('data-testid="upload-dropzone-backend-preview"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain('alt=""');
    expect(source).toContain("bg-surface-scrim/70");
    expect(source).not.toContain("blur-xl");
    expect(source).not.toContain("scale-110");
  });

  it("keeps the upload dialog mobile-first by hiding desktop-only progress tabs and helper cards", () => {
    const source = readDetailPage();

    expect(source).toContain('data-testid="upload-mobile-status"');
    expect(source).toContain('data-testid="upload-mobile-tethered-capture"');
    expect(source).toContain('data-testid="upload-desktop-stepper"');
    expect(source).toContain('data-testid="upload-desktop-sidebar"');
    expect(source).toContain("hidden border-b border-border-subtle px-6 py-4 md:grid");
    expect(source).toContain("lg:hidden");
    expect(source).toContain("hidden space-y-4 lg:block");
    expect(source).toContain("max-h-[100dvh]");
    expect(source).toContain("grid gap-4 overflow-y-auto p-4 sm:p-5 lg:grid-cols-3 lg:gap-6 lg:p-6");
  });

  it("keeps the full tethered-capture control set with a 1-second default poll", () => {
    const source = readDetailPage();

    expect(source).toContain("TETHERED_DEFAULT_POLL_MS = 1000");
    expect(source).toContain("tetheredControlsVisible");
    expect(source).toContain("{tetheredControlsVisible && (");
    expect(source).toContain("tetheredPollIntervalMs");
    expect(source).toContain('data-testid="tethered-poll-slider"');
    expect(source).toContain('data-testid="tethered-recursive-toggle"');
    expect(source).toContain('data-testid="tethered-newest-first-toggle"');
    expect(source).toContain('data-testid="tethered-auto-open-toggle"');
    expect(source).toContain('data-testid="tethered-sound-toggle"');
    expect(source).toContain('data-testid="tethered-pause-toggle"');
    expect(source).toContain('data-testid="tethered-stop-button"');
    expect(source).toContain('data-testid="tethered-session-count"');
    expect(source).toContain("tetheredIncludeSubfolders");
    expect(source).toContain("tetheredNewestFirst");
    expect(source).toContain("tetheredAutoOpen");
    expect(source).toContain("tetheredSoundEnabled");
    expect(source).toContain("playTetheredDing");
    expect(source).toContain("queryPermission");
    expect(source).toContain("requestPermission");
    expect(source).toContain("Last detected:");
    expect(source).toContain("tetheredAutoOpenRef.current");
  });

  it("auto-opens tethered uploads after backend completion without leaving the upload dialog on top", () => {
    const source = readDetailPage();

    expect(source).toContain("const isTetheredUpload = tetheredUploadSignaturesRef.current.has(uploadSignature)");
    expect(source).toContain("if (isTetheredUpload) {");
    expect(source).toContain("newlyAddedTetheredAssetIds.push(item.assetId)");
    expect(source).toContain("setShowUploadDialog(false);");
    expect(source).toContain("setLightboxIndex(targetIndex)");
    expect(source).toContain("tetheredAutoOpenRef.current && newlyAddedTetheredAssetIds.length > 0");
  });

  it("uses one accessible publish-state switch instead of a separate status badge and action button", () => {
    const source = readDetailPage();

    expect(source).toContain('role="switch"');
    expect(source).toContain("aria-checked={gallery.is_published}");
    expect(source).toContain("publish-state-toggle");
    expect(source).toContain("publish-state-toggle__track");
    expect(source).not.toContain(
      '<span className={gallery.is_published ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>',
    );
  });

  it("shows the public View-as-client link only after the gallery is published", () => {
    const source = readDetailPage();
    const viewAsClientIndex = source.indexOf("View as client");
    const viewAsClientBlock = source.slice(
      Math.max(0, viewAsClientIndex - 300),
      viewAsClientIndex + 120,
    );

    expect(viewAsClientIndex).toBeGreaterThan(-1);
    expect(viewAsClientBlock).toContain("{gallery.is_published && gallery.slug && (");
    expect(source).toContain("View as client");
    expect(viewAsClientBlock).not.toContain("{gallery.slug && (");
  });

  it("adds a sub-gallery management toggle with real rename and delete controls", () => {
    const source = readDetailPage();

    expect(source).toContain("managingAlbums");
    expect(source).toContain('aria-pressed={managingAlbums}');
    expect(source).toContain("Manage sub-galleries");
    expect(source).toContain("updateGalleryAlbum");
    expect(source).toContain("deleteGalleryAlbum");
    expect(source).toContain("editingAlbumId");
    expect(source).toContain("albumIsEditable");
    expect(source).toContain('label={`Rename ${album.name}`}');
    expect(source).toContain('label={`Delete ${album.name}`}');
    expect(source).toContain("!albumIsEditable(album)");
  });

  it("keeps sub-gallery sharing complete with copy, email, QR, and delete actions without phone buttons", () => {
    const source = readDetailPage();

    expect(source).not.toContain("REQUIRED_SHARE_CONTACTS");
    expect(source).not.toContain("REQUIRED_SHARE_PHONE_LABEL");
    expect(source).not.toContain("buildShareWhatsAppHrefs");
    expect(source).not.toContain("WhatsApp share contacts");
    expect(source).not.toContain("<Phone");
    expect(source).toContain("buildShareEmailHref");
    expect(source).toContain("openShareLink");
    expect(source).toContain('label="Copy All Photos share link"');
    expect(source).toContain('label="Email All Photos share link"');
    expect(source).toContain('label={`Show QR code for ${album.name} share link`}');
    expect(source).toContain('data-testid="visibility-share-links"');
    expect(source).toContain('label="Copy gallery share link"');
    expect(source).toContain('label="Email gallery share link"');
    expect(source).toContain('label="Show QR code for gallery share link"');
    expect(source).toContain('label={`Delete ${album.name}`}');
    expect(source).toContain('variant="danger"');
    expect(source).toContain("Publish gallery");
    expect(source).toContain("Share links");
  });

  it("surfaces publish-required feedback for gallery and sub-gallery QR actions", () => {
    const source = readDetailPage();

    expect(source).toContain("SHARE_UNAVAILABLE_MESSAGE");
    expect(source).toContain('onUnavailable={() => setShareMessage(SHARE_UNAVAILABLE_MESSAGE)}');
    expect(source).toContain('aria-disabled={!gallery.is_published}');
    expect(source).toContain("Publish this gallery before sharing client links.");
  });

  it("refreshes gallery rows shortly after initial load so late-linked processing photos update counts", () => {
    const source = readDetailPage();

    expect(source).toContain("ASSET_SETTLE_REFRESH_DELAYS_MS");
    expect(source).toContain("assetRowsSignature");
    expect(source).toContain("refreshGalleryAssets({ skipIfRowsUnchanged: true })");
    expect(source).toContain("late-linked assets");
  });

  it("keeps tethered capture behind an Enable switch and starts watching only from Watch folder", () => {
    const source = readDetailPage();
    const enableToggleStart = source.indexOf("const handleTetheredEnableToggle = useCallback(() => {");
    const enableToggleEnd = source.indexOf("const handleDrop = useCallback", enableToggleStart);
    const enableToggleBody = source.slice(enableToggleStart, enableToggleEnd);

    expect(source).toContain('data-testid="tethered-enable-toggle"');
    expect(source).toContain('data-testid="tethered-watch-folder-button"');
    expect(source).toContain("tetheredEnabled");
    expect(source).toContain("setTetheredEnabled(true)");
    expect(source).toContain("setTetheredEnabled(false)");
    expect(source).toContain("handleTetheredEnableToggle");
    expect(source).toContain("Enable tethered capture");
    expect(source).toContain("Disable tethered capture");
    expect(source).toContain("startTetheredFolder");
    expect(source).toContain("onClick={startTetheredFolder}");
    expect(source).toContain("const tetheredControlsEnabled = tetheredEnabled && Boolean(tetheredFolderName);");
    expect(source).toContain("const tetheredControlsVisible = tetheredEnabled;");
    expect(enableToggleBody).not.toContain("startTetheredFolder");
    expect(enableToggleBody).not.toContain("void startTetheredFolder()");
  });
});
