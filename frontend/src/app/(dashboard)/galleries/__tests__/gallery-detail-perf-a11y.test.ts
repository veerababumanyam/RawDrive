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

  // PERF-23: the dashboard must hydrate the grid from one bulk response
  // (?include_assets=true) instead of looping getAsset() per asset. The
  // bounded-concurrency helper stays as the fallback (F-045), but it must
  // short-circuit when the server already embedded the assets.
  it("PERF-23: grid requests server-embedded assets and skips the per-asset loop when present", () => {
    const source = readDetailPage();

    // Both gallery-asset list fetches opt into the embedded-asset response.
    expect(source).toContain("includeAssets: true");

    // hydrateGalleryAssets short-circuits when every entry already has an asset.
    expect(source).toMatch(/entry\.asset !== undefined/);
  });

  it("deduplicates gallery-asset junction rows by asset_id before hydration", () => {
    const source = readDetailPage();

    expect(source).toContain("dedupeGalleryAssetEntries");
    expect(source).toContain("seenAssetIds");
    expect(source).toContain("seenAssetIds.has(entry.asset_id)");
    expect(source).toContain(
      "const uniqueEntries = dedupeGalleryAssetEntries(entries)",
    );
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

  // PERF-24: the ~1090-line PhotoLightbox is an interaction-only modal, so it
  // must NOT sit in the route's first-load JS (measured 822 KB). It loads in an
  // async chunk via next/dynamic, mapping the named export.
  it("PERF-24: PhotoLightbox is dynamically imported, not statically bundled into the route", () => {
    const source = readDetailPage();

    // No static `import { PhotoLightbox } from ".../photo-lightbox"`.
    expect(source).not.toMatch(
      /import\s*{[^}]*\bPhotoLightbox\b[^}]*}\s*from\s*"@\/components\/gallery\/photo-lightbox"/,
    );

    // It must be loaded lazily via next/dynamic, resolving the named export.
    expect(source).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(\s*"@\/components\/gallery\/photo-lightbox"\s*\)\s*\.then\(/,
    );
  });

  it("keeps per-tile quick actions visible, named, and directly accessible", () => {
    const source = readDetailPage();

    expect(source).not.toContain(
      '"absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"',
    );
    expect(source).not.toContain("openMenuAssetId");
    expect(source).not.toContain("EllipsisVertical");
    expect(source).toContain("`Share ${entry.asset.filename}`");
    expect(source).toContain("`Delete ${entry.asset.filename}`");
    expect(source).toContain("void handleShareAsset(e, entry.asset!.id)");
    expect(source).toContain("setDeleteConfirm({");
    expect(source).toContain("assetId: entry.asset!.id");
    expect(source).toContain(
      'className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5"',
    );
    expect(source).toContain("if (e.currentTarget !== e.target) return;");
  });

  it("uses a gallery-scoped YouTube-style upload dialog instead of an inline-only uploader", () => {
    const source = readDetailPage();

    expect(source).toContain("showUploadDialog");
    expect(source).toContain('data-testid="gallery-upload-dialog"');
    expect(source).toContain("handleUploadDialogBack");
    expect(source).toContain('data-testid="upload-dialog-back"');
    expect(source).toContain("Back to gallery");
    expect(source).toContain("uploadDialogDismissed");
    expect(source).toContain("Back to gallery; uploads continue");
    expect(source).not.toContain("disabled={activeUploadCount > 0}");
    expect(source).toContain("upload.clearFinished()");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("Upload photos to gallery");
    expect(source).toContain("Camera JPEG/JFIF");
    expect(source).toContain("RAW, TIFF");
    expect(source).toContain("HEIC and AVIF use RawDrive Desktop");
    expect(source).toContain("Details");
    expect(source).toContain("Processing");
    expect(source).toContain("Visibility");
    expect(source).toContain("Select files");
    expect(source).toContain("Choose folder");
    expect(source).toContain("setShowUploadDialog(true)");
    expect(source).not.toContain("TetheredShootingPanel");
  });

  it("gates uploads on terms acceptance and replays the stashed batch after acceptance", () => {
    const source = readDetailPage();

    expect(source).toContain(
      "const [termsNeedsAcceptance, setTermsNeedsAcceptance] = useState(false)",
    );
    expect(source).toContain(
      "const [termsModalOpen, setTermsModalOpen] = useState(false)",
    );
    expect(source).toContain("const termsNeedsAcceptanceRef = useRef(false)");
    expect(source).toContain("const pendingUploadRef = useRef<{");
    expect(source).toContain("files: File[];");
    expect(source).toContain('options?: { source?: "manual" | "tethered" };');
    expect(source).toContain("getTermsStatus(token)");
    expect(source).toContain("onTermsRequired: openTermsModal");
    expect(source).toContain("if (termsNeedsAcceptanceRef.current) {");
    expect(source).toContain("pendingUploadRef.current = { files, options }");
    expect(source).toContain("setTermsModalOpen(true)");
    expect(source).toContain("termsNeedsAcceptanceRef.current = false");
    expect(source).toContain("pendingUploadRef.current = null");
    expect(source).toContain("submitFiles(pending.files, pending.options)");
    expect(source).toContain("<TermsAcceptanceModal");
    expect(source).toContain("onAccepted={handleTermsAccepted}");
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

  it("refreshes the gallery grid when uploads complete even before asset rows settle", () => {
    const source = readDetailPage();

    expect(source).toContain("completedUploadRefreshKey");
    expect(source).toContain('item.status === "complete"');
    expect(source).toContain("item.assetId || item.id");
    expect(source).toContain("completedUploadRefreshKeyRef");
    expect(source).toContain("[0, ...ASSET_SETTLE_REFRESH_DELAYS_MS]");
    expect(source).toContain("refreshGalleryAssets().catch");
    expect(source).toContain(
      "Failed to refresh gallery after upload completion",
    );
    expect(source).toContain("void refreshAlbums()");
    expect(source).toContain("Promise<GalleryAssetRecord[] | null>");
    expect(source).toContain(
      "const hydratedAssets = await refreshGalleryAssets()",
    );
  });

  it("keeps the upload dialog mobile-first by hiding desktop-only progress tabs and helper cards", () => {
    const source = readDetailPage();

    expect(source).toContain('data-testid="upload-mobile-status"');
    expect(source).toContain('data-testid="upload-mobile-tethered-capture"');
    expect(source).toContain('data-testid="upload-desktop-stepper"');
    expect(source).toContain('data-testid="upload-desktop-sidebar"');
    expect(source).toContain(
      "hidden border-b border-border-subtle px-6 py-4 md:grid",
    );
    expect(source).toContain("lg:hidden");
    expect(source).toContain("hidden space-y-4 lg:block");
    expect(source).toContain("max-h-[100dvh]");
    expect(source).toContain(
      "grid gap-4 overflow-y-auto p-4 sm:p-5 lg:grid-cols-3 lg:gap-6 lg:p-6",
    );
  });

  it("keeps the full tethered-capture control set with a 1-second default poll", () => {
    const source = readDetailPage();

    expect(source).toContain("TETHERED_DEFAULT_POLL_MS = 1000");
    expect(source).toContain("tetheredControlsVisible");
    expect(source).toContain(
      "const tetheredControlsVisible = tetheredControlsEnabled;",
    );
    expect(source).toContain("void startTetheredFolder();");
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
    expect(source).toContain(
      'variant === "desktop" ? "grid-cols-1" : "sm:grid-cols-3"',
    );
  });

  it("auto-opens tethered uploads after backend completion without leaving the upload dialog on top", () => {
    const source = readDetailPage();

    expect(source).toContain("const isTetheredUpload =");
    expect(source).toContain(
      "tetheredUploadSignaturesRef.current.has(uploadSignature)",
    );
    expect(source).toContain("if (isTetheredUpload) {");
    expect(source).toContain("newlyAddedTetheredAssetIds.push(item.assetId)");
    expect(source).toContain("setShowUploadDialog(false);");
    expect(source).toContain("setLightboxIndex(targetIndex)");
    expect(source).toContain("tetheredAutoOpenRef.current &&");
    expect(source).toContain("newlyAddedTetheredAssetIds.length > 0");
  });

  it("uses one accessible publish-state switch instead of a separate status badge and action button", () => {
    const source = readDetailPage();

    expect(source).toContain(
      'import { ToggleSwitch } from "@/components/ui/toggle-switch";',
    );
    expect(source).toContain("<ToggleSwitch");
    expect(source).toContain("checked={gallery.is_published}");
    expect(source).toContain('label="Gallery publish state"');
    expect(source).toContain('checkedLabel="Published"');
    expect(source).toContain('uncheckedLabel="Unpublished"');
    expect(source).toContain("data-mutation");
    expect(source.indexOf('title="Click to edit title"')).toBeLessThan(
      source.indexOf('label="Gallery publish state"'),
    );
    expect(source.indexOf('label="Gallery publish state"')).toBeLessThan(
      source.indexOf("{editingDesc ? ("),
    );
    expect(source).not.toContain(
      '<span className={gallery.is_published ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>',
    );
  });

  it("routes the published View-as-client action to the owner-scoped preview route, never the anonymous public URL", () => {
    // GAL-CORE-009 / PHO-GAL-009: "View as client" must render the exact client
    // experience for the OWNER. The public /g/[slug] route is anonymous, so for a
    // private gallery (the access_mode default — migration 041) it returns the
    // locked "This gallery is private" shell. Owner preview therefore goes through
    // the authenticated /galleries/[id]/preview route, matching the cover page and
    // share center (see route-contracts.test.ts). It stays publish-gated.
    const source = readDetailPage();
    const viewAsClientIndex = source.indexOf("View as client");
    const viewAsClientBlock = source.slice(
      Math.max(0, viewAsClientIndex - 400),
      viewAsClientIndex + 120,
    );

    expect(viewAsClientIndex).toBeGreaterThan(-1);
    expect(source).toContain("View as client");
    // Still only shown after publishing.
    expect(viewAsClientBlock).toContain("{gallery.is_published && (");
    // Owner-scoped preview route, not the anonymous public gallery URL.
    expect(viewAsClientBlock).toContain(
      "href={`/galleries/${gallery.id}/preview`}",
    );
    expect(viewAsClientBlock).not.toContain("mode=client");
    // Never regress to the un-publish-gated form.
    expect(viewAsClientBlock).not.toContain("{gallery.slug && (");
  });

  it("omits the sub-gallery management toggle while keeping delete actions reachable", () => {
    const source = readDetailPage();

    expect(source).not.toContain("managingAlbums");
    expect(source).not.toContain("aria-pressed={managingAlbums}");
    expect(source).not.toContain("Manage sub-galleries");
    expect(source).not.toContain("updateGalleryAlbum");
    expect(source).toContain("deleteGalleryAlbum");
    expect(source).toContain("albumIsEditable");
    expect(source).toContain("label={`Delete ${album.name}`}");
  });

  it("keeps sharing on canonical/editable sub-galleries while smart album chips stay filter-only", () => {
    const source = readDetailPage();

    expect(source).not.toContain("REQUIRED_SHARE_CONTACTS");
    expect(source).not.toContain("REQUIRED_SHARE_PHONE_LABEL");
    expect(source).not.toContain("buildShareWhatsAppHrefs");
    expect(source).not.toContain("WhatsApp share contacts");
    expect(source).not.toContain("<Phone");
    expect(source).not.toContain("ShareQrPopover");
    expect(source).not.toContain("Show QR code");
    expect(source).toContain("buildShareEmailHref");
    expect(source).toContain("openShareLink");
    expect(source).toContain('label="Copy All Photos share link"');
    expect(source).toContain('label="Email All Photos share link"');
    expect(source).toContain("const selectedIsShareable =");
    expect(source).toContain(
      "!selectedAlbum || albumIsEditable(selectedAlbum)",
    );
    expect(source).toContain("{selectedIsShareable && (");
    expect(source).toContain("{isEditableAlbum && (");
    expect(source).toContain("Smart utility");
    expect(source).toContain('data-testid="visibility-share-links"');
    expect(source).toContain('label="Copy gallery share link"');
    expect(source).toContain('label="Email gallery share link"');
    expect(source).toContain("label={`Delete ${album.name}`}");
    expect(source).toContain('variant="danger"');
    expect(source).toContain("Publish gallery");
    expect(source).toContain("Share links");
  });

  it("surfaces publish-required feedback for gallery and sub-gallery share actions", () => {
    const source = readDetailPage();

    expect(source).toContain("SHARE_UNAVAILABLE_MESSAGE");
    expect(source).toContain("aria-disabled={!gallery.is_published}");
    expect(source).toContain(
      "Publish this gallery before sharing client links.",
    );
  });

  it("does not show the upload sidebar processing helper card", () => {
    const source = readDetailPage();

    expect(source).not.toContain(
      "Photos are screened, encrypted, uploaded, and converted into WebP display files.",
    );
  });

  it("refreshes gallery rows shortly after initial load so late-linked processing photos update counts", () => {
    const source = readDetailPage();

    expect(source).toContain("ASSET_SETTLE_REFRESH_DELAYS_MS");
    expect(source).toContain("assetRowsSignature");
    expect(source).toContain(
      "refreshGalleryAssets({ skipIfRowsUnchanged: true })",
    );
    expect(source).toContain("late-linked assets");
  });

  it("starts tethered folder selection from Enable and shows controls after a watched folder exists", () => {
    const source = readDetailPage();
    const enableToggleStart = source.indexOf(
      "const handleTetheredEnableToggle = useCallback(() => {",
    );
    const enableToggleEnd = source.indexOf(
      "const handleDrop = useCallback",
      enableToggleStart,
    );
    const enableToggleBody = source.slice(enableToggleStart, enableToggleEnd);

    expect(source).toContain('data-testid="tethered-enable-toggle"');
    expect(source).toContain("tetheredEnabled");
    expect(source).toContain("setTetheredEnabled(true)");
    expect(source).toContain("setTetheredEnabled(false)");
    expect(source).toContain("handleTetheredEnableToggle");
    expect(source).toContain("Enable tethered capture");
    expect(source).toContain("Disable tethered capture");
    expect(source).toContain("startTetheredFolder");
    expect(source).toContain("const tetheredControlsEnabled =");
    expect(source).toContain("tetheredEnabled && Boolean(tetheredFolderName);");
    expect(source).toContain(
      "const tetheredControlsVisible = tetheredControlsEnabled;",
    );
    expect(enableToggleBody).toContain("void startTetheredFolder();");
  });
});
