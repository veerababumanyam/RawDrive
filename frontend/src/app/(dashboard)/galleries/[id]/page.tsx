"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { bulkAssetAction, getAsset, type Asset } from "@/lib/api/assets";
import {
  addAlbumAssets,
  addAssetToGallery,
  createGalleryAlbum,
  galleryPublicUrl,
  getGallery,
  listAlbumAssets,
  listGalleryAlbums,
  listGalleryAssets,
  updateGallery,
  updateGalleryCover,
  type Gallery,
  type GalleryAlbum,
  type GalleryAsset,
} from "@/lib/api/galleries";
import { listProofingSelections, createComment, type ProofingSelection } from "@/lib/api/proofing";
import { getGalleryFavoritesSummary, type GalleryFavoritesSummary } from "@/lib/api/favorites";
import { ShareQrPopover } from "@/components/gallery/share-qr-popover";
import { EmbeddedVideosPanel } from "@/components/gallery/embedded-videos-panel";
import { readEmbeddedVideos, type EmbeddedVideo } from "@/lib/embedded-videos";
import {
  assetIsProcessing,
  getAssetPreviewUrl,
  proofingStatusClasses,
} from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Share, CheckCircle, EllipsisVertical, Trash } from "@/components/icons";
import { useUpload } from "@/hooks/use-upload";
import { useAssetReadySubscription } from "@/hooks/use-asset-ready-subscription";
import { PhotoLightbox } from "@/components/gallery/photo-lightbox";
// FaceFilter import removed 2026-05-18 — the chip strip was unmounted
// from the gallery page because it rendered as a row of "Unknown"
// pills. The window-event listener below (rawdrive:face-filter +
// rawdrive:face-filter-clear) is intentionally retained because
// public-gallery-enhancements still dispatches those events via the
// FaceID gate (GAL-FR-107/108). If the dashboard ever needs the chip
// strip back, re-add the import + the JSX render block.
import { GalleryAIPanel } from "@/components/gallery/gallery-ai-panel";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { DeliveryContinuityPanel } from "@/components/gallery/delivery-continuity-panel";
import { SalesContinuityPanel } from "@/components/gallery/sales-continuity-panel";

type GalleryAssetRecord = GalleryAsset & {
  asset: Asset | null;
};

// Filename-extension fallback for the image-file gate. The MIME-type
// check (file.type.startsWith("image/")) catches every JPEG/PNG/HEIC
// the OS recognises, but it misses raw photo formats that browsers
// don't classify as image/* (Canon CR2/CR3, Nikon NEF, Sony ARW,
// Adobe DNG, Fuji RAF, generic TIFF). Studios shoot these as a
// standard workflow, so we accept them by extension.
const ACCEPTED_RAW_EXT_RE = /\.(cr2|nef|arw|dng|raf|cr3|tiff?)$/i;

function isAcceptedImageFile(f: File): boolean {
  return f.type.startsWith("image/") || ACCEPTED_RAW_EXT_RE.test(f.name);
}

// MIME type list accepted by both the file picker and the folder
// picker. Mirrors handleDrop's filter so the user can't pick non-
// image files in the first place. Folder picker (webkitdirectory)
// honours `accept` only as a hint — the picker still lets the
// browser return everything inside the folder — so isAcceptedImageFile
// filters server-side too.
const FILE_INPUT_ACCEPT = "image/*,.cr2,.nef,.arw,.dng,.raf,.cr3,.tif,.tiff";

// Recursively flatten a DataTransferItemList (drag-and-drop source)
// into a flat File[]. Required when the user drops a FOLDER instead
// of files — `dataTransfer.files` is empty for folder drops, and the
// only way to reach the leaf files is via the webkitGetAsEntry +
// FileSystemDirectoryReader API. Reader returns entries in batches
// of <=100 per call, so we loop until empty.
//
// Returns the raw flattened set. Callers must apply isAcceptedImageFile
// themselves to keep parity with the file-picker path.
async function collectFilesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  // Minimal local typing for the webkit file-entry API. The DOM types
  // ship `FileSystemEntry` but DirectoryReader is omitted from lib.dom.d.ts
  // for some toolchains; defining narrow local interfaces avoids a
  // dependency on @types/filesystem and keeps the cast cost contained.
  interface FsEntry {
    isFile: boolean;
    isDirectory: boolean;
    file?: (cb: (file: File) => void) => void;
    createReader?: () => { readEntries: (cb: (entries: FsEntry[]) => void) => void };
  }
  const collected: File[] = [];

  const walk = (entry: FsEntry): Promise<void> => {
    if (entry.isFile && entry.file) {
      return new Promise((resolve) => {
        entry.file!((f) => {
          collected.push(f);
          resolve();
        });
      });
    }
    if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      return new Promise((resolve) => {
        const readBatch = () => {
          reader.readEntries((entries) => {
            if (entries.length === 0) { resolve(); return; }
            Promise.all(entries.map(walk)).then(() => readBatch());
          });
        };
        readBatch();
      });
    }
    return Promise.resolve();
  };

  const tasks: Promise<void>[] = [];
  for (const item of Array.from(items)) {
    // webkitGetAsEntry is the cross-browser shorthand for the FileSystem
    // Entry API. Supported in Chrome 13+, Edge, Firefox 50+, Safari 11.1+.
    // Returns null for non-file items (e.g. a string drag).
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => FsEntry | null;
    }).webkitGetAsEntry?.();
    if (entry) tasks.push(walk(entry));
  }
  await Promise.all(tasks);
  return collected;
}

export default function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [assets, setAssets] = useState<GalleryAssetRecord[]>([]);
  const [selections, setSelections] = useState<ProofingSelection[]>([]);
  // M41/105: aggregated guest favorites for this gallery. Null while
  // loading; an empty summary object once the request lands (even with
  // zero favorites). The dashboard tile reads total_favorites and
  // unique_assets_count to render "12 hearts across 4 photos" style.
  const [favoritesSummary, setFavoritesSummary] = useState<GalleryFavoritesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [proofingFilter, setProofingFilter] = useState<string | null>(null);
  // Face-filter state: when non-null, only assets whose id is in this
  // set are rendered in the grid. Populated by the rawdrive:face-filter
  // event that FaceFilter dispatches after fetching cluster assets.
  const [faceFilterIds, setFaceFilterIds] = useState<Set<string> | null>(null);
  // (Removed authToken state 2026-05-18 — only the FaceFilter chip strip
  // consumed it, and that surface was unmounted from this page. Other
  // gallery features read the access token via getStoredAccessToken()
  // on demand. Restore if a future surface needs a reactive token.)
  // Tracks the in-flight publish/unpublish request so the toggle button
  // can disable itself + show a "Saving…" state. Prevents double-submit
  // when the user clicks during the round-trip.
  const [publishing, setPublishing] = useState(false);
  // E71-S1: Album state
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [albumAssetIdsByAlbum, setAlbumAssetIdsByAlbum] = useState<Record<string, string[]>>({});
  const [activeAlbum, setActiveAlbum] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [showAlbumCreate, setShowAlbumCreate] = useState(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);
  const [openMenuAssetId, setOpenMenuAssetId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ assetId: string; filename: string; isBulk?: boolean } | null>(null);

  // E68-S1: Bulk selection state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId); else next.add(assetId);
      return next;
    });
  };
  const selectAllAssets = () => {
    setSelectedAssetIds(new Set(visibleAssets.map((a) => a.asset?.id).filter(Boolean) as string[]));
  };
  const clearSelection = () => { setSelectedAssetIds(new Set()); setBulkMode(false); };
  const handleBulkDelete = () => {
    if (selectedAssetIds.size === 0) return;
    setDeleteConfirm({
      assetId: "",
      filename: `${selectedAssetIds.size} photo${selectedAssetIds.size === 1 ? "" : "s"}`,
      isBulk: true,
    });
  };

  useEffect(() => {
    const token = getStoredAccessToken();

    if (!token) {
      setError("Your session expired. Please log in again.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadGallery = async () => {
      setLoading(true);
      setError("");

      try {
        const [galleryData, galleryAssets, gallerySelections, favSummary] = await Promise.all([
          getGallery(token, id),
          listGalleryAssets(token, id),
          listProofingSelections(token, id).catch((err) => { console.warn("Failed to load proofing selections:", err?.message); return []; }),
          // Favorites endpoint 404s if the table is empty for the
          // gallery (no, actually the backend returns zeros) — but
          // an outage shouldn't break the dashboard. Default to null
          // so the tile renders "—" instead of crashing the page.
          getGalleryFavoritesSummary(token, id).catch((err) => {
            console.warn("Failed to load favorites summary:", err?.message);
            return null;
          }),
        ]);

        const hydratedAssets = await Promise.all(
          galleryAssets.map(async (entry) => {
            try {
              const asset = await getAsset(token, entry.asset_id);
              return { ...entry, asset };
            } catch {
              return { ...entry, asset: null };
            }
          }),
        );

        if (cancelled) {
          return;
        }

        setGallery(galleryData);
        setAssets(hydratedAssets);
        setSelections(gallerySelections ?? []);
        setFavoritesSummary(favSummary);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load gallery.");
          setGallery(null);
          setAssets([]);
          setSelections([]);
          setFavoritesSummary(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadGallery();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const refreshAlbums = useCallback(async () => {
    const t = getStoredAccessToken();
    if (!t) return;
    try {
      const nextAlbums = await listGalleryAlbums(t, id);
      const memberships = await Promise.all(
        nextAlbums.map(async (album) => {
          const albumAssets = await listAlbumAssets(t, album.id).catch(() => []);
          return [album.id, albumAssets.map((item) => item.asset_id)] as const;
        }),
      );
      setAlbums(nextAlbums);
      setAlbumAssetIdsByAlbum(Object.fromEntries(memberships));
    } catch {
      setAlbums([]);
      setAlbumAssetIdsByAlbum({});
    }
  }, [id]);

  // E71-S1: Fetch albums for this gallery
  useEffect(() => {
    void refreshAlbums();
  }, [refreshAlbums]);

  const handleCreateAlbum = useCallback(async () => {
    const name = newAlbumName.trim();
    if (!name) return;
    const t = getStoredAccessToken();
    if (!t) return;

    setCreatingAlbum(true);
    setError("");
    try {
      const album = await createGalleryAlbum(t, id, { name });
      const selectedIds = Array.from(selectedAssetIds);
      if (selectedIds.length > 0) {
        await addAlbumAssets(t, album.id, selectedIds);
      }
      setNewAlbumName("");
      setShowAlbumCreate(false);
      // QA #17: previously setActiveAlbum fired BEFORE refreshAlbums
      // resolved, so visibleAssets (filtered by albumAssetIdsByAlbum[activeAlbum])
      // was computed against an empty map and the sub-gallery appeared
      // "unopenable" with zero photos. Await refreshAlbums first, THEN
      // switch the active album — by that point albumAssetIdsByAlbum
      // contains the new album's asset IDs.
      setSelectedAssetIds(new Set());
      setBulkMode(false);
      await refreshAlbums();
      setActiveAlbum(album.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sub-gallery");
    } finally {
      setCreatingAlbum(false);
    }
  }, [id, newAlbumName, refreshAlbums, selectedAssetIds]);

  // Prefer the *.rawdrive.in subdomain URL when the gallery has one
  // (every post-mig-120 gallery does). Append album query if provided —
  // the Next.js middleware passes querystring through to /g/[slug] so the
  // existing album-deep-link handler picks it up unchanged.
  const buildShareUrl = useCallback((albumId?: string) => {
    if (!gallery?.slug) return "";
    const base = galleryPublicUrl(gallery);
    if (!albumId) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}album=${encodeURIComponent(albumId)}`;
  }, [gallery?.slug, gallery?.subdomain_slug]);

  const copyShareUrl = useCallback(async (albumId?: string) => {
    if (!gallery?.is_published) {
      setShareMessage("Publish this gallery before sharing client links.");
      return;
    }
    const url = buildShareUrl(albumId);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage(albumId ? "Sub-gallery link copied." : "Gallery link copied.");
    } catch {
      setShareMessage(url);
    }
  }, [buildShareUrl, gallery?.is_published]);

  const handleShareAsset = useCallback(async (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    if (!gallery?.slug) return;
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/g/${gallery.slug}/photo/${assetId}`;
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as Navigator & { share: (d: { title: string; url: string }) => Promise<void> }).share({
          title: gallery.title || "Photo",
          url,
        });
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
    setCopiedAssetId(assetId);
    setTimeout(() => setCopiedAssetId(null), 2000);
  }, [gallery?.slug, gallery?.title]);

  const handleDeleteAsset = useCallback(async (assetId: string) => {
    const t = getStoredAccessToken();
    if (!t) return;
    try {
      await bulkAssetAction(t, "delete", [assetId]);
      setAssets((prev) => prev.filter((a) => a.asset?.id !== assetId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }, []);

  useEffect(() => {
    if (!openMenuAssetId) return;
    const close = () => setOpenMenuAssetId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuAssetId]);

  // Subscribe to face-filter events from the FaceFilter component. The
  // component doesn't know anything about the page's asset list — it
  // just dispatches the matched ID set via a window CustomEvent, and
  // the page reduces the rendered list to those IDs. Same contract
  // PublicGalleryGrid already uses for the public gallery view.
  useEffect(() => {
    function onFilter(e: Event) {
      const detail = (e as CustomEvent<{ assetIds: string[] }>).detail;
      if (!detail || !Array.isArray(detail.assetIds)) return;
      setFaceFilterIds(new Set(detail.assetIds));
    }
    function onFilterClear() {
      setFaceFilterIds(null);
    }
    window.addEventListener("rawdrive:face-filter", onFilter as EventListener);
    window.addEventListener("rawdrive:face-filter-clear", onFilterClear);
    return () => {
      window.removeEventListener("rawdrive:face-filter", onFilter as EventListener);
      window.removeEventListener("rawdrive:face-filter-clear", onFilterClear);
    };
  }, []);

  // Reduce the hydrated asset list to the face-filter match set when a
  // filter is active. useMemo keeps this stable when unrelated state
  // (upload progress, selections) changes.
  // Build a set of asset IDs that match the active proofing filter
  const proofingFilterAssetIds = useMemo(() => {
    if (!proofingFilter) return null;
    const ids = new Set<string>();
    for (const s of selections) {
      if (s.status === proofingFilter) ids.add(s.asset_id);
    }
    return ids;
  }, [proofingFilter, selections]);

  // Per-asset favorite count map. Built once from the summary's by_asset
  // breakdown so each tile in the grid below can render a small heart
  // badge with the guest-heart count for that photo. Empty map until the
  // summary lands or when no favorites exist — the lookup is a Map.get
  // which returns undefined and the badge renders conditionally on `> 0`.
  const favoritesCountByAsset = useMemo(() => {
    const map = new Map<string, number>();
    if (!favoritesSummary) return map;
    for (const row of favoritesSummary.by_asset) {
      map.set(row.asset_id, row.count);
    }
    return map;
  }, [favoritesSummary]);

  const visibleAssets = useMemo(() => {
    let result = assets;
    if (activeAlbum) {
      const albumAssetIds = new Set(albumAssetIdsByAlbum[activeAlbum] || []);
      result = result.filter((a) => a.asset && albumAssetIds.has(a.asset.id));
    }
    if (faceFilterIds) {
      result = result.filter((a) => a.asset && faceFilterIds.has(a.asset.id));
    }
    if (proofingFilterAssetIds) {
      result = result.filter((a) => a.asset && proofingFilterAssetIds.has(a.asset.id));
    }
    return result;
  }, [activeAlbum, albumAssetIdsByAlbum, assets, faceFilterIds, proofingFilterAssetIds]);

  // ──────── Upload Integration ────────
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  const token = getStoredAccessToken();
  const upload = useUpload(apiUrl, token);
  const linkedAssetIdsRef = useRef<Set<string>>(new Set());

  // Upload completion toast — fires when the active upload count
  // (uploading + pending + screening) transitions from >0 to 0 and at
  // least one item ended in `complete`. The previous UI kept the
  // progress panel mounted forever showing "Uploading 0 files" once
  // every item had finished; that was both confusing and visually
  // dead weight. Now the panel hides when activeCount===0 and the
  // user gets a single right-side toast with the success count.
  const activeUploadCount = upload.items.filter(
    (i) => i.status === "uploading" || i.status === "pending" || i.status === "screening",
  ).length;
  const completedUploadCount = upload.items.filter((i) => i.status === "complete").length;
  const failedUploadCount = upload.items.filter((i) => i.status === "error").length;
  // 2026-05-21: pre-flight rejections that also keep the panel mounted so
  // the user can see why a file didn't go through. Not retryable (same file
  // would block again) but explicitly dismissible.
  const blockedUploadCount = upload.items.filter(
    (i) => i.status === "blocked" || i.status === "needs_desktop",
  ).length;
  // Aggregate byte progress across all items that actually transmit (active
  // + complete + errored). Pre-flight rejections (blocked / needs_desktop)
  // are excluded — they never started uploading so their size is not part
  // of the "bytes-uploaded out of total" denominator.
  const byteProgressItems = upload.items.filter(
    (i) =>
      i.status === "uploading" ||
      i.status === "pending" ||
      i.status === "screening" ||
      i.status === "complete" ||
      i.status === "error",
  );
  const bytesTotal = byteProgressItems.reduce((sum, i) => sum + i.file.size, 0);
  const bytesUploaded = byteProgressItems.reduce(
    (sum, i) => sum + Math.floor(((i.status === "complete" ? 100 : i.progress) / 100) * i.file.size),
    0,
  );
  const overallBytePercent = bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
  const formatUploadBytes = (b: number): string => {
    if (b < 1024) return `${b} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let n = b / 1024;
    let u = 0;
    while (n >= 1024 && u < units.length - 1) { n /= 1024; u++; }
    return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[u]}`;
  };
  const uploadPanelOpen = activeUploadCount > 0 || failedUploadCount > 0 || blockedUploadCount > 0;
  const prevActiveUploadCountRef = useRef(0);
  const [uploadToast, setUploadToast] = useState<{
    visible: boolean;
    completed: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    const wasActive = prevActiveUploadCountRef.current > 0;
    const isIdle = activeUploadCount === 0;
    if (wasActive && isIdle && (completedUploadCount > 0 || failedUploadCount > 0)) {
      setUploadToast({
        visible: true,
        completed: completedUploadCount,
        failed: failedUploadCount,
      });
    }
    prevActiveUploadCountRef.current = activeUploadCount;
  }, [activeUploadCount, completedUploadCount, failedUploadCount]);

  // Auto-dismiss the toast after ~5s (mount → 4.5s visible → 0.5s
  // slide-out → unmount). Two-stage so the CSS transform animation
  // actually plays before the element is removed.
  useEffect(() => {
    if (!uploadToast?.visible) return;
    const slideOut = window.setTimeout(
      () => setUploadToast((t) => (t ? { ...t, visible: false } : null)),
      4500,
    );
    const unmount = window.setTimeout(() => setUploadToast(null), 5000);
    return () => {
      window.clearTimeout(slideOut);
      window.clearTimeout(unmount);
    };
  }, [uploadToast?.visible]);

  // Duplicate-filename block. The user reported uploading two files
  // with the same name created two asset rows for the same logical
  // photo — fixing it at the asset table is a migration job, so the
  // cheaper + better-UX fix is to refuse the duplicates at the upload
  // entry points (drop + file picker) before any chunk is ever sent.
  // Comparison is case-insensitive because filesystem behavior varies
  // (macOS HFS+ is case-insensitive by default; Windows is too) and
  // the studio almost never wants two photos that differ only in
  // upper/lower-case.
  const [duplicateWarning, setDuplicateWarning] = useState<{
    visible: boolean;
    duplicatesInGallery: string[];
    duplicatesInBatch: string[];
  } | null>(null);

  useEffect(() => {
    if (!duplicateWarning?.visible) return;
    const slideOut = window.setTimeout(
      () => setDuplicateWarning((t) => (t ? { ...t, visible: false } : null)),
      6500,
    );
    const unmount = window.setTimeout(() => setDuplicateWarning(null), 7000);
    return () => {
      window.clearTimeout(slideOut);
      window.clearTimeout(unmount);
    };
  }, [duplicateWarning?.visible]);

  // Filter incoming files into accepted (will upload) and rejected
  // (skipped as duplicates). Two reject buckets:
  //   - duplicatesInGallery: filename already exists on this gallery
  //     via the assets[] list we hydrate on mount
  //   - duplicatesInBatch: filename appears more than once in this
  //     drop/picker batch, OR matches a file currently in the upload
  //     queue (upload.items)
  // The accepted bucket excludes both. If anything was rejected, we
  // surface a slide-in warning with up to a handful of names + a
  // "+N more" tail so the toast doesn't grow unbounded.
  const dedupeIncomingFiles = useCallback(
    (incoming: File[]) => {
      const existingFilenames = new Set<string>();
      for (const entry of assets) {
        const fn = entry.asset?.filename;
        if (fn) existingFilenames.add(fn.toLowerCase());
      }
      const queuedFilenames = new Set<string>();
      for (const item of upload.items) {
        const status = item.status;
        if (status !== "complete" && status !== "error") {
          queuedFilenames.add(item.file.name.toLowerCase());
        }
      }

      const accepted: File[] = [];
      const duplicatesInGallery: string[] = [];
      const duplicatesInBatch: string[] = [];
      const seenInThisBatch = new Set<string>();
      for (const file of incoming) {
        const key = file.name.toLowerCase();
        if (existingFilenames.has(key)) {
          duplicatesInGallery.push(file.name);
        } else if (queuedFilenames.has(key) || seenInThisBatch.has(key)) {
          duplicatesInBatch.push(file.name);
        } else {
          accepted.push(file);
          seenInThisBatch.add(key);
        }
      }
      return { accepted, duplicatesInGallery, duplicatesInBatch };
    },
    [assets, upload.items],
  );

  // Assets whose thumbnails the background worker has not finished
  // producing yet. The gallery listing endpoint returns rows the
  // instant they are linked (the asset row exists, status is
  // "processing", thumbnail_urls is empty/null), so without this set
  // we'd render an immediate "Preview unavailable" tile and never
  // refresh it until the user reloads the page. The
  // useAssetReadySubscription hook below opens an SSE stream while
  // this set is non-empty and refetches each asset as the worker
  // completes it; entries are removed from the set inside that
  // callback once the refreshed asset row carries thumbnails.
  const pendingAssetIds = useMemo(
    () =>
      assets
        .filter((entry) => assetIsProcessing(entry.asset))
        .map((entry) => entry.asset?.id)
        .filter((id): id is string => typeof id === "string"),
    [assets],
  );

  const handleAssetReady = useCallback(
    async (assetId: string) => {
      const t = getStoredAccessToken();
      if (!t) return;
      try {
        const refreshed = await getAsset(t, assetId);
        setAssets((prev) =>
          prev.map((entry) =>
            entry.asset?.id === assetId ? { ...entry, asset: refreshed } : entry,
          ),
        );
      } catch (err) {
        // Worker said the asset is ready but the GET failed (transient
        // network blip, etc.). Leave the skeleton in place — a manual
        // page refresh, or the next upload-batch refetch, will recover.
        console.warn("asset.ready refetch failed", assetId, err);
      }
    },
    [],
  );

  useAssetReadySubscription({
    apiBase: apiUrl,
    token,
    pendingAssetIds,
    onAssetReady: handleAssetReady,
  });

  // Polling fallback for asset.ready transitions.
  //
  // The SSE subscription above is the primary path, but real-world
  // traffic in this dev environment showed it sometimes doesn't
  // connect at all — backend log audited 2026-05-18 confirmed the
  // thumbnail worker emits "thumbnail worker: processed <id>"
  // immediately but ZERO incoming GET /api/v1/events/stream requests
  // are ever made, so tiles stayed as "Processing photo..." until the
  // user manually refreshed. Suspect causes include:
  //   - accessTokenCache empty at the moment the SSE hook's effect
  //     runs (cookie-refresh path populates the cache asynchronously
  //     after first 401 instead of synchronously on mount)
  //   - StrictMode double-mount closing the connection before it
  //     finishes establishing
  //   - EventSource transient failures the hook silently swallows
  // Rather than chase the exact SSE root cause, a 4-second poll over
  // the pendingAssetIds set is a robust belt-and-suspenders fallback:
  // if SSE works, the tile flips immediately; if it doesn't, the poll
  // catches it within 4 seconds — still vastly better than "never
  // until the user refreshes". The interval clears the moment
  // pendingAssetIds is empty so steady-state cost is zero.
  useEffect(() => {
    if (pendingAssetIds.length === 0) return;
    const interval = window.setInterval(() => {
      for (const assetId of pendingAssetIds) {
        void handleAssetReady(assetId);
      }
    }, 4000);
    return () => window.clearInterval(interval);
  }, [pendingAssetIds, handleAssetReady]);

  // The active sub-album is read by the upload-link effect to decide
  // whether a newly-completed asset should also be added to that album.
  // Using a ref instead of an effect-dep lets us read the *current*
  // selected album at completion time without re-triggering the linker
  // every time the user toggles a chip. linkedAssetIdsRef still guards
  // against double-linking the same asset to the gallery, and the new
  // albumLinkedAssetIdsRef tracks which (asset, album) pairs we've
  // already pushed so the per-album add is also idempotent.
  const activeAlbumRef = useRef<string | null>(null);
  useEffect(() => {
    activeAlbumRef.current = activeAlbum;
  }, [activeAlbum]);
  const albumLinkedAssetIdsRef = useRef<Set<string>>(new Set());

  // Link each newly-completed upload to this gallery, then attach it to
  // the active sub-album (if any), then reload the asset + album views.
  // The "active sub-album" semantic is: photos land wherever the user is
  // currently looking. If they kicked off the upload from inside the
  // Favorites chip, the resulting assets show up in Favorites without
  // needing a separate drag-into-album step.
  useEffect(() => {
    const t = getStoredAccessToken();
    if (!t || !id) return;
    const toLink = upload.items.filter(
      (item) => item.status === "complete" && item.assetId && !linkedAssetIdsRef.current.has(item.assetId),
    );
    if (toLink.length === 0) return;

    (async () => {
      // Capture the active album once per batch run rather than on each
      // iteration so all assets from one upload batch land together
      // even if the user clicks a different chip mid-flight.
      const targetAlbumId = activeAlbumRef.current;
      const newlyAddedAssetIds: string[] = [];

      for (const item of toLink) {
        if (!item.assetId) continue;
        try {
          await addAssetToGallery(t, id, item.assetId, 0);
          linkedAssetIdsRef.current.add(item.assetId);
          newlyAddedAssetIds.push(item.assetId);
        } catch (err) {
          console.warn("Failed to link asset to gallery:", err);
        }
      }

      // Push the just-linked assets into the active sub-album. Skipped
      // when activeAlbum is null ("All Photos" view) — those uploads
      // are gallery-scope-only by design. The pair-key dedup means a
      // re-fire of this effect won't double-attach.
      if (targetAlbumId && newlyAddedAssetIds.length > 0) {
        const fresh = newlyAddedAssetIds.filter((assetId) => {
          const key = `${targetAlbumId}:${assetId}`;
          if (albumLinkedAssetIdsRef.current.has(key)) return false;
          albumLinkedAssetIdsRef.current.add(key);
          return true;
        });
        if (fresh.length > 0) {
          try {
            await addAlbumAssets(t, targetAlbumId, fresh);
          } catch (err) {
            console.warn("Failed to add uploads to sub-album:", err);
          }
        }
      }

      // Reload assets list after linking
      try {
        const galleryAssets = await listGalleryAssets(t, id);
        const hydratedAssets = await Promise.all(
          galleryAssets.map(async (entry) => {
            try {
              const asset = await getAsset(t, entry.asset_id);
              return { ...entry, asset };
            } catch {
              return { ...entry, asset: null };
            }
          }),
        );
        setAssets(hydratedAssets);
      } catch (err) {
        console.warn("Failed to reload assets after upload:", err);
      }

      // Refresh album memberships so the sub-gallery chip count
      // increments immediately. Without this the chip stays at its
      // pre-upload count until the next manual refresh.
      if (targetAlbumId) {
        await refreshAlbums();
      }
    })();
  }, [upload.items, id, refreshAlbums]);

  const [isDragOver, setIsDragOver] = useState(false);

  // submitFiles runs the dedupe gate then enqueues. Both the drop and
  // the file-picker handlers route through here so the duplicate
  // policy fires consistently from either entry point.
  const submitFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const { accepted, duplicatesInGallery, duplicatesInBatch } =
        dedupeIncomingFiles(files);
      if (duplicatesInGallery.length > 0 || duplicatesInBatch.length > 0) {
        setDuplicateWarning({
          visible: true,
          duplicatesInGallery,
          duplicatesInBatch,
        });
      }
      if (accepted.length > 0) upload.addFiles(accepted);
    },
    [dedupeIncomingFiles, upload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      // Folder drops surface as DataTransferItem entries whose
      // webkitGetAsEntry().isDirectory is true. `e.dataTransfer.files`
      // is empty in that case, so we must traverse items[] to reach the
      // leaf files. Pure-file drops fall back to .files so we don't
      // pay the async traversal cost when there is no folder to walk.
      const items = e.dataTransfer.items;
      const hasDirectory =
        items && Array.from(items).some((it) => {
          const entry = (it as DataTransferItem & {
            webkitGetAsEntry?: () => { isDirectory: boolean } | null;
          }).webkitGetAsEntry?.();
          return !!entry?.isDirectory;
        });
      if (hasDirectory) {
        collectFilesFromDataTransfer(items).then((all) => {
          submitFiles(all.filter(isAcceptedImageFile));
        });
        return;
      }
      const files = Array.from(e.dataTransfer.files).filter(isAcceptedImageFile);
      submitFiles(files);
    },
    [submitFiles],
  );

  const handleFileSelect = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = FILE_INPUT_ACCEPT;
    input.onchange = () => {
      if (input.files) submitFiles(Array.from(input.files).filter(isAcceptedImageFile));
    };
    input.click();
  }, [submitFiles]);

  // Folder-picker variant. Sets the `webkitdirectory` attribute (also
  // exposed as a DOM property) so the OS picker opens a folder
  // selector instead of a file selector — the user picks ONE folder
  // and the browser returns every file inside it, recursively. The
  // `accept` hint still applies but is treated as advisory by the
  // folder picker, so we additionally filter through
  // isAcceptedImageFile to discard stray .DS_Store / .ini / sidecar
  // files that ship inside a typical photo-shoot folder.
  //
  // Attribute is set via both the DOM property and the HTML attribute
  // for cross-browser coverage: Chromium and WebKit read the property;
  // Firefox reads only the attribute string. The cast suppresses
  // TypeScript's lib.dom complaint that `webkitdirectory` is not in
  // HTMLInputElement (it is, but with the legacy vendor prefix that
  // lib.dom omits from the public type for spec-stability reasons).
  const handleFolderSelect = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = FILE_INPUT_ACCEPT;
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.onchange = () => {
      if (input.files) {
        submitFiles(Array.from(input.files).filter(isAcceptedImageFile));
      }
    };
    input.click();
  }, [submitFiles]);

  const selectionCounts = useMemo(() => {
    if (!selections) return {};
    return selections.reduce<Record<string, number>>((counts, selection) => {
      counts[selection.status] = (counts[selection.status] || 0) + 1;
      return counts;
    }, {});
  }, [selections]);

  if (loading) {
    return (
      <div className="py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-surface-sunken" />
          <div className="grid gap-4">
            <div className="h-[420px] rounded-2xl bg-surface-sunken" />
          </div>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-text-secondary">{error || "Gallery not found."}</p>
        <Link href="/galleries" className="btn-tertiary mt-4 px-3 py-2 text-sm">
          Back to galleries
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
      <GalleryWorkspaceNav galleryId={gallery.id} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div>
            {editingTitle ? (
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={async () => {
                  if (draftTitle.trim() && draftTitle.trim() !== gallery.title) {
                    const t = getStoredAccessToken();
                    if (t) {
                      try {
                        const updated = await updateGallery(t, id, { title: draftTitle.trim() });
                        setGallery(updated);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to update title");
                      }
                    }
                  }
                  setEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") { setEditingTitle(false); setDraftTitle(gallery.title); }
                }}
                className="text-2xl font-semibold text-text-primary bg-transparent border-b-2 border-accent-primary focus:outline-none w-full"
                autoFocus
              />
            ) : (
              <h1
                className="text-2xl font-semibold text-text-primary cursor-pointer hover:text-accent-primary transition-colors group"
                onClick={() => { setDraftTitle(gallery.title); setEditingTitle(true); }}
                title="Click to edit title"
              >
                {gallery.title}
                <svg className="inline-block w-4 h-4 ml-2 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </h1>
            )}
            {editingDesc ? (
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                onBlur={async () => {
                  if (draftDesc !== (gallery.description || "")) {
                    const t = getStoredAccessToken();
                    if (t) {
                      try {
                        const updated = await updateGallery(t, id, { description: draftDesc.trim() });
                        setGallery(updated);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to update description");
                      }
                    }
                  }
                  setEditingDesc(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setEditingDesc(false); setDraftDesc(gallery.description || ""); }
                }}
                className="mt-2 w-full max-w-3xl text-sm leading-relaxed text-text-secondary bg-transparent border border-accent-primary rounded-lg px-3 py-2 focus:outline-none resize-none"
                rows={2}
                autoFocus
              />
            ) : (
              <p
                className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => { setDraftDesc(gallery.description || ""); setEditingDesc(true); }}
                title="Click to edit description"
              >
                {gallery.description || "Click to add a description…"}
              </p>
            )}
            {/* Settings quick links. Analytics link removed 2026-05-18:
                the underlying /galleries/[id]/analytics page was deleted
                in 64d9356 (R2→B2 storage migration cleanup) which left
                this <Link> pointing at a route that 404s. If gallery-
                level analytics is reintroduced later, restore the link
                here and re-add the · separator. */}
            <div className="mt-3 flex items-center gap-3">
              <Link
                href={`/galleries/${gallery.id}/cover`}
                className="text-xs text-accent-primary hover:underline"
              >
                Cover & Design
              </Link>
              <span className="text-text-tertiary">·</span>
              <Link
                href={`/galleries/${gallery.id}/settings`}
                className="text-xs text-accent-primary hover:underline"
              >
                Settings
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={gallery.is_published ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>
              {gallery.is_published ? "Published" : "Unpublished"}
            </span>
            {/* Inline Publish / Unpublish toggle. Previously the only
                publish affordance was the read-only status badge plus a
                Publish Checklist that listed blockers without ever
                offering the action — users had no way to flip the
                is_published flag from this screen. Now the button sits
                next to the status badge, calls the same updateGallery
                endpoint used for title/description edits, and re-renders
                with the new flag on success. The Share button next to
                "All Photos" already enforces is_published before copying
                a link, so this is the missing primary action that
                unblocks the share flow. */}
            <button
              type="button"
              disabled={publishing}
              onClick={async () => {
                const t = getStoredAccessToken();
                if (!t) return;
                setPublishing(true);
                try {
                  const updated = await updateGallery(t, id, { is_published: !gallery.is_published });
                  setGallery(updated);
                  setShareMessage(updated.is_published ? "Gallery published — client links are now live." : "Gallery unpublished.");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to change publish state");
                } finally {
                  setPublishing(false);
                }
              }}
              className={cn(
                "px-3 py-1 text-xs font-semibold rounded-lg transition-colors min-h-[28px]",
                publishing
                  ? "bg-surface-container-high text-text-tertiary cursor-wait"
                  : gallery.is_published
                  ? "border border-border-default text-text-secondary hover:bg-surface-container-low hover:text-text-primary"
                  : "bg-accent text-text-inverse hover:bg-accent-hover",
              )}
              title={gallery.is_published ? "Unpublish — client links will stop working" : "Publish — clients will be able to view this gallery"}
            >
              {publishing ? "Saving…" : gallery.is_published ? "Unpublish" : "Publish"}
            </button>
          </div>
        </div>

        <div id="share" className="flex flex-wrap gap-3">
          {/* In-dashboard preview — renders the saved Design Studio
              output through the same Hero+Grid components the public
              /g/[slug] route uses, but keeps the dashboard top menu bar
              visible. Works for unpublished galleries too because it
              fetches via the owner-scoped API. Includes its own Share
              button for copying the public URL. */}
          <Link
            href={`/galleries/${gallery.id}/preview`}
            className="btn-tertiary px-4 py-2.5 text-sm"
          >
            Preview
          </Link>
          {/* GAL-FR-118: view-as-client — opens the public gallery in client mode */}
          {gallery.slug && (
            <a
              href={`/g/${gallery.slug}?mode=client`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-tertiary px-4 py-2.5 text-sm"
            >
              View as client
            </a>
          )}
          <span className="status-badge status-badge--accent">
            Created {new Date(gallery.created_at).toLocaleDateString("en-IN")}
          </span>
        </div>
      </div>

      <div>
        <section className="space-y-4">

          {/* Upload panel — 2026-05-21: now persists while any upload is
              in-flight OR has failed / been blocked, so failures stay
              visible until the user retries or dismisses them. The "all
              done" terminal state (no active, no failed) still surfaces
              via the right-side toast and the panel auto-unmounts. */}
          {uploadPanelOpen && (
            <div className="surface-panel space-y-3 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-text-primary">
                  {(() => {
                    // 2026-05-21: header now reflects the visible row count
                    // accurately. Previous "Uploading 1 file" with two rows
                    // visible (one complete + one in-flight) was confusing —
                    // it counted only active items but the panel rendered
                    // every non-blocked item. Use "Uploading N of M files"
                    // when there's a mix.
                    const totalShown = byteProgressItems.length;
                    if (activeUploadCount > 0 && totalShown > activeUploadCount) {
                      return `Uploading ${completedUploadCount + 1} of ${totalShown} files`;
                    }
                    if (activeUploadCount > 0) {
                      return `Uploading ${activeUploadCount} ${activeUploadCount === 1 ? "file" : "files"}`;
                    }
                    if (failedUploadCount > 0) {
                      return `${failedUploadCount} upload${failedUploadCount === 1 ? "" : "s"} failed`;
                    }
                    return `${blockedUploadCount} upload${blockedUploadCount === 1 ? "" : "s"} blocked`;
                  })()}
                </h2>
                <div className="flex flex-wrap gap-2 justify-end">
                  {activeUploadCount > 0 && (
                    <>
                      {upload.isPaused ? (
                        <button onClick={upload.resumeAll} className="text-xs text-accent hover:underline">Resume All</button>
                      ) : (
                        <button onClick={upload.pauseAll} className="text-xs text-text-secondary hover:underline">Pause All</button>
                      )}
                      <button onClick={upload.cancelAll} className="text-xs text-danger hover:underline">Cancel All</button>
                    </>
                  )}
                  {activeUploadCount === 0 && failedUploadCount > 0 && (
                    <button onClick={upload.retryAll} className="text-xs text-accent hover:underline">
                      Retry All ({failedUploadCount})
                    </button>
                  )}
                  {activeUploadCount === 0 && (failedUploadCount > 0 || blockedUploadCount > 0) && (
                    <button onClick={upload.clearFinished} className="text-xs text-text-secondary hover:underline">
                      Dismiss
                    </button>
                  )}
                </div>
              </div>

              {/* Aggregate byte-based progress — total upload size and how
                  many bytes have actually transferred. Completed items
                  count at 100% of their size; pre-flight blocked items
                  don't contribute (they never started). */}
              {bytesTotal > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span>{formatUploadBytes(bytesUploaded)} of {formatUploadBytes(bytesTotal)}</span>
                    <span className="font-medium text-text-primary">{overallBytePercent}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-300"
                      style={{ width: `${overallBytePercent}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {upload.items.map((item) => {
                  // QA #22: surface low-severity scan findings (duplicates,
                  // near-duplicates, metadata warnings) next to the item so
                  // the photographer sees why a file was flagged, rather
                  // than the UI dropping them silently. High/medium
                  // severity findings already block the upload via the
                  // status="blocked" path.
                  const warnings = (item.scanManifest?.findings || []).filter(
                    (f) => f.severity === "low",
                  );
                  const isFailed = item.status === "error";
                  const isTerminal =
                    item.status === "complete" ||
                    item.status === "error" ||
                    item.status === "blocked" ||
                    item.status === "needs_desktop";
                  // 2026-05-21: per-row mini progress bar removed — it
                  // duplicated the aggregate bar at the top of the panel and
                  // created the "two progress bars" confusion. Rows now show
                  // filename + size + status badge + action buttons only;
                  // the aggregate bar communicates byte progress.
                  const statusLabel =
                    item.status === "complete" ? "Done" :
                    isFailed ? "Failed" :
                    item.status === "uploading" ? "Uploading…" :
                    item.status === "screening" ? "Screening" :
                    item.status === "pending" ? "Queued" :
                    item.status === "blocked" ? "Blocked" :
                    item.status === "needs_desktop" ? "Desktop" : item.status;
                  const statusTone =
                    item.status === "complete" ? "text-success" :
                    isFailed ? "text-danger" :
                    item.status === "blocked" || item.status === "needs_desktop" ? "text-feedback-warning" :
                    "text-text-secondary";
                  return (
                    <div key={item.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="truncate flex-1 text-text-primary">{item.file.name}</span>
                        <span className="text-text-tertiary tabular-nums">{formatUploadBytes(item.file.size)}</span>
                        <span className={`w-20 text-right ${statusTone}`}>{statusLabel}</span>
                        {isFailed && (
                          <button
                            onClick={() => upload.retry(item.id)}
                            className="text-xs text-accent hover:underline"
                            title="Retry this upload"
                          >
                            Retry
                          </button>
                        )}
                        {isTerminal && (
                          <button
                            onClick={() => upload.dismiss(item.id)}
                            className="text-xs text-text-tertiary hover:text-text-secondary"
                            title="Dismiss"
                            aria-label="Dismiss"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      {isFailed && item.error && (
                        <div className="pl-2 text-[10px] text-danger">
                          {item.error}
                        </div>
                      )}
                      {warnings.length > 0 && (
                        <div className="pl-2 text-[10px] text-feedback-warning">
                          ⚠ {warnings.length === 1
                            ? warnings[0].message
                            : `${warnings.length} scan warnings`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div id="photos" className="surface-panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Assets</h2>
              <div className="flex items-center gap-3">
                {bulkMode ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">{selectedAssetIds.size} of {visibleAssets.length} selected</span>
                    <button onClick={selectAllAssets} className="text-xs text-accent-primary hover:underline">Select All</button>
                    <button onClick={handleBulkDelete} disabled={selectedAssetIds.size === 0} className="btn-danger px-3 py-1.5 text-xs disabled:opacity-30">Delete</button>
                    <button onClick={clearSelection} className="text-xs text-text-tertiary hover:underline">Cancel</button>
                  </div>
                ) : (
                  <>
                    {assets.length > 0 && (
                      <button onClick={() => setBulkMode(true)} className="text-xs text-text-tertiary hover:text-text-primary">Select</button>
                    )}
                  </>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFileSelect}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    Upload Photos
                  </button>
                  <button
                    onClick={handleFolderSelect}
                    className="btn-tertiary px-3 py-1.5 text-xs"
                    title="Pick a folder — every photo inside (including subfolders) is uploaded."
                  >
                    Upload Folder
                  </button>
                </div>
              </div>
            </div>

            <div id="albums" className="rounded-xl border border-border-subtle bg-surface-sunken/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Sub-galleries</h3>
                  <p className="text-xs text-text-secondary">
                    Group photos for rituals, family sets, or client-only share links.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {gallery.slug && (
                    <ShareQrPopover
                      url={gallery.is_published ? buildShareUrl() : ""}
                      disabled={!gallery.is_published}
                      label="Show QR code for gallery link"
                      filename={`${gallery.slug}-gallery-qr`}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAlbumCreate(true)}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    New sub-gallery
                  </button>
                </div>
              </div>

              {shareMessage && (
                <p className="text-xs text-accent-primary">{shareMessage}</p>
              )}

              {showAlbumCreate && (
                <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-elevated p-3 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    placeholder="Sub-gallery name"
                    className="input-base min-w-0 flex-1 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleCreateAlbum();
                      if (e.key === "Escape") { setShowAlbumCreate(false); setNewAlbumName(""); }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateAlbum}
                    disabled={creatingAlbum || !newAlbumName.trim()}
                    className="btn-primary px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {selectedAssetIds.size > 0
                      ? `Create with ${selectedAssetIds.size} selected`
                      : creatingAlbum ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAlbumCreate(false); setNewAlbumName(""); }}
                    className="btn-tertiary px-3 py-2 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Mobile (<sm): collapse the chip strip into a single
                  dropdown + Share/QR action buttons. Wrapping five chips
                  onto separate lines wastes vertical space on phones; a
                  native <select> uses the system picker (much better UX
                  than custom dropdowns on mobile) and the Share/QR
                  buttons operate on whichever option is currently
                  selected. Hidden on sm+ where the full chip strip
                  below has room to breathe. */}
              <div className="flex items-center gap-2 sm:hidden">
                <select
                  value={activeAlbum ?? ""}
                  onChange={(e) => setActiveAlbum(e.target.value || null)}
                  className="min-w-0 flex-1 rounded-xl border border-border-default bg-surface-container px-3 py-2 text-sm font-semibold text-text-primary transition-colors focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                  aria-label="Select gallery view"
                >
                  <option value="">All Photos ({assets.length})</option>
                  {albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.name} ({albumAssetIdsByAlbum[album.id]?.length ?? 0})
                    </option>
                  ))}
                </select>
                {(() => {
                  // Derive the share metadata for whichever option the
                  // dropdown currently has selected. activeAlbum === null
                  // means "All Photos" — copyShareUrl/buildShareUrl with
                  // no argument is the gallery-wide canonical share URL.
                  const selectedAlbum = activeAlbum ? albums.find((a) => a.id === activeAlbum) : null;
                  const selectedLabel = selectedAlbum ? selectedAlbum.name : "All Photos";
                  const selectedSlug = selectedAlbum
                    ? selectedAlbum.name.toLowerCase().replace(/\s+/g, "-")
                    : "all-photos";
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => copyShareUrl(selectedAlbum?.id)}
                        className="shrink-0 rounded-xl border border-border-default bg-surface-container px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:border-accent-primary/60 hover:bg-surface-container-high hover:text-accent-primary"
                        title={`Copy ${selectedLabel} share link`}
                        aria-label={`Copy ${selectedLabel} share link`}
                      >
                        Share
                      </button>
                      <div className="shrink-0 flex items-center rounded-xl border border-border-default bg-surface-container transition-colors hover:border-accent-primary/60 hover:bg-surface-container-high">
                        <ShareQrPopover
                          url={gallery.is_published ? buildShareUrl(selectedAlbum?.id) : ""}
                          disabled={!gallery.is_published}
                          label={`Show QR code for ${selectedLabel} share link`}
                          filename={`${gallery.slug || "gallery"}-${selectedSlug}-qr`}
                        />
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Desktop (sm+): two-segment chip strip. Each chip is split
                  into a name+count-badge "select" segment and a "Share /
                  QR" action segment, separated by a subtle inner divider
                  so the secondary actions read as a related-but-distinct
                  cluster instead of crowding the chip label. Layout uses
                  flex-wrap so chips reflow onto multiple lines on narrow
                  viewports. Long album names truncate at ~14rem to keep
                  chip widths bounded. */}
              <div className="hidden flex-wrap items-center gap-2 sm:flex">
                <div
                  className={cn(
                    "group flex shrink-0 items-stretch overflow-hidden rounded-xl border transition-all",
                    !activeAlbum
                      ? "border-accent-primary bg-accent-subtle shadow-sm"
                      : "border-border-default bg-surface-container hover:border-accent-primary/60 hover:bg-surface-container-high",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveAlbum(null)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-colors",
                      !activeAlbum ? "text-accent-primary" : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    <span>All Photos</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                        !activeAlbum
                          ? "bg-accent-primary/15 text-accent-primary"
                          : "bg-surface-sunken text-text-tertiary",
                      )}
                    >
                      {assets.length}
                    </span>
                  </button>
                  <div className="flex items-center border-l border-border-subtle">
                    <button
                      type="button"
                      onClick={() => copyShareUrl()}
                      className="px-2 py-1.5 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-accent-primary"
                      title="Copy gallery share link"
                      aria-label="Copy gallery share link"
                    >
                      Share
                    </button>
                    <ShareQrPopover
                      url={gallery.is_published ? buildShareUrl() : ""}
                      disabled={!gallery.is_published}
                      label="Show QR code for All Photos share link"
                      filename={`${gallery.slug || "gallery"}-all-photos-qr`}
                    />
                  </div>
                </div>
                {albums.map((album) => {
                  const assetCount = albumAssetIdsByAlbum[album.id]?.length ?? 0;
                  // QA #18: per-album drop target. When a user drags selected
                  // assets (or a native file list) onto an album chip, assign
                  // those assets to the album via addAlbumAssets. This lets
                  // photographers re-organize the gallery without leaving the
                  // page. Native file drops are intentionally ignored here —
                  // new uploads go through the page-level dropzone; the album
                  // chip is only a sub-gallery-membership target.
                  // Album chip outline was `border-border-subtle` (~15%
                  // outline-variant) on top of the parent surface-panel —
                  // a barely-perceptible boundary. With album names like
                  // "Favorites", "Videos", "Raw" users couldn't see the
                  // chip edges and the row read as floating text. Now
                  // uses `border-border-default` for a visible boundary
                  // and `bg-surface-container` for chip depth. When an
                  // album is active, the chip switches to an accent
                  // border + accent-subtle fill so the selection state
                  // pops without depending on the inner button text
                  // colour alone.
                  const isActive = activeAlbum === album.id;
                  return (
                    <div
                      key={album.id}
                      className={cn(
                        "group flex shrink-0 items-stretch overflow-hidden rounded-xl border transition-all",
                        isActive
                          ? "border-accent-primary bg-accent-subtle shadow-sm"
                          : "border-border-default bg-surface-container hover:border-accent-primary/60 hover:bg-surface-container-high",
                      )}
                      onDragOver={(e) => {
                        const hasInternal = e.dataTransfer.types.includes("application/x-rawdrive-asset-ids");
                        if (hasInternal) {
                          e.preventDefault();
                          e.currentTarget.classList.add("ring-2", "ring-accent-primary");
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove("ring-2", "ring-accent-primary");
                      }}
                      onDrop={async (e) => {
                        e.currentTarget.classList.remove("ring-2", "ring-accent-primary");
                        const raw = e.dataTransfer.getData("application/x-rawdrive-asset-ids");
                        if (!raw) return;
                        e.preventDefault();
                        try {
                          const ids = JSON.parse(raw) as string[];
                          if (!Array.isArray(ids) || ids.length === 0) return;
                          const t = getStoredAccessToken();
                          if (!t) return;
                          await addAlbumAssets(t, album.id, ids);
                          await refreshAlbums();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed to add photos to sub-gallery");
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveAlbum(album.id)}
                        className={cn(
                          "flex max-w-[14rem] items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-colors",
                          isActive ? "text-accent-primary" : "text-text-secondary hover:text-text-primary",
                        )}
                        title={album.name}
                      >
                        <span className="truncate">{album.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                            isActive
                              ? "bg-accent-primary/15 text-accent-primary"
                              : "bg-surface-sunken text-text-tertiary",
                          )}
                        >
                          {assetCount}
                        </span>
                      </button>
                      <div className="flex items-center border-l border-border-subtle">
                        <button
                          type="button"
                          onClick={() => copyShareUrl(album.id)}
                          className="px-2 py-1.5 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-accent-primary"
                          title={`Copy ${album.name} share link`}
                          aria-label={`Copy ${album.name} share link`}
                        >
                          Share
                        </button>
                        <ShareQrPopover
                          url={gallery.is_published ? buildShareUrl(album.id) : ""}
                          disabled={!gallery.is_published}
                          label={`Show QR code for ${album.name} share link`}
                          filename={`${gallery.slug || "gallery"}-${album.name.toLowerCase().replace(/\s+/g, "-")}-qr`}
                        />
                      </div>
                    </div>
                  );
                })}
                {albums.length === 0 && (
                  <span className="text-xs text-text-tertiary">
                    Select photos, then create a sub-gallery.
                  </span>
                )}
              </div>
            </div>

            {/* "Filter by face" chip strip removed 2026-05-18 — it
                rendered as a row of "Unknown" pills because most
                clusters haven't been named, which read as broken UX.
                The same identity surface is available cleaner via
                the People tab (per-person tile + click-through to
                photos) and the Photo Search webcam flow. Both
                handle the un-named-cluster case better. The
                FaceFilter component file is retained — nothing
                else imports it but it's trivially re-wirable if a
                future iteration wants the chip strip back. */}

            {/* Drop zone — always visible, acts as upload target */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "rounded-2xl border-2 border-dashed px-6 py-8 text-center text-sm transition-colors cursor-pointer",
                isDragOver
                  ? "border-accent bg-accent/5 text-accent"
                  : "border-border-default bg-surface-sunken/40 text-text-secondary hover:border-accent/50 hover:bg-accent/[0.02]",
              )}
              onClick={handleFileSelect}
            >
              <p className="font-medium">{isDragOver ? "Drop photos or folders here" : "Drag photos or folders here, or click to browse"}</p>
              <p className="text-xs text-text-tertiary mt-1">
                JPEG, PNG, TIFF, RAW (CR2, NEF, ARW, DNG, RAF) — up to 2GB per file. Folders upload every photo inside, recursively.
              </p>
            </div>

            {assets.length === 0 && upload.items.length === 0 ? (
              <p className="text-center text-xs text-text-tertiary py-4">
                Upload your first photos to get started with this gallery.
              </p>
            ) : visibleAssets.length === 0 ? (
              <p className="text-center text-xs text-text-tertiary py-4">
                {proofingFilter
                  ? `No photos have been ${proofingFilter} by clients yet.`
                  : faceFilterIds
                    ? "No photos match the selected face filter."
                    : "No photos match the current filter."}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleAssets.map((entry) => {
                  const previewUrl = getAssetPreviewUrl(entry.asset || undefined, token);
                  // A freshly-uploaded asset lands in the listing instantly
                  // (POST /galleries/{id}/assets → 201) but the thumbnail
                  // worker takes up to ~10s to populate thumbnail_urls.
                  // Show a "Processing…" skeleton during that window so we
                  // don't render a broken/empty <img>. The
                  // useAssetReadySubscription hook above swaps the tile to
                  // the real preview as soon as the asset.ready SSE event
                  // arrives — no manual refresh needed.
                  const isProcessing = assetIsProcessing(entry.asset);
                  // M41/105 heart-count badge. We render a small pill on
                  // the top-right of every thumbnail whose asset has at
                  // least one guest heart, so the photographer can see at
                  // a glance which photos clients are responding to —
                  // without opening each one. The badge uses the danger
                  // accent token (red-ish in liquid-glass, gold-tinged in
                  // midnight) which already passes WCAG contrast against
                  // surface-panel in every theme.
                  const favoriteCount = entry.asset
                    ? favoritesCountByAsset.get(entry.asset.id) ?? 0
                    : 0;

                  return (
                    <article
                      key={entry.id}
                      className={cn("surface-panel cursor-pointer overflow-hidden transition-shadow hover:shadow-lg relative group", bulkMode && entry.asset && selectedAssetIds.has(entry.asset.id) && "ring-2 ring-accent-primary")}
                      // QA #18: in bulk mode, each tile is draggable. Drop
                      // target is the album chip above. Carries either the
                      // whole selection set (when the dragged asset is part
                      // of the selection) or just this one asset (when
                      // dragging an unselected tile).
                      draggable={!!entry.asset}
                      onDragStart={(e) => {
                        if (!entry.asset) return;
                        const ids = bulkMode && selectedAssetIds.has(entry.asset.id)
                          ? Array.from(selectedAssetIds)
                          : [entry.asset.id];
                        e.dataTransfer.setData("application/x-rawdrive-asset-ids", JSON.stringify(ids));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        if (bulkMode && entry.asset) { toggleAssetSelection(entry.asset.id); return; }
                        const idx = assets.findIndex((a) => a.id === entry.id);
                        if (idx !== -1) setLightboxIndex(idx);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`View ${entry.asset?.filename || "photo"}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          const idx = assets.findIndex((a) => a.id === entry.id);
                          if (idx !== -1) setLightboxIndex(idx);
                        }
                      }}
                    >
                      {bulkMode && entry.asset && (
                        <div className={`absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${selectedAssetIds.has(entry.asset.id) ? "bg-accent-primary border-accent-primary" : "border-white/60 bg-black/20"}`}>
                          {selectedAssetIds.has(entry.asset.id) && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                      )}
                      {favoriteCount > 0 && (
                        <div
                          className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm"
                          aria-label={`${favoriteCount} guest favorite${favoriteCount === 1 ? "" : "s"}`}
                        >
                          <svg className="h-3.5 w-3.5 text-accent-danger" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M12 21s-7-4.5-9.5-9C.5 8.5 2 4 6 4c2 0 3.5 1 4 2 .5-1 2-2 4-2 4 0 5.5 4.5 3.5 8-2.5 4.5-9.5 9-9.5 9z" />
                          </svg>
                          {favoriteCount}
                        </div>
                      )}
                      <div className="relative">
                        {isProcessing ? (
                          <div
                            className="flex aspect-[4/3] w-full animate-pulse items-center justify-center overflow-hidden bg-surface-sunken"
                            role="status"
                            aria-live="polite"
                            aria-label={
                              entry.asset?.filename
                                ? `Processing ${entry.asset.filename}`
                                : "Processing photo"
                            }
                          >
                            <div className="flex flex-col items-center gap-2 text-text-tertiary">
                              <div className="h-8 w-8 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
                              <span className="text-xs">Processing photo…</span>
                            </div>
                          </div>
                        ) : previewUrl ? (
                          <img
                            src={previewUrl}
                            alt={entry.asset?.filename || "Gallery asset preview"}
                            className="aspect-[4/3] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-sunken text-xs text-text-tertiary">
                            Preview unavailable
                          </div>
                        )}
                        {!bulkMode && entry.asset && !isProcessing && (
                          <div
                            className={cn(
                              "absolute bottom-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity",
                              openMenuAssetId === entry.asset.id && "!opacity-100",
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="relative">
                              <GlassIconButton
                                size="sm"
                                variant="ghost"
                                label="More options"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuAssetId((prev) => (prev === entry.asset!.id ? null : entry.asset!.id));
                                }}
                              >
                                <EllipsisVertical className="h-4 w-4" />
                              </GlassIconButton>
                              {openMenuAssetId === entry.asset.id && (
                                <div className="absolute bottom-full right-0 mb-1 min-w-[130px] rounded-xl border border-white/[0.08] bg-surface-container-high/95 backdrop-blur-md shadow-xl py-1 z-50">
                                  <button
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-on-surface hover:bg-white/[0.06] transition-colors rounded-t-xl"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuAssetId(null);
                                      void handleShareAsset(e, entry.asset!.id);
                                    }}
                                  >
                                    <Share className="h-4 w-4 text-text-secondary shrink-0" />
                                    <span>{copiedAssetId === entry.asset.id ? "Copied!" : "Share"}</span>
                                  </button>
                                  <button
                                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-white/[0.06] transition-colors rounded-b-xl"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMenuAssetId(null);
                                      setDeleteConfirm({ assetId: entry.asset!.id, filename: entry.asset!.filename || "this photo" });
                                    }}
                                  >
                                    <Trash className="h-4 w-4 shrink-0" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 p-4">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {entry.asset?.filename || "Unresolved asset"}
                        </p>
                        {entry.is_hero && (
                          <div className="flex items-center justify-end text-xs text-text-secondary">
                            <span className="status-badge status-badge--accent">Hero</span>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {gallery && (
              <EmbeddedVideosPanel
                galleryId={id}
                initialVideos={readEmbeddedVideos(gallery.settings as Record<string, unknown>)}
                onChange={(next: EmbeddedVideo[]) => {
                  setGallery((prev) =>
                    prev
                      ? { ...prev, settings: { ...(prev.settings ?? {}), embedded_videos: next } }
                      : prev,
                  );
                }}
              />
            )}
          </div>
        </section>

      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-surface-container-high p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-on-surface">
              {deleteConfirm.isBulk ? `Delete ${deleteConfirm.filename}?` : "Delete photo?"}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {deleteConfirm.isBulk
                ? `${deleteConfirm.filename.charAt(0).toUpperCase() + deleteConfirm.filename.slice(1)} will be permanently deleted. This cannot be undone.`
                : `"${deleteConfirm.filename}" will be permanently deleted. This cannot be undone.`}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.06]"
                onClick={() => setDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button
                className="btn-danger px-4 py-2 text-sm"
                onClick={() => {
                  const target = deleteConfirm;
                  setDeleteConfirm(null);
                  if (target.isBulk) {
                    void (async () => {
                      const t = getStoredAccessToken();
                      if (!t) return;
                      try {
                        await bulkAssetAction(t, "delete", Array.from(selectedAssetIds));
                        clearSelection();
                        window.location.reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Bulk delete failed");
                      }
                    })();
                  } else {
                    void handleDeleteAsset(target.assetId);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo lightbox */}
      {lightboxIndex !== null && assets[lightboxIndex]?.asset && (
        <PhotoLightbox
          asset={assets[lightboxIndex].asset!}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => setLightboxIndex((i) => (i !== null && i < assets.length - 1 ? i + 1 : i))}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < assets.length - 1}
          isProofing={gallery?.gallery_type === "proofing"}
          onComment={async (assetId, comment) => {
            const t = getStoredAccessToken();
            if (!t || !gallery) return;
            try {
              await createComment(t, gallery.id, {
                asset_id: assetId,
                author_name: "Studio",
                body: comment,
              });
            } catch (err) {
              console.error("Failed to post comment:", err);
            }
          }}
          // M13: feed filmstrip + compare mode + watermark overlay (FR-088,092,093,094)
          allAssets={assets.map((a) => a.asset).filter((a): a is Asset => a !== null)}
          gallery={gallery ?? undefined}
          onJumpTo={(targetId) => {
            const idx = assets.findIndex((a) => a.asset?.id === targetId);
            if (idx >= 0) setLightboxIndex(idx);
          }}
        />
      )}

      {/* Upload-complete toast — replaces the old "Uploading 0 files /
          100% complete" panel that lingered after every file was done.
          Slides in from the right, auto-dismisses after ~5s, dismissable
          on click. Two pieces of state on uploadToast:
            - visible:false keeps the element mounted so the slide-out
              transform animation can play before the 500ms unmount
              timer removes it from the tree
          Accessible: role=status (polite live region) so screen readers
          announce completion without stealing focus. */}
      {uploadToast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed top-6 right-6 z-50 min-w-[280px] max-w-sm",
            "rounded-xl border border-border-default bg-surface-raised/95 backdrop-blur-md",
            "shadow-xl shadow-black/20 px-4 py-3",
            "transition-all duration-500 ease-out",
            uploadToast.visible
              ? "translate-x-0 opacity-100"
              : "translate-x-[120%] opacity-0",
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                uploadToast.failed === 0
                  ? "bg-feedback-success/15 text-feedback-success"
                  : uploadToast.completed === 0
                    ? "bg-feedback-error/15 text-feedback-error"
                    : "bg-feedback-warning/15 text-feedback-warning",
              )}
              aria-hidden
            >
              {uploadToast.failed === 0 ? (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
            </div>
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-semibold text-text-primary">
                {uploadToast.failed === 0
                  ? `${uploadToast.completed} ${uploadToast.completed === 1 ? "photo" : "photos"} uploaded`
                  : uploadToast.completed === 0
                    ? `${uploadToast.failed} ${uploadToast.failed === 1 ? "upload" : "uploads"} failed`
                    : `${uploadToast.completed} uploaded · ${uploadToast.failed} failed`}
              </p>
              <p className="text-xs text-text-secondary">
                {uploadToast.failed === 0
                  ? "They'll appear in the gallery as soon as processing finishes."
                  : "Open the upload list to retry the failed items."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUploadToast((t) => (t ? { ...t, visible: false } : null))}
              className="-mr-1 -mt-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Duplicate-filename warning toast — fires from submitFiles
          when the dedupe gate skips one or more files. Same slide-in
          chrome as uploadToast (top-right, glass surface, dismiss-
          on-click) but separately stacked below if both happen to be
          visible (top-24 instead of top-6). Auto-dismisses after ~7s
          because users need a beat to read the listed filenames. */}
      {duplicateWarning && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed right-6 z-50 min-w-[300px] max-w-md",
            "rounded-xl border border-border-default bg-surface-raised/95 backdrop-blur-md",
            "shadow-xl shadow-black/20 px-4 py-3",
            "transition-all duration-500 ease-out",
            // If the upload-complete toast is currently visible, stack
            // beneath it. Otherwise occupy the same top-6 anchor.
            uploadToast?.visible ? "top-24" : "top-6",
            duplicateWarning.visible
              ? "translate-x-0 opacity-100"
              : "translate-x-[120%] opacity-0",
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-feedback-warning/15 text-feedback-warning"
              aria-hidden
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-text-primary">
                {(() => {
                  const total =
                    duplicateWarning.duplicatesInGallery.length +
                    duplicateWarning.duplicatesInBatch.length;
                  return `Skipped ${total} duplicate ${total === 1 ? "file" : "files"}`;
                })()}
              </p>
              {duplicateWarning.duplicatesInGallery.length > 0 && (
                <p className="text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">
                    Already in this gallery:
                  </span>{" "}
                  {formatDuplicateNames(duplicateWarning.duplicatesInGallery)}
                </p>
              )}
              {duplicateWarning.duplicatesInBatch.length > 0 && (
                <p className="text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">
                    Duplicate in this selection:
                  </span>{" "}
                  {formatDuplicateNames(duplicateWarning.duplicatesInBatch)}
                </p>
              )}
              <p className="text-[11px] text-text-tertiary pt-0.5">
                Rename the files locally and try again if you meant to upload them.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setDuplicateWarning((t) => (t ? { ...t, visible: false } : null))
              }
              className="-mr-1 -mt-1 inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-surface-sunken hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// formatDuplicateNames — show up to 3 filenames then "+N more" so the
// toast stays readable even if the user dragged in 47 dupes.
function formatDuplicateNames(names: string[]): string {
  const cap = 3;
  if (names.length <= cap) return names.join(", ");
  const head = names.slice(0, cap).join(", ");
  return `${head}, +${names.length - cap} more`;
}
