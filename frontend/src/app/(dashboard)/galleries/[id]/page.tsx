"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import {
  bulkAssetAction,
  deleteAsset,
  getAsset,
  type Asset,
} from "@/lib/api/assets";
import {
  addAlbumAssets,
  createGalleryAlbum,
  createGalleryShareLink,
  deleteGalleryAlbum,
  galleryPublicUrl,
  getGallery,
  listGalleryAlbums,
  listGalleryAssets,
  updateGallery,
  type Gallery,
  type GalleryAlbum,
  type GalleryAsset,
} from "@/lib/api/galleries";
import {
  listProofingSelections,
  createComment,
  listComments,
  updateSelectionStatus,
  type ProofingComment,
  type ProofingSelection,
} from "@/lib/api/proofing";
import {
  getGalleryFavoritesSummary,
  type GalleryFavoritesSummary,
} from "@/lib/api/favorites";
import { readEmbeddedVideos, type EmbeddedVideo } from "@/lib/embedded-videos";
import { assetIsProcessing } from "@/lib/dashboard-ui";
import { getOrCreateGalleryMediaKey } from "@/lib/media-encryption/media-key-store";
import {
  appendStoredGalleryKeyFragment,
  setUrlSearchParamBeforeFragment,
} from "@/lib/media-encryption/share-url";
import { GRID_VARIANTS } from "@/lib/media-encryption/asset-media";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { browserE2EEMaxUploadSizeLabel } from "@/lib/media-encryption/browser-upload-support";
import {
  FILE_PICKER_STILL_IMAGE_ACCEPT,
  isAcceptedStillImageFile,
} from "@/lib/still-image-formats";
import { visibleUploadWarnings } from "@/lib/upload-screening/visible-findings";
import {
  getWorkspaceProfile,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { cn } from "@/lib/utils";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Share,
  Trash,
  XMark,
  Plus,
  CheckCircle,
  Shield,
  Envelope,
  ChevronLeft,
} from "@/components/icons";
import { useUpload } from "@/hooks/use-upload";
import { TermsAcceptanceModal } from "@/components/legal/terms-acceptance-modal";
import { getTermsStatus } from "@/lib/api/legal";
import { useAssetReadySubscription } from "@/hooks/use-asset-ready-subscription";
import dynamic from "next/dynamic";
import {
  GalleryViewSwitcher,
  useGalleryViewMode,
  type GalleryViewMode,
} from "@/components/gallery/gallery-view-switcher";
// FaceFilter import removed 2026-05-18 — the chip strip was unmounted
// from the gallery page because it rendered as a row of "Unknown"
// pills. The window-event listener below (rawdrive:face-filter +
// rawdrive:face-filter-clear) is intentionally retained because
// public-gallery-enhancements still dispatches those events via the
// FaceID gate (GAL-FR-107/108). If the dashboard ever needs the chip
// strip back, re-add the import + the JSX render block.
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { galleryShareExpiryDays } from "@/lib/gallery-share-expiry";

// PhotoLightbox (~1090 lines) only mounts when a tile is opened, so load it in
// an async chunk instead of the gallery-detail route's first-load JS (PERF-24,
// measured 822 KB). ssr:false is safe — this is a client route and the lightbox
// is an interaction-only modal that never renders on the server.
const PhotoLightbox = dynamic(
  () =>
    import("@/components/gallery/photo-lightbox").then((m) => m.PhotoLightbox),
  { ssr: false },
);

// PERF-SPLIT: the embedded-videos manager is a self-contained panel that
// only renders once the gallery has loaded and sits below the grid. It
// pulls in the YouTube/Vimeo URL parser + iframe grid, so load it in an
// async chunk instead of the gallery-detail route's first-load JS. ssr:false
// is safe — this is a "use client" editor panel that never renders on the
// server.
const EmbeddedVideosPanel = dynamic(
  () =>
    import("@/components/gallery/embedded-videos-panel").then(
      (m) => m.EmbeddedVideosPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-32 w-full animate-pulse rounded-2xl border border-border-subtle bg-surface-sunken"
        aria-busy="true"
        aria-label="Loading embedded videos"
      />
    ),
  },
);

type GalleryAssetRecord = GalleryAsset & {
  asset: Asset | null;
};

type TetheredDirectoryEntry = {
  kind: "directory";
  name: string;
  queryPermission?: (descriptor?: {
    mode?: "read" | "readwrite";
  }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: {
    mode?: "read" | "readwrite";
  }) => Promise<PermissionState>;
  values: () => AsyncIterable<TetheredDirectoryEntry | TetheredFileEntry>;
};

type TetheredFileEntry = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
};

type TetheredDirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?:
      | "desktop"
      | "documents"
      | "downloads"
      | "music"
      | "pictures"
      | "videos";
  }) => Promise<TetheredDirectoryEntry>;
};

type TetheredFreshFile = {
  file: File;
  path: string;
  lastModified: number;
};

type TetheredSeenFile = {
  lastModified: number;
  size: number;
};

const TETHERED_DEFAULT_POLL_MS = 1000;
const TETHERED_MIN_POLL_MS = 1000;
const TETHERED_MAX_POLL_MS = 5000;
const TETHERED_POLL_STEP_MS = 500;
const SHARE_UNAVAILABLE_MESSAGE =
  "Publish this gallery before sharing client links.";
const ASSET_SETTLE_REFRESH_DELAYS_MS = [1200, 4000] as const;
const UPLOAD_DROPZONE_BACKEND_PREVIEW_VARIANTS = [
  "display_webp",
  "thumb_lg_webp",
  "thumb_md_webp",
  "thumb_sm_webp",
] as const;

function assetRowsSignature(
  entries: Array<Pick<GalleryAsset, "asset_id" | "sort_order">>,
): string {
  return entries
    .map((entry) => `${entry.asset_id}:${entry.sort_order ?? ""}`)
    .join("|");
}

function assetHasWebPDisplay(asset: Asset | null | undefined): boolean {
  return Boolean(
    asset?.thumbnail_urls?.display_webp ||
    asset?.thumbnail_urls?.thumb_lg_webp ||
    asset?.thumbnail_urls?.thumb_md_webp ||
    asset?.thumbnail_urls?.thumb_sm_webp,
  );
}

// Photo-view layout per mode. The same (feature-rich) tile is reused across all
// modes — only the container layout + a per-tile flow class change. Token-pure
// Tailwind utilities only (no arbitrary layout/color literals).
const PHOTO_VIEW_CONTAINER: Record<GalleryViewMode, string> = {
  grid: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
  masonry: "columns-1 gap-4 sm:columns-2 xl:columns-3",
  carousel: "flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2",
  justified: "flex flex-wrap gap-2",
  stack: "mx-auto grid max-w-3xl grid-cols-1 gap-6",
};
const PHOTO_VIEW_TILE: Record<GalleryViewMode, string> = {
  grid: "",
  masonry: "mb-4 break-inside-avoid",
  carousel: "shrink-0 snap-center basis-4/5 sm:basis-1/2 xl:basis-1/3",
  justified: "grow basis-48",
  stack: "",
};

function GalleryAssetTileImage({
  asset,
  token,
  isProcessing,
  aspectRatio,
}: {
  asset: Asset | null;
  token: string | null;
  isProcessing: boolean;
  // When set (masonry/justified views), the tile uses the photo's natural
  // aspect ratio instead of the uniform 4/3 grid cell. Driven by Asset
  // width/height so the layout reflects the real photos.
  aspectRatio?: number | null;
}) {
  const media = useDecryptedAssetUrl(asset, GRID_VARIANTS, token);
  const aspectClass = aspectRatio ? "" : "aspect-[4/3]";
  const aspectStyle = aspectRatio
    ? { aspectRatio: String(aspectRatio) }
    : undefined;
  if (isProcessing || media.loading) {
    return (
      <div
        className={cn(
          "flex w-full animate-pulse items-center justify-center overflow-hidden bg-surface-sunken",
          aspectClass,
        )}
        style={aspectStyle}
        role="status"
        aria-live="polite"
        aria-label={
          asset?.filename ? `Processing ${asset.filename}` : "Processing photo"
        }
      >
        <div className="flex flex-col items-center gap-2 text-text-tertiary">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-text-tertiary/30 border-t-text-tertiary" />
          <span className="text-xs">
            {media.loading ? "Decrypting photo..." : "Processing photo..."}
          </span>
        </div>
      </div>
    );
  }
  if (media.src) {
    return (
      <img
        src={media.src}
        alt={asset?.filename || "Gallery asset preview"}
        className={cn("w-full object-cover", aspectClass)}
        style={aspectStyle}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center bg-surface-sunken text-xs text-text-tertiary",
        aspectClass,
      )}
      style={aspectStyle}
    >
      {media.error || "Preview unavailable"}
    </div>
  );
}

function UploadDropzoneBackendPreview({
  asset,
  token,
}: {
  asset: Asset | null;
  token: string | null;
}) {
  const media = useDecryptedAssetUrl(
    asset,
    UPLOAD_DROPZONE_BACKEND_PREVIEW_VARIANTS,
    token,
  );
  if (!asset || media.loading || !media.src) return null;
  return (
    <img
      data-testid="upload-dropzone-backend-preview"
      src={media.src}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35"
      decoding="async"
    />
  );
}

function albumIsEditable(album: GalleryAlbum): boolean {
  return !album.smart_filter || Object.keys(album.smart_filter).length === 0;
}

// Recursively flatten a DataTransferItemList (drag-and-drop source)
// into a flat File[]. Required when the user drops a FOLDER instead
// of files — `dataTransfer.files` is empty for folder drops, and the
// only way to reach the leaf files is via the webkitGetAsEntry +
// FileSystemDirectoryReader API. Reader returns entries in batches
// of <=100 per call, so we loop until empty.
//
// Returns the raw flattened set. Callers must apply isAcceptedStillImageFile
// themselves to keep parity with the file-picker path.
async function collectFilesFromDataTransfer(
  items: DataTransferItemList,
): Promise<File[]> {
  // Minimal local typing for the webkit file-entry API. The DOM types
  // ship `FileSystemEntry` but DirectoryReader is omitted from lib.dom.d.ts
  // for some toolchains; defining narrow local interfaces avoids a
  // dependency on @types/filesystem and keeps the cast cost contained.
  interface FsEntry {
    isFile: boolean;
    isDirectory: boolean;
    file?: (cb: (file: File) => void) => void;
    createReader?: () => {
      readEntries: (cb: (entries: FsEntry[]) => void) => void;
    };
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
            if (entries.length === 0) {
              resolve();
              return;
            }
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
    const entry = (
      item as DataTransferItem & {
        webkitGetAsEntry?: () => FsEntry | null;
      }
    ).webkitGetAsEntry?.();
    if (entry) tasks.push(walk(entry));
  }
  await Promise.all(tasks);
  return collected;
}

async function collectNewTetheredFiles(
  directory: TetheredDirectoryEntry,
  seen: Map<string, TetheredSeenFile>,
  options: { recursive: boolean },
  prefix = "",
): Promise<TetheredFreshFile[]> {
  const files: TetheredFreshFile[] = [];
  for await (const entry of directory.values()) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === "directory") {
      if (options.recursive) {
        files.push(
          ...(await collectNewTetheredFiles(entry, seen, options, entryPath)),
        );
      }
      continue;
    }

    const file = await entry.getFile();
    const previous = seen.get(entryPath);
    if (
      previous?.lastModified === file.lastModified &&
      previous.size === file.size
    )
      continue;
    seen.set(entryPath, { lastModified: file.lastModified, size: file.size });
    if (isAcceptedStillImageFile(file)) {
      files.push({
        file,
        path: entryPath,
        lastModified: file.lastModified || Date.now(),
      });
    }
  }
  return files;
}

function uploadFileSignature(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatTetheredRelativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function buildShareText(gallery: Gallery, label: string, url: string): string {
  const galleryTitle = gallery.title?.trim() || "Gallery";
  return `${label} from ${galleryTitle}: ${url}`;
}

function buildShareEmailHref(
  gallery: Gallery,
  label: string,
  url: string,
): string {
  const subject = `${gallery.title?.trim() || "Gallery"} - ${label}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(buildShareText(gallery, label, url))}`;
}

export default function GalleryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [assets, setAssets] = useState<GalleryAssetRecord[]>([]);
  const assetRowsSignatureRef = useRef("");
  const [selections, setSelections] = useState<ProofingSelection[]>([]);
  // M41/105: aggregated guest favorites for this gallery. Null while
  // loading; an empty summary object once the request lands (even with
  // zero favorites). The dashboard tile reads total_favorites and
  // unique_assets_count to render "12 hearts across 4 photos" style.
  const [favoritesSummary, setFavoritesSummary] =
    useState<GalleryFavoritesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [photoViewMode, setPhotoViewMode] = useGalleryViewMode(id);
  const [commentsByAsset, setCommentsByAsset] = useState<
    Record<string, ProofingComment[]>
  >({});
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [proofingFilter] = useState<string | null>(null);
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
  // Per-business subdomain identity for share URLs. Loaded once when the
  // page mounts — share URLs are only built after this resolves; until then
  // buildShareUrl falls back to the legacy /g/<slug> shape.
  const [workspaceProfile, setWorkspaceProfile] =
    useState<WorkspaceProfile | null>(null);
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    getWorkspaceProfile(token)
      .then((p) => {
        if (!cancelled) setWorkspaceProfile(p);
      })
      .catch(() => {
        /* fallback to legacy URL via buildShareUrl */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  // E71-S1: Album state
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]);
  const [albumAssetIdsByAlbum, setAlbumAssetIdsByAlbum] = useState<
    Record<string, string[]>
  >({});
  const [activeAlbum, setActiveAlbum] = useState<string | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [showAlbumCreate, setShowAlbumCreate] = useState(false);
  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [savingAlbumId, setSavingAlbumId] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState("");
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    assetId: string;
    filename: string;
    isBulk?: boolean;
  } | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadDialogDismissed, setUploadDialogDismissed] = useState(false);
  const [tetheredEnabled, setTetheredEnabled] = useState(false);
  const [tetheredFolderName, setTetheredFolderName] = useState<string | null>(
    null,
  );
  const [tetheredStatus, setTetheredStatus] = useState<
    "idle" | "watching" | "paused" | "unsupported" | "error"
  >("idle");
  const [tetheredPollIntervalMs, setTetheredPollIntervalMs] = useState(
    TETHERED_DEFAULT_POLL_MS,
  );
  const [tetheredIncludeSubfolders, setTetheredIncludeSubfolders] =
    useState(false);
  const [tetheredNewestFirst, setTetheredNewestFirst] = useState(true);
  const [tetheredAutoOpen, setTetheredAutoOpen] = useState(false);
  const [tetheredSoundEnabled, setTetheredSoundEnabled] = useState(true);
  const [tetheredSessionNewCount, setTetheredSessionNewCount] = useState(0);
  const [tetheredLastDetectedAt, setTetheredLastDetectedAt] = useState<
    number | null
  >(null);
  const [, setTetheredClockTick] = useState(0);
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadDialogRef = useRef<HTMLElement | null>(null);
  const tetheredDirectoryRef = useRef<TetheredDirectoryEntry | null>(null);
  const tetheredSeenFilesRef = useRef<Map<string, TetheredSeenFile>>(new Map());
  const tetheredPollTimerRef = useRef<number | null>(null);
  const tetheredUploadSignaturesRef = useRef<Set<string>>(new Set());
  const tetheredAutoOpenRef = useRef(tetheredAutoOpen);
  const tetheredNewestFirstRef = useRef(tetheredNewestFirst);
  const tetheredAudioRef = useRef<AudioContext | null>(null);

  // F-046: render the grid in bounded windows instead of mounting the
  // full asset set at once. A 500–2000 photo wedding gallery would
  // otherwise emit that many <article>/<img> nodes on first paint,
  // causing multi-second layout/paint and mobile-tab crashes. We render
  // GRID_PAGE_SIZE tiles at a time and grow the window via a "Load more"
  // control. (True backend cursor pagination lands in the galleries API
  // layer; this client-side window is the in-page mitigation for the
  // DOM-node explosion.)
  const GRID_PAGE_SIZE = 60;
  const [visibleLimit, setVisibleLimit] = useState(GRID_PAGE_SIZE);

  // E68-S1: Bulk selection state
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkMode, setBulkMode] = useState(false);
  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };
  const selectAllAssets = () => {
    setSelectedAssetIds(
      new Set(
        visibleAssets.map((a) => a.asset?.id).filter(Boolean) as string[],
      ),
    );
  };
  const clearSelectedAssets = () => {
    setSelectedAssetIds(new Set());
  };
  const clearSelection = () => {
    setSelectedAssetIds(new Set());
    setBulkMode(false);
  };
  const handleBulkDelete = () => {
    if (selectedAssetIds.size === 0) return;
    setDeleteConfirm({
      assetId: "",
      filename: `${selectedAssetIds.size} photo${selectedAssetIds.size === 1 ? "" : "s"}`,
      isBulk: true,
    });
  };

  useEffect(() => {
    assetRowsSignatureRef.current = assetRowsSignature(assets);
  }, [assets]);

  const refreshGalleryAssets = useCallback(
    async (
      options: { skipIfRowsUnchanged?: boolean } = {},
    ): Promise<GalleryAssetRecord[] | null> => {
      const t = getStoredAccessToken();
      if (!t) return null;

      const galleryAssets = await listGalleryAssets(t, id, {
        includeAssets: true,
      });
      const nextSignature = assetRowsSignature(galleryAssets);
      if (
        options.skipIfRowsUnchanged &&
        nextSignature === assetRowsSignatureRef.current
      )
        return null;

      const hydratedAssets = await hydrateGalleryAssets(t, galleryAssets);
      setAssets(hydratedAssets);
      return hydratedAssets;
    },
    [id],
  );

  useEffect(() => {
    let cancelled = false;

    const loadGallery = async () => {
      const token = getStoredAccessToken();

      if (!token) {
        if (!cancelled) {
          setError("Your session expired. Please log in again.");
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [galleryData, galleryAssets, gallerySelections, favSummary] =
          await Promise.all([
            getGallery(token, id),
            listGalleryAssets(token, id, { includeAssets: true }),
            listProofingSelections(token, id).catch((err) => {
              console.warn("Failed to load proofing selections:", err?.message);
              return [];
            }),
            // Favorites endpoint 404s if the table is empty for the
            // gallery (no, actually the backend returns zeros) — but
            // an outage shouldn't break the dashboard. Default to null
            // so the tile renders "—" instead of crashing the page.
            getGalleryFavoritesSummary(token, id).catch((err) => {
              console.warn("Failed to load favorites summary:", err?.message);
              return null;
            }),
          ]);

        const hydratedAssets = await hydrateGalleryAssets(token, galleryAssets);

        if (cancelled) {
          return;
        }

        setGallery(galleryData);
        setAssets(hydratedAssets);
        setSelections(gallerySelections ?? []);
        setFavoritesSummary(favSummary);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load gallery.",
          );
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

  useEffect(() => {
    if (loading || !gallery?.id) return;
    // Refresh shortly after initial load to catch late-linked assets whose
    // junction rows settle just after the first overview request completes.
    const timers = ASSET_SETTLE_REFRESH_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        void refreshGalleryAssets({ skipIfRowsUnchanged: true });
      }, delay),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [gallery?.id, loading, refreshGalleryAssets]);

  const refreshAlbums = useCallback(async () => {
    const t = getStoredAccessToken();
    if (!t) return;
    try {
      // F-091: one request returns every album with its member asset IDs inline,
      // replacing the previous 1 + N (listGalleryAlbums + per-album listAlbumAssets).
      const nextAlbums = await listGalleryAlbums(t, id, {
        includeAssetIds: true,
      });
      setAlbums(nextAlbums);
      setAlbumAssetIdsByAlbum(
        Object.fromEntries(
          nextAlbums.map((album) => [album.id, album.asset_ids ?? []]),
        ),
      );
    } catch {
      setAlbums([]);
      setAlbumAssetIdsByAlbum({});
    }
  }, [id]);

  // E71-S1: Fetch albums for this gallery
  useEffect(() => {
    const loadAlbums = async () => {
      await refreshAlbums();
    };
    void loadAlbums();
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
      setError(
        err instanceof Error ? err.message : "Failed to create sub-gallery",
      );
    } finally {
      setCreatingAlbum(false);
    }
  }, [id, newAlbumName, refreshAlbums, selectedAssetIds]);

  const handleDeleteAlbum = useCallback(
    async (album: GalleryAlbum) => {
      if (!albumIsEditable(album)) return;
      const confirmed = window.confirm(
        `Delete "${album.name}" sub-gallery? Photos stay in All Photos.`,
      );
      if (!confirmed) return;
      const t = getStoredAccessToken();
      if (!t) return;

      setSavingAlbumId(album.id);
      setError("");
      try {
        await deleteGalleryAlbum(t, album.id);
        if (activeAlbum === album.id) setActiveAlbum(null);
        await refreshAlbums();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete sub-gallery",
        );
      } finally {
        setSavingAlbumId(null);
      }
    },
    [activeAlbum, refreshAlbums],
  );

  // Builds the per-business subdomain URL (migration 121 shape):
  //   https://<business_profile_slug>-<business_unique_code>.rawdrive.in/<gallery.slug>
  // Falls back to /g/<slug> on the apex when workspaceProfile hasn't loaded
  // yet (first render, before the useEffect fetch resolves) or when the
  // workspace has no business identity assigned (should be impossible
  // post-migration 121 but the helper is defensive).
  //
  // Album query appending: Next.js middleware passes querystring through to
  // /g/[slug], so adding `?album=<id>` to the share URL keeps album deep
  // links working under the new shape unchanged.
  const buildShareUrl = useCallback(
    (albumId?: string) => {
      if (!gallery?.slug) return "";
      const base = galleryPublicUrl(gallery, workspaceProfile);
      const withAlbum = (() => {
        if (!albumId) return base;
        const sep = base.includes("?") ? "&" : "?";
        return `${base}${sep}album=${encodeURIComponent(albumId)}`;
      })();
      return appendStoredGalleryKeyFragment(withAlbum, id);
    },
    [gallery, id, workspaceProfile],
  );

  const createWorkingShareUrl = useCallback(
    async (albumId: string | undefined, channel: "copy" | "email") => {
      if (!gallery?.is_published) {
        throw new Error(SHARE_UNAVAILABLE_MESSAGE);
      }
      const token = getStoredAccessToken();
      if (!token) {
        throw new Error("Sign in again to create a share link.");
      }
      const baseUrl = buildShareUrl(albumId);
      if (!baseUrl) {
        throw new Error("Share link unavailable: gallery URL is missing.");
      }

      const expiryDays = galleryShareExpiryDays(gallery);
      const created = await createGalleryShareLink(token, gallery.id, {
        access_mode: "public",
        download_allowed: gallery.download_enabled !== false,
        channel,
        ...(expiryDays !== undefined ? { expiry_days: expiryDays } : {}),
      });
      return setUrlSearchParamBeforeFragment(baseUrl, "share", created.token);
    },
    [buildShareUrl, gallery],
  );

  const copyShareUrl = useCallback(
    async (albumId?: string) => {
      try {
        const url = await createWorkingShareUrl(albumId, "copy");
        await navigator.clipboard.writeText(url);
        setShareMessage(
          albumId ? "Sub-gallery link copied." : "Gallery link copied.",
        );
      } catch (err) {
        setShareMessage(
          err instanceof Error ? err.message : "Failed to create share link",
        );
      }
    },
    [createWorkingShareUrl],
  );

  const openShareLink = useCallback(
    async (albumId: string | undefined, label: string) => {
      if (!gallery) return;
      let url: string;
      try {
        url = await createWorkingShareUrl(albumId, "email");
      } catch (err) {
        setShareMessage(
          err instanceof Error ? err.message : "Failed to create share link",
        );
        return;
      }
      const href = buildShareEmailHref(gallery, label, url);
      window.location.href = href;
      setShareMessage("Email share link opened.");
    },
    [createWorkingShareUrl, gallery],
  );

  const togglePublishState = useCallback(async () => {
    if (!gallery || publishing) return;
    const t = getStoredAccessToken();
    if (!t) return;
    setPublishing(true);
    try {
      const updated = await updateGallery(t, id, {
        is_published: !gallery.is_published,
      });
      setGallery(updated);
      setShareMessage(
        updated.is_published
          ? "Gallery published - client links are now live."
          : "Gallery unpublished.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change publish state",
      );
    } finally {
      setPublishing(false);
    }
  }, [gallery, id, publishing]);

  const handleShareAsset = useCallback(
    async (e: React.MouseEvent, assetId: string) => {
      e.stopPropagation();
      if (!gallery?.slug) return;
      const baseUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/g/${gallery.slug}/photo/${assetId}`;
      const url = appendStoredGalleryKeyFragment(baseUrl, id);
      try {
        if (typeof navigator !== "undefined" && "share" in navigator) {
          await (
            navigator as Navigator & {
              share: (d: { title: string; url: string }) => Promise<void>;
            }
          ).share({
            title: gallery.title || "Photo",
            url,
          });
          setShareMessage("Photo share sheet opened.");
          return;
        }
      } catch {
        /* fall through to clipboard */
      }
      try {
        await navigator.clipboard.writeText(url);
        setShareMessage("Photo link copied.");
      } catch {
        setShareMessage(url);
      }
      setCopiedAssetId(assetId);
      setTimeout(() => setCopiedAssetId(null), 2000);
    },
    [gallery, id],
  );

  const handleDeleteAsset = useCallback(
    async (assetId: string) => {
      const t = getStoredAccessToken();
      if (!t) return;
      try {
        await deleteAsset(t, assetId);
        setAssets((prev) => prev.filter((a) => a.asset?.id !== assetId));
        setLightboxIndex(null);
        await refreshAlbums();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      }
    },
    [refreshAlbums],
  );

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
      window.removeEventListener(
        "rawdrive:face-filter",
        onFilter as EventListener,
      );
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

  // Reduce the hydrated asset list to the active album / face / proofing
  // filter set. The React Compiler memoizes this computation (and its
  // consumers) automatically; a manual useMemo here could not be preserved
  // by the compiler ("memoized in source but not in compilation output"),
  // which blocked optimization of the whole component, so we let the
  // compiler own the memoization. Behavior is identical.
  const computeVisibleAssets = () => {
    let result = assets;
    if (activeAlbum) {
      const albumAssetIds = new Set(albumAssetIdsByAlbum[activeAlbum] || []);
      result = result.filter((a) => a.asset && albumAssetIds.has(a.asset.id));
    }
    if (faceFilterIds) {
      result = result.filter((a) => a.asset && faceFilterIds.has(a.asset.id));
    }
    if (proofingFilterAssetIds) {
      result = result.filter(
        (a) => a.asset && proofingFilterAssetIds.has(a.asset.id),
      );
    }
    return result;
  };
  const visibleAssets = computeVisibleAssets();
  const visibleSelectableAssetIds = useMemo(
    () => visibleAssets.map((a) => a.asset?.id).filter(Boolean) as string[],
    [visibleAssets],
  );
  const allVisibleAssetsSelected =
    visibleSelectableAssetIds.length > 0 &&
    visibleSelectableAssetIds.every((assetId) => selectedAssetIds.has(assetId));

  // F-046: collapse the window back to one page whenever the filtered
  // set identity changes (album switch, face filter, proofing filter,
  // or a fresh asset load). Without this, switching from a 2000-photo
  // "All" view to a 12-photo album would keep an oversized limit and
  // the reverse (album → All) would show a stale partial page until the
  // user re-triggered "Load more". Adjusting state during render (React's
  // "storing information from previous renders" pattern) instead of in an
  // effect avoids a stale partial-page flash before the reset commits.
  const [prevVisibleFilter, setPrevVisibleFilter] = useState<{
    activeAlbum: string | null;
    faceFilterIds: Set<string> | null;
    proofingFilterAssetIds: Set<string> | null;
  }>({ activeAlbum, faceFilterIds, proofingFilterAssetIds });
  if (
    prevVisibleFilter.activeAlbum !== activeAlbum ||
    prevVisibleFilter.faceFilterIds !== faceFilterIds ||
    prevVisibleFilter.proofingFilterAssetIds !== proofingFilterAssetIds
  ) {
    setPrevVisibleFilter({
      activeAlbum,
      faceFilterIds,
      proofingFilterAssetIds,
    });
    setVisibleLimit(GRID_PAGE_SIZE);
  }

  // The actual tiles mounted into the DOM — never more than visibleLimit.
  const pagedAssets = useMemo(
    () => visibleAssets.slice(0, visibleLimit),
    [visibleAssets, visibleLimit],
  );
  const hasMoreAssets = visibleAssets.length > pagedAssets.length;
  const activeAlbumDetails = useMemo(
    () =>
      activeAlbum
        ? (albums.find((album) => album.id === activeAlbum) ?? null)
        : null,
    [activeAlbum, albums],
  );
  const activeLightboxAsset =
    lightboxIndex !== null ? (assets[lightboxIndex]?.asset ?? null) : null;
  const activeLightboxAssetId = activeLightboxAsset?.id;

  useEffect(() => {
    if (!gallery?.id || !activeLightboxAssetId) return;
    const t = getStoredAccessToken();
    if (!t) return;

    let cancelled = false;
    listComments(t, gallery.id, activeLightboxAssetId)
      .then((comments) => {
        if (cancelled) return;
        setCommentsByAsset((current) => {
          const byId = new Map<string, ProofingComment>();
          for (const comment of current[activeLightboxAssetId] ?? [])
            byId.set(comment.id, comment);
          for (const comment of comments) byId.set(comment.id, comment);
          return {
            ...current,
            [activeLightboxAssetId]: Array.from(byId.values()).sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            ),
          };
        });
      })
      .catch((err) => {
        console.warn("Failed to load comments:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [activeLightboxAssetId, gallery?.id]);

  const handleProofingAction = useCallback(
    async (assetId: string, action: "select" | "approve" | "reject") => {
      if (!gallery) return;
      const token = getStoredAccessToken();
      if (!token) {
        setError("Your session expired. Please log in again.");
        return;
      }

      const status =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "selected";
      const matchingSelections = selections.filter(
        (selection) => selection.asset_id === assetId,
      );
      if (matchingSelections.length === 0) {
        setError("This photo has not been selected by a client yet.");
        return;
      }

      try {
        await Promise.all(
          matchingSelections.map((selection) =>
            updateSelectionStatus(token, gallery.id, selection.id, status),
          ),
        );
        const matchingIDs = new Set(
          matchingSelections.map((selection) => selection.id),
        );
        setSelections((current) =>
          current.map((selection) =>
            matchingIDs.has(selection.id)
              ? { ...selection, status }
              : selection,
          ),
        );
        setError("");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update proofing status.",
        );
      }
    },
    [gallery, selections],
  );

  // ──────── Upload Integration ────────
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  // F-089: read the access token ONCE per mount instead of on every render.
  // getStoredAccessToken() is not a pure getter — it calls
  // clearLegacyStoredTokens() which performs 4 synchronous
  // localStorage/sessionStorage removeItem() writes (2 keys × 2 stores) on
  // every call. This component re-renders frequently while uploads are in
  // flight (per-byte progress state updates), so calling it inline in the
  // render body fired those 4 main-thread storage writes on each progress
  // tick during the most performance-sensitive UX window. accessTokenCache
  // is a module-level value that only changes on login/refresh/logout, so
  // a once-per-mount snapshot via a lazy useState initializer is correct
  // and stable for the upload hook + the SSE subscription below.
  const [token] = useState<string | null>(() => getStoredAccessToken());

  // ──────── Terms-of-Service / copyright acceptance gate ────────
  // A photographer must accept the active Terms (copyright/IP ownership,
  // rights-warranty, indemnification) before ANY upload. We pre-check status so
  // the modal appears before an upload even starts (no failed-upload flash); the
  // backend 403 TERMS_NOT_ACCEPTED gate (via onTermsRequired) is the hard
  // safety-net for a stale/unknown status. termsNeedsAcceptanceRef mirrors the
  // state so submitFiles (a stable callback) reads the current value without a
  // dependency churn, and so a replay after acceptance is not re-blocked by a
  // stale closure.
  const [termsNeedsAcceptance, setTermsNeedsAcceptance] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const termsNeedsAcceptanceRef = useRef(false);
  useEffect(() => {
    termsNeedsAcceptanceRef.current = termsNeedsAcceptance;
  }, [termsNeedsAcceptance]);
  const pendingUploadRef = useRef<{
    files: File[];
    options?: { source?: "manual" | "tethered" };
  } | null>(null);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void getTermsStatus(token).then((status) => {
      if (!cancelled && status)
        setTermsNeedsAcceptance(status.needs_acceptance);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);
  const openTermsModal = useCallback(() => {
    termsNeedsAcceptanceRef.current = true;
    setTermsNeedsAcceptance(true);
    setTermsModalOpen(true);
  }, []);

  // Client-side media encryption (feature branch): the upload hook fetches the
  // per-gallery media key on demand and encrypts each WebP derivative in the
  // browser before it leaves the device.
  const uploadEncryption = useMemo(
    () => ({
      getKey: () => getOrCreateGalleryMediaKey(id),
    }),
    [id],
  );
  // S3-G4 / S3-G5: also bind every upload session to THIS gallery (and the
  // active sub-album, when one is selected) so the backend links the finalized
  // asset into the gallery server-side — idempotent, deterministic sort_order —
  // at finalize. The destination fields update as the user switches albums; the
  // hook reads them live via a ref so a mid-batch switch routes correctly.
  const upload = useUpload(apiUrl, token, {
    encryption: uploadEncryption,
    destination: { galleryId: id, albumId: activeAlbum },
    onTermsRequired: openTermsModal,
  });
  const linkedAssetIdsRef = useRef<Set<string>>(new Set());
  const uploadPreviewBackendAsset = useMemo(() => {
    const completedAssetIds = new Set(
      upload.items
        .filter((item) => item.status === "complete" && item.assetId)
        .map((item) => item.assetId as string),
    );
    return (
      visibleAssets.find(
        (entry) =>
          entry.asset &&
          completedAssetIds.has(entry.asset.id) &&
          assetHasWebPDisplay(entry.asset),
      )?.asset ?? null
    );
  }, [upload.items, visibleAssets]);
  const completedUploadRefreshKey = useMemo(
    () =>
      upload.items
        .filter((item) => item.status === "complete")
        .map((item) => item.assetId || item.id)
        .sort()
        .join("|"),
    [upload.items],
  );
  const completedUploadRefreshKeyRef = useRef("");

  useEffect(() => {
    if (
      !completedUploadRefreshKey ||
      completedUploadRefreshKey === completedUploadRefreshKeyRef.current
    )
      return;
    completedUploadRefreshKeyRef.current = completedUploadRefreshKey;

    const timers = [0, ...ASSET_SETTLE_REFRESH_DELAYS_MS].map((delay) =>
      window.setTimeout(() => {
        void refreshGalleryAssets().catch((err) => {
          console.warn(
            "Failed to refresh gallery after upload completion:",
            err,
          );
        });
        void refreshAlbums();
      }, delay),
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [completedUploadRefreshKey, refreshAlbums, refreshGalleryAssets]);

  useEffect(() => {
    tetheredAutoOpenRef.current = tetheredAutoOpen;
  }, [tetheredAutoOpen]);

  useEffect(() => {
    tetheredNewestFirstRef.current = tetheredNewestFirst;
  }, [tetheredNewestFirst]);

  useEffect(() => {
    if (!tetheredLastDetectedAt) return;
    const interval = window.setInterval(() => {
      setTetheredClockTick((tick) => tick + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tetheredLastDetectedAt]);

  // Upload completion toast — fires when the active upload count
  // (uploading + pending + screening) transitions from >0 to 0 and at
  // least one item ended in `complete`. The previous UI kept the
  // progress panel mounted forever showing "Uploading 0 files" once
  // every item had finished; that was both confusing and visually
  // dead weight. Now the panel hides when activeCount===0 and the
  // user gets a single right-side toast with the success count.
  const activeUploadCount = upload.items.filter(
    (i) =>
      i.status === "uploading" ||
      i.status === "pending" ||
      i.status === "screening" ||
      i.status === "encrypting" ||
      i.status === "paused",
  ).length;
  const completedUploadCount = upload.items.filter(
    (i) => i.status === "complete",
  ).length;
  const failedUploadCount = upload.items.filter(
    (i) => i.status === "error",
  ).length;
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
      i.status === "encrypting" ||
      i.status === "paused" ||
      i.status === "complete" ||
      i.status === "error",
  );
  const bytesTotal = byteProgressItems.reduce((sum, i) => sum + i.file.size, 0);
  const bytesUploaded = byteProgressItems.reduce(
    (sum, i) =>
      sum +
      Math.floor(
        ((i.status === "complete" ? 100 : i.progress) / 100) * i.file.size,
      ),
    0,
  );
  const overallBytePercent =
    bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
  const formatUploadBytes = (b: number): string => {
    if (b < 1024) return `${b} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let n = b / 1024;
    let u = 0;
    while (n >= 1024 && u < units.length - 1) {
      n /= 1024;
      u++;
    }
    return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[u]}`;
  };
  const uploadPanelOpen =
    activeUploadCount > 0 || failedUploadCount > 0 || blockedUploadCount > 0;
  const uploadDialogOpen =
    showUploadDialog || (uploadPanelOpen && !uploadDialogDismissed);
  const uploadDialogCanClose =
    activeUploadCount === 0 &&
    failedUploadCount === 0 &&
    blockedUploadCount === 0;
  const uploadStage: "details" | "processing" | "visibility" =
    activeUploadCount > 0
      ? "processing"
      : upload.items.length > 0 &&
          failedUploadCount === 0 &&
          blockedUploadCount === 0
        ? "visibility"
        : "details";
  const shownUploadCount = byteProgressItems.length;
  const uploadStatusHeadline = (() => {
    if (activeUploadCount > 0 && shownUploadCount > activeUploadCount) {
      return `Uploading ${completedUploadCount + 1} of ${shownUploadCount} files`;
    }
    if (activeUploadCount > 0) {
      return `Uploading ${activeUploadCount} ${activeUploadCount === 1 ? "file" : "files"}`;
    }
    if (failedUploadCount > 0) {
      return `${failedUploadCount} upload${failedUploadCount === 1 ? "" : "s"} failed`;
    }
    if (blockedUploadCount > 0) {
      return `${blockedUploadCount} upload${blockedUploadCount === 1 ? "" : "s"} blocked`;
    }
    if (completedUploadCount > 0) {
      return `${completedUploadCount} ${completedUploadCount === 1 ? "photo" : "photos"} ready`;
    }
    return "Select photos to upload";
  })();
  const handleUploadDialogBack = () => {
    if (activeUploadCount > 0) {
      setUploadDialogDismissed(true);
      setShowUploadDialog(false);
      return;
    }
    upload.clearFinished();
    setUploadDialogDismissed(false);
    setShowUploadDialog(false);
  };

  useEffect(() => {
    if (!uploadDialogOpen) return;
    uploadDialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && uploadDialogCanClose) {
        setShowUploadDialog(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [uploadDialogOpen, uploadDialogCanClose]);
  const prevActiveUploadCountRef = useRef(0);
  const [uploadToast, setUploadToast] = useState<{
    visible: boolean;
    completed: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    const wasActive = prevActiveUploadCountRef.current > 0;
    const isIdle = activeUploadCount === 0;
    if (
      wasActive &&
      isIdle &&
      (completedUploadCount > 0 || failedUploadCount > 0)
    ) {
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

  const handleAssetReady = useCallback(async (assetId: string) => {
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
  }, []);

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
  // Rather than chase the exact SSE root cause, a 1-second poll over
  // the pendingAssetIds set is a robust belt-and-suspenders fallback:
  // if SSE works, the tile flips immediately; if it doesn't, the poll
  // catches it within 1 second — still vastly better than "never
  // until the user refreshes". The interval clears the moment
  // pendingAssetIds is empty so steady-state cost is zero.
  useEffect(() => {
    if (pendingAssetIds.length === 0) return;
    const interval = window.setInterval(() => {
      for (const assetId of pendingAssetIds) {
        void handleAssetReady(assetId);
      }
    }, 1000);
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

  // S3-G4 / S3-G5: the gallery link is now performed SERVER-SIDE at finalize
  // (the upload session was bound to gallery_id in CreateSession), so the
  // formerly-required client addAssetToGallery loop is gone — keeping it would
  // be a redundant idempotent no-op. What still must happen client-side is the
  // sub-album membership push (the backend validates album_id but does not add
  // the asset to the album table) and reloading the asset + album views so the
  // freshly-linked photos appear. The "active sub-album" semantic is unchanged:
  // photos land wherever the user is currently looking, so an upload kicked off
  // from inside the Favorites chip shows up in Favorites without a manual
  // drag-into-album step.
  useEffect(() => {
    const t = getStoredAccessToken();
    if (!t || !id) return;
    const toLink = upload.items.filter(
      (item) =>
        item.status === "complete" &&
        item.assetId &&
        !linkedAssetIdsRef.current.has(item.assetId),
    );
    if (toLink.length === 0) return;

    (async () => {
      // Capture the active album once per batch run rather than on each
      // iteration so all assets from one upload batch land together
      // even if the user clicks a different chip mid-flight.
      const targetAlbumId = activeAlbumRef.current;
      const newlyAddedAssetIds: string[] = [];
      const newlyAddedTetheredAssetIds: string[] = [];

      for (const item of toLink) {
        if (!item.assetId) continue;
        // Tethered-capture tracking (feature branch): tag assets that
        // originated from a tethered shoot so the post-batch auto-open below
        // can surface them. The signature set is populated when a tethered
        // file is enqueued (see tetheredUploadSignaturesRef.add).
        const uploadSignature = uploadFileSignature(item.file);
        const isTetheredUpload =
          tetheredUploadSignaturesRef.current.has(uploadSignature);
        if (isTetheredUpload) {
          tetheredUploadSignaturesRef.current.delete(uploadSignature);
          newlyAddedTetheredAssetIds.push(item.assetId);
        }
        // S3-G4 / S3-G5: server-side finalize already linked this asset into
        // the gallery (the upload session was bound to gallery_id in
        // CreateSession). The legacy client-side addAssetToGallery call is now
        // a redundant no-op and removed. Track the asset locally (de-dup guard)
        // and queue it for album membership + the post-batch reload below.
        linkedAssetIdsRef.current.add(item.assetId);
        newlyAddedAssetIds.push(item.assetId);
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
        const hydratedAssets = await refreshGalleryAssets();
        if (
          tetheredAutoOpenRef.current &&
          newlyAddedTetheredAssetIds.length > 0
        ) {
          const orderedAssetIds = tetheredNewestFirstRef.current
            ? newlyAddedTetheredAssetIds
            : [...newlyAddedTetheredAssetIds].reverse();
          const targetAssetId = orderedAssetIds[0];
          const targetIndex =
            hydratedAssets?.findIndex(
              (entry) => entry.asset?.id === targetAssetId,
            ) ?? -1;
          if (targetIndex >= 0) {
            setShowUploadDialog(false);
            setLightboxIndex(targetIndex);
          }
        }
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
  }, [upload.items, id, refreshAlbums, refreshGalleryAssets]);

  const [isDragOver, setIsDragOver] = useState(false);

  // submitFiles runs the dedupe gate then enqueues. Both the drop and
  // the file-picker handlers route through here so the duplicate
  // policy fires consistently from either entry point.
  const submitFiles = useCallback(
    (files: File[], options?: { source?: "manual" | "tethered" }) => {
      if (files.length === 0) return;
      // Terms gate (pre-check). Block the upload before it starts when the user
      // has not accepted the active Terms; stash the batch and open the modal so
      // it replays automatically after acceptance. Read from the ref so a replay
      // (which sets the ref false first) is not re-blocked by a stale closure.
      if (termsNeedsAcceptanceRef.current) {
        pendingUploadRef.current = { files, options };
        setTermsModalOpen(true);
        return;
      }
      const { accepted, duplicatesInGallery, duplicatesInBatch } =
        dedupeIncomingFiles(files);
      if (duplicatesInGallery.length > 0 || duplicatesInBatch.length > 0) {
        setDuplicateWarning({
          visible: true,
          duplicatesInGallery,
          duplicatesInBatch,
        });
      }
      if (accepted.length > 0) {
        if (options?.source === "tethered") {
          for (const file of accepted) {
            tetheredUploadSignaturesRef.current.add(uploadFileSignature(file));
          }
        }
        setShowUploadDialog(true);
        upload.addFiles(accepted);
      }
    },
    // The React Compiler infers the setState setters as dependencies of this
    // callback; listing them keeps the manual memoization preservable. They
    // are stable identities, so runtime behavior is unchanged.
    [
      dedupeIncomingFiles,
      upload,
      setDuplicateWarning,
      setShowUploadDialog,
      setTermsModalOpen,
    ],
  );

  // Called when the user accepts the Terms in the modal: clear the gate (ref
  // first so the immediate replay is not re-blocked by a stale closure) and
  // replay the stashed upload batch, if any.
  const handleTermsAccepted = useCallback(() => {
    termsNeedsAcceptanceRef.current = false;
    setTermsNeedsAcceptance(false);
    setTermsModalOpen(false);
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (pending && pending.files.length > 0) {
      submitFiles(pending.files, pending.options);
    }
  }, [submitFiles]);

  const playTetheredDing = useCallback(() => {
    if (!tetheredSoundEnabled) return;
    try {
      const win = window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioContextCtor = window.AudioContext ?? win.webkitAudioContext;
      if (!AudioContextCtor) return;
      const ctx = tetheredAudioRef.current ?? new AudioContextCtor();
      tetheredAudioRef.current = ctx;
      for (const [index, frequency] of [784, 1046.5].entries()) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = ctx.currentTime + index * 0.08;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.linearRampToValueAtTime(0.16, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.34);
      }
    } catch {
      // Audio is a courtesy signal; browsers may block it until a user gesture.
    }
  }, [tetheredSoundEnabled]);

  const scanTetheredFolder = useCallback(
    async (initial = false) => {
      const directory = tetheredDirectoryRef.current;
      if (!directory) return;
      try {
        const queryPermission = directory.queryPermission;
        const requestPermission = directory.requestPermission;
        if (queryPermission && requestPermission) {
          const permission = await queryPermission.call(directory, {
            mode: "read",
          });
          if (permission !== "granted") {
            const nextPermission = await requestPermission.call(directory, {
              mode: "read",
            });
            if (nextPermission !== "granted") {
              setTetheredStatus("error");
              return;
            }
          }
        }

        const freshFiles = await collectNewTetheredFiles(
          directory,
          tetheredSeenFilesRef.current,
          { recursive: tetheredIncludeSubfolders },
        );
        freshFiles.sort((a, b) => a.lastModified - b.lastModified);
        const orderedFiles = tetheredNewestFirst
          ? [...freshFiles].reverse()
          : freshFiles;
        if (orderedFiles.length > 0) {
          const files = orderedFiles.map((entry) => entry.file);
          setTetheredLastDetectedAt(Date.now());
          if (!initial) {
            setTetheredSessionNewCount((count) => count + files.length);
            playTetheredDing();
          }
          submitFiles(files, { source: "tethered" });
        }
        setTetheredStatus("watching");
      } catch (err) {
        console.warn("tethered folder scan failed", err);
        setTetheredStatus("error");
        if (tetheredPollTimerRef.current !== null) {
          window.clearInterval(tetheredPollTimerRef.current);
          tetheredPollTimerRef.current = null;
        }
      }
    },
    [
      playTetheredDing,
      submitFiles,
      tetheredIncludeSubfolders,
      tetheredNewestFirst,
    ],
  );

  const stopTetheredFolder = useCallback(() => {
    if (tetheredPollTimerRef.current !== null) {
      window.clearInterval(tetheredPollTimerRef.current);
      tetheredPollTimerRef.current = null;
    }
    tetheredDirectoryRef.current = null;
    tetheredSeenFilesRef.current.clear();
    tetheredUploadSignaturesRef.current.clear();
    setTetheredEnabled(false);
    setTetheredFolderName(null);
    setTetheredSessionNewCount(0);
    setTetheredLastDetectedAt(null);
    setTetheredStatus("idle");
  }, []);

  const pauseTetheredFolder = useCallback(() => {
    if (tetheredStatus !== "watching") return;
    if (tetheredPollTimerRef.current !== null) {
      window.clearInterval(tetheredPollTimerRef.current);
      tetheredPollTimerRef.current = null;
    }
    setTetheredStatus("paused");
  }, [tetheredStatus]);

  const resumeTetheredFolder = useCallback(() => {
    if (!tetheredDirectoryRef.current) return;
    setTetheredStatus("watching");
    void scanTetheredFolder(false);
  }, [scanTetheredFolder]);

  const startTetheredFolder = useCallback(async () => {
    const picker = window as unknown as TetheredDirectoryPickerWindow;
    if (!picker.showDirectoryPicker) {
      setTetheredEnabled(false);
      setTetheredStatus("unsupported");
      setShowUploadDialog(true);
      return;
    }
    try {
      const directory = await picker.showDirectoryPicker({
        id: "rawdrive-tethered-gallery-folder",
        mode: "read",
        startIn: "pictures",
      });
      tetheredDirectoryRef.current = directory;
      tetheredSeenFilesRef.current.clear();
      tetheredUploadSignaturesRef.current.clear();
      setTetheredEnabled(true);
      setTetheredFolderName(directory.name);
      setTetheredSessionNewCount(0);
      setTetheredLastDetectedAt(null);
      setTetheredStatus("watching");
      setShowUploadDialog(true);
      await scanTetheredFolder(true);
    } catch (err) {
      setTetheredEnabled(false);
      if ((err as Error).name !== "AbortError") {
        console.warn("tethered folder selection failed", err);
        setTetheredStatus("error");
      }
    }
  }, [scanTetheredFolder]);

  const handleTetheredEnableToggle = useCallback(() => {
    if (tetheredEnabled) {
      stopTetheredFolder();
      return;
    }
    void startTetheredFolder();
  }, [startTetheredFolder, stopTetheredFolder, tetheredEnabled]);

  useEffect(() => {
    if (tetheredStatus !== "watching" || !tetheredDirectoryRef.current) return;
    if (tetheredPollTimerRef.current !== null) {
      window.clearInterval(tetheredPollTimerRef.current);
    }
    tetheredPollTimerRef.current = window.setInterval(() => {
      void scanTetheredFolder(false);
    }, tetheredPollIntervalMs);
    return () => {
      if (tetheredPollTimerRef.current !== null) {
        window.clearInterval(tetheredPollTimerRef.current);
        tetheredPollTimerRef.current = null;
      }
    };
  }, [scanTetheredFolder, tetheredPollIntervalMs, tetheredStatus]);

  useEffect(() => {
    return () => stopTetheredFolder();
  }, [stopTetheredFolder]);

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
        items &&
        Array.from(items).some((it) => {
          const entry = (
            it as DataTransferItem & {
              webkitGetAsEntry?: () => { isDirectory: boolean } | null;
            }
          ).webkitGetAsEntry?.();
          return !!entry?.isDirectory;
        });
      if (hasDirectory) {
        collectFilesFromDataTransfer(items).then((all) => {
          submitFiles(all.filter(isAcceptedStillImageFile));
        });
        return;
      }
      const files = Array.from(e.dataTransfer.files).filter(
        isAcceptedStillImageFile,
      );
      submitFiles(files);
    },
    [submitFiles],
  );

  const handleFileSelect = useCallback(() => {
    if (photoFileInputRef.current) {
      photoFileInputRef.current.value = "";
      photoFileInputRef.current.click();
    }
  }, []);

  // Folder-picker variant. Sets the `webkitdirectory` attribute (also
  // exposed as a DOM property) so the OS picker opens a folder
  // selector instead of a file selector — the user picks ONE folder
  // and the browser returns every file inside it, recursively. The
  // `accept` hint still applies but is treated as advisory by the
  // folder picker, so we additionally filter through
  // isAcceptedStillImageFile to discard stray .DS_Store / .ini / sidecar
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
    input.accept = FILE_PICKER_STILL_IMAGE_ACCEPT;
    (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory =
      true;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
    input.onchange = () => {
      if (input.files) {
        submitFiles(Array.from(input.files).filter(isAcceptedStillImageFile));
      }
    };
    input.click();
  }, [submitFiles]);

  const tetheredLastDetectedLabel = tetheredLastDetectedAt
    ? `Last detected: ${formatTetheredRelativeTime(tetheredLastDetectedAt)}`
    : "Last detected: no photos yet";
  const tetheredPollDisplay = `${(tetheredPollIntervalMs / 1000).toFixed(1)}s`;
  const tetheredIsWatching = tetheredStatus === "watching";
  const tetheredIsPaused = tetheredStatus === "paused";
  const tetheredControlsEnabled =
    tetheredEnabled && Boolean(tetheredFolderName);
  const tetheredControlsVisible = tetheredControlsEnabled;

  const renderTetheredCapturePanel = (variant: "mobile" | "desktop") => (
    <div
      data-testid={
        variant === "mobile"
          ? "upload-mobile-tethered-capture"
          : "upload-desktop-tethered-capture"
      }
      className={cn(
        "rounded-2xl border border-border-default bg-surface-container-low p-4",
        variant === "mobile" ? "lg:hidden" : "",
      )}
    >
      <div className="flex items-start gap-3">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">
                Tethered capture
              </h3>
              <p className="mt-1 text-xs text-text-secondary sm:text-sm">
                Watch a camera output folder and upload new photos
                automatically.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleSwitch
                data-testid="tethered-enable-toggle"
                checked={tetheredEnabled}
                label="Tethered capture"
                checkedLabel="Enabled"
                uncheckedLabel="Enable"
                title={
                  tetheredEnabled
                    ? "Disable tethered capture"
                    : "Enable tethered capture"
                }
                onCheckedChange={() => handleTetheredEnableToggle()}
              />
              {tetheredEnabled && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    tetheredIsWatching
                      ? "bg-success/10 text-success"
                      : tetheredIsPaused
                        ? "bg-feedback-warning/10 text-feedback-warning"
                        : tetheredFolderName
                          ? "bg-surface-sunken text-text-secondary"
                          : "bg-accent-subtle text-accent",
                  )}
                >
                  {tetheredIsWatching
                    ? "Live"
                    : tetheredIsPaused
                      ? "Paused"
                      : tetheredFolderName
                        ? "Idle"
                        : "Ready"}
                </span>
              )}
            </div>
          </div>

          {tetheredControlsVisible && (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {tetheredFolderName ? (
                  <>
                    <span className="min-w-0 max-w-full truncate rounded-xl bg-surface-sunken px-3 py-2 text-xs font-medium text-text-primary">
                      Watching {tetheredFolderName}
                    </span>
                    <span
                      data-testid="tethered-session-count"
                      className="rounded-xl bg-surface-sunken px-3 py-2 text-xs font-medium text-text-secondary"
                    >
                      + {tetheredSessionNewCount} this session
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    data-testid="tethered-watch-folder-button"
                    className="btn-primary px-3 py-2 text-xs"
                    onClick={startTetheredFolder}
                  >
                    Watch folder
                  </button>
                )}
                <button
                  type="button"
                  data-testid="tethered-sound-toggle"
                  aria-pressed={tetheredSoundEnabled}
                  className={cn(
                    "btn-tertiary px-3 py-2 text-xs",
                    tetheredSoundEnabled
                      ? "border-accent bg-accent-subtle text-accent"
                      : "",
                  )}
                  onClick={() => setTetheredSoundEnabled((enabled) => !enabled)}
                >
                  Sound
                </button>
                <button
                  type="button"
                  data-testid="tethered-pause-toggle"
                  disabled={
                    !tetheredControlsEnabled || tetheredStatus === "error"
                  }
                  className="btn-tertiary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={
                    tetheredIsPaused
                      ? resumeTetheredFolder
                      : pauseTetheredFolder
                  }
                >
                  {tetheredIsPaused ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  data-testid="tethered-stop-button"
                  disabled={!tetheredControlsEnabled}
                  className="btn-danger px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={stopTetheredFolder}
                >
                  Stop
                </button>
              </div>

              <p className="mt-3 text-xs text-text-secondary">
                {tetheredLastDetectedLabel}
              </p>

              <div className="mt-4 space-y-3 rounded-xl border border-border-subtle bg-surface-elevated p-3">
                <label className="grid gap-2 text-xs text-text-secondary">
                  <span className="flex items-center justify-between gap-3">
                    <span>Poll every</span>
                    <span className="font-semibold text-text-primary">
                      {tetheredPollDisplay}
                    </span>
                  </span>
                  <input
                    type="range"
                    data-testid="tethered-poll-slider"
                    min={TETHERED_MIN_POLL_MS}
                    max={TETHERED_MAX_POLL_MS}
                    step={TETHERED_POLL_STEP_MS}
                    value={tetheredPollIntervalMs}
                    onChange={(event) =>
                      setTetheredPollIntervalMs(
                        Number(event.currentTarget.value),
                      )
                    }
                    className="w-full accent-accent"
                  />
                </label>
                <div
                  className={cn(
                    "grid gap-2 text-xs text-text-secondary",
                    variant === "desktop" ? "grid-cols-1" : "sm:grid-cols-3",
                  )}
                >
                  <label className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-sunken px-3 py-2">
                    <input
                      type="checkbox"
                      data-testid="tethered-recursive-toggle"
                      checked={tetheredIncludeSubfolders}
                      onChange={(event) =>
                        setTetheredIncludeSubfolders(
                          event.currentTarget.checked,
                        )
                      }
                      className="accent-accent"
                    />
                    <span>Include subfolders</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-sunken px-3 py-2">
                    <input
                      type="checkbox"
                      data-testid="tethered-newest-first-toggle"
                      checked={tetheredNewestFirst}
                      onChange={(event) =>
                        setTetheredNewestFirst(event.currentTarget.checked)
                      }
                      className="accent-accent"
                    />
                    <span>Newest first</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-sunken px-3 py-2">
                    <input
                      type="checkbox"
                      data-testid="tethered-auto-open-toggle"
                      checked={tetheredAutoOpen}
                      onChange={(event) =>
                        setTetheredAutoOpen(event.currentTarget.checked)
                      }
                      className="accent-accent"
                    />
                    <span>Auto-open new photo</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {tetheredStatus === "unsupported" && (
            <p className="mt-3 text-xs text-feedback-warning">
              Folder watching requires a Chromium browser. Use Select files or
              Choose folder as fallback.
            </p>
          )}
          {tetheredStatus === "error" && (
            <p className="mt-3 text-xs text-feedback-error">
              Folder watching stopped. Choose the folder again to continue.
            </p>
          )}
        </div>
      </div>
    </div>
  );

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
        <p className="text-sm text-text-secondary">
          {error || "Gallery not found."}
        </p>
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
            {activeAlbumDetails && (
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
                <button
                  type="button"
                  onClick={() => setActiveAlbum(null)}
                  className="text-accent-primary transition-colors hover:text-accent-hover hover:underline"
                  aria-label={`Show all photos in ${gallery.title}`}
                >
                  {gallery.title}
                </button>
                <span className="text-text-tertiary">/</span>
                <span className="text-text-primary">
                  {activeAlbumDetails.name}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {editingTitle ? (
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  onBlur={async () => {
                    if (
                      draftTitle.trim() &&
                      draftTitle.trim() !== gallery.title
                    ) {
                      const t = getStoredAccessToken();
                      if (t) {
                        try {
                          const updated = await updateGallery(t, id, {
                            title: draftTitle.trim(),
                          });
                          setGallery(updated);
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Failed to update title",
                          );
                        }
                      }
                    }
                    setEditingTitle(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setEditingTitle(false);
                      setDraftTitle(gallery.title);
                    }
                  }}
                  className="min-w-0 flex-1 basis-full border-b-2 border-accent-primary bg-transparent text-2xl font-semibold text-text-primary focus:outline-none sm:basis-auto"
                  autoFocus
                />
              ) : (
                <h1
                  className="min-w-0 text-2xl font-semibold text-text-primary transition-colors hover:text-accent-primary cursor-pointer group"
                  onClick={() => {
                    setDraftTitle(gallery.title);
                    setEditingTitle(true);
                  }}
                  title="Click to edit title"
                >
                  {gallery.title}
                  <svg
                    className="ml-2 inline-block h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                    />
                  </svg>
                </h1>
              )}
              {/* Single publish-state toggle button — shows current state
                  and acts as the action. Collapsed from the previous two-
                  element layout (status badge + separate action button). */}
              <ToggleSwitch
                checked={gallery.is_published}
                label="Gallery publish state"
                checkedLabel="Published"
                uncheckedLabel="Unpublished"
                busy={publishing}
                className="shrink-0"
                // S5-G1: marks this as a mutating control so it visually disables
                // under an impersonation (read-only) session — the server would
                // 403 the updateGallery call anyway.
                data-mutation
                onCheckedChange={() => void togglePublishState()}
                title={
                  gallery.is_published
                    ? "Unpublish - client links will stop working"
                    : "Publish - clients will be able to view this gallery"
                }
              />
            </div>
            {editingDesc ? (
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                onBlur={async () => {
                  if (draftDesc !== (gallery.description || "")) {
                    const t = getStoredAccessToken();
                    if (t) {
                      try {
                        const updated = await updateGallery(t, id, {
                          description: draftDesc.trim(),
                        });
                        setGallery(updated);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Failed to update description",
                        );
                      }
                    }
                  }
                  setEditingDesc(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditingDesc(false);
                    setDraftDesc(gallery.description || "");
                  }
                }}
                className="mt-2 w-full max-w-3xl text-sm leading-relaxed text-text-secondary bg-transparent border border-accent-primary rounded-lg px-3 py-2 focus:outline-none resize-none"
                rows={2}
                autoFocus
              />
            ) : (
              <p
                className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => {
                  setDraftDesc(gallery.description || "");
                  setEditingDesc(true);
                }}
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
          {/* GAL-FR-118: view-as-client — public/client route is available only after publishing. */}
          {gallery.is_published && gallery.slug && (
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
          <div id="photos" className="surface-panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Assets
              </h2>
              <div className="flex items-center gap-3">
                {bulkMode ? (
                  <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border-default bg-surface-container px-3 py-2">
                    <span className="text-xs font-medium text-text-secondary">
                      {selectedAssetIds.size} selected
                    </span>
                    <button
                      type="button"
                      onClick={
                        allVisibleAssetsSelected
                          ? clearSelectedAssets
                          : selectAllAssets
                      }
                      className="btn-tertiary px-3 py-1.5 text-xs"
                      disabled={visibleSelectableAssetIds.length === 0}
                    >
                      {allVisibleAssetsSelected
                        ? "Clear selected"
                        : "Select all"}
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={selectedAssetIds.size === 0}
                      className="btn-danger px-3 py-1.5 text-xs disabled:opacity-30"
                    >
                      Delete selected
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="btn-tertiary px-3 py-1.5 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    {assets.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setBulkMode(true)}
                        className="btn-tertiary inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                      >
                        <CheckCircle className="h-4 w-4" aria-hidden="true" />
                        Select photos
                      </button>
                    )}
                  </>
                )}
                <div className="flex items-center gap-2">
                  <input
                    ref={photoFileInputRef}
                    data-testid="gallery-photo-file-input"
                    className="sr-only"
                    type="file"
                    multiple
                    accept={FILE_PICKER_STILL_IMAGE_ACCEPT}
                    onChange={(event) => {
                      submitFiles(
                        Array.from(event.currentTarget.files ?? []).filter(
                          isAcceptedStillImageFile,
                        ),
                      );
                      event.currentTarget.value = "";
                    }}
                  />
                  <button
                    onClick={() => setShowUploadDialog(true)}
                    className="btn-primary px-3 py-1.5 text-xs"
                  >
                    Upload Photos
                  </button>
                  <button
                    onClick={() => {
                      setShowUploadDialog(true);
                      handleFolderSelect();
                    }}
                    className="btn-tertiary px-3 py-1.5 text-xs"
                    title="Pick a folder — every photo inside (including subfolders) is uploaded."
                  >
                    Upload Folder
                  </button>
                </div>
              </div>
            </div>

            <div
              id="albums"
              className="rounded-xl border border-border-subtle bg-surface-sunken/40 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    Sub-galleries
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Group photos for rituals, family sets, or client-only share
                    links.
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                      if (e.key === "Escape") {
                        setShowAlbumCreate(false);
                        setNewAlbumName("");
                      }
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
                      : creatingAlbum
                        ? "Creating..."
                        : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAlbumCreate(false);
                      setNewAlbumName("");
                    }}
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
                      {album.name} (
                      {albumAssetIdsByAlbum[album.id]?.length ?? 0})
                    </option>
                  ))}
                </select>
                {(() => {
                  // Derive the share metadata for whichever option the
                  // dropdown currently has selected. activeAlbum === null
                  // means "All Photos" — copyShareUrl/buildShareUrl with
                  // no argument is the gallery-wide canonical share URL.
                  const selectedAlbum = activeAlbum
                    ? albums.find((a) => a.id === activeAlbum)
                    : null;
                  const selectedLabel = selectedAlbum
                    ? selectedAlbum.name
                    : "All Photos";
                  const selectedIsShareable =
                    !selectedAlbum || albumIsEditable(selectedAlbum);
                  return (
                    <>
                      {selectedIsShareable && (
                        <>
                          <GlassIconButton
                            type="button"
                            size="md"
                            variant="ghost"
                            onClick={() => copyShareUrl(selectedAlbum?.id)}
                            label={`Copy ${selectedLabel} share link`}
                            aria-disabled={!gallery.is_published}
                            className="shrink-0 border-border-default bg-surface-container text-text-secondary hover:border-accent-primary/60 hover:bg-surface-container-high hover:text-accent-primary"
                          >
                            <Share />
                          </GlassIconButton>
                          <GlassIconButton
                            type="button"
                            size="md"
                            variant="ghost"
                            onClick={() =>
                              openShareLink(selectedAlbum?.id, selectedLabel)
                            }
                            label={`Email ${selectedLabel} share link`}
                            aria-disabled={!gallery.is_published}
                            className="shrink-0 border-border-default bg-surface-container text-text-secondary hover:border-accent-primary/60 hover:bg-surface-container-high hover:text-accent-primary"
                          >
                            <Envelope />
                          </GlassIconButton>
                        </>
                      )}
                      {selectedAlbum && albumIsEditable(selectedAlbum) && (
                        <GlassIconButton
                          type="button"
                          size="md"
                          variant="danger"
                          onClick={() => void handleDeleteAlbum(selectedAlbum)}
                          label={`Delete ${selectedLabel}`}
                          disabled={savingAlbumId === selectedAlbum.id}
                          className="shrink-0"
                        >
                          <Trash />
                        </GlassIconButton>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Desktop (sm+): two-segment chip strip. Each chip is split
                  into a name+count-badge "select" segment and a share
                  action segment, separated by a subtle inner divider
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
                      !activeAlbum
                        ? "text-accent-primary"
                        : "text-text-secondary hover:text-text-primary",
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
                  <div className="flex items-center gap-1 border-l border-border-subtle px-1">
                    <GlassIconButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyShareUrl()}
                      label="Copy All Photos share link"
                      aria-disabled={!gallery.is_published}
                      className="text-text-tertiary hover:bg-surface-sunken hover:text-accent-primary"
                    >
                      <Share />
                    </GlassIconButton>
                    <GlassIconButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => openShareLink(undefined, "All Photos")}
                      label="Email All Photos share link"
                      aria-disabled={!gallery.is_published}
                      className="text-text-tertiary hover:bg-surface-sunken hover:text-accent-primary"
                    >
                      <Envelope />
                    </GlassIconButton>
                  </div>
                </div>
                {albums.map((album) => {
                  const assetCount =
                    albumAssetIdsByAlbum[album.id]?.length ?? 0;
                  const isEditableAlbum = albumIsEditable(album);
                  const isSavingAlbum = savingAlbumId === album.id;
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
                      // Smart utility albums stay filter-only; editable custom
                      // albums keep share/email/delete actions.
                      className={cn(
                        "group flex shrink-0 items-stretch overflow-hidden rounded-xl border transition-all",
                        isActive
                          ? "border-accent-primary bg-accent-subtle shadow-sm"
                          : "border-border-default bg-surface-container hover:border-accent-primary/60 hover:bg-surface-container-high",
                      )}
                      onDragOver={(e) => {
                        const hasInternal = e.dataTransfer.types.includes(
                          "application/x-rawdrive-asset-ids",
                        );
                        if (hasInternal) {
                          e.preventDefault();
                          e.currentTarget.classList.add(
                            "ring-2",
                            "ring-accent-primary",
                          );
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove(
                          "ring-2",
                          "ring-accent-primary",
                        );
                      }}
                      onDrop={async (e) => {
                        e.currentTarget.classList.remove(
                          "ring-2",
                          "ring-accent-primary",
                        );
                        const raw = e.dataTransfer.getData(
                          "application/x-rawdrive-asset-ids",
                        );
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
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Failed to add photos to sub-gallery",
                          );
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveAlbum(album.id)}
                        className={cn(
                          "flex max-w-[14rem] items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-colors",
                          isActive
                            ? "text-accent-primary"
                            : "text-text-secondary hover:text-text-primary",
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
                      {isEditableAlbum && (
                        <div className="flex items-center border-l border-border-subtle">
                          <div className="flex items-center gap-1 px-1">
                            <GlassIconButton
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => copyShareUrl(album.id)}
                              label={`Copy ${album.name} share link`}
                              aria-disabled={!gallery.is_published}
                              className="text-text-tertiary hover:bg-surface-sunken hover:text-accent-primary"
                            >
                              <Share />
                            </GlassIconButton>
                            <GlassIconButton
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                openShareLink(album.id, album.name)
                              }
                              label={`Email ${album.name} share link`}
                              aria-disabled={!gallery.is_published}
                              className="text-text-tertiary hover:bg-surface-sunken hover:text-accent-primary"
                            >
                              <Envelope />
                            </GlassIconButton>
                            <GlassIconButton
                              type="button"
                              size="sm"
                              variant="danger"
                              label={`Delete ${album.name}`}
                              onClick={() => void handleDeleteAlbum(album)}
                              disabled={isSavingAlbum}
                            >
                              <Trash />
                            </GlassIconButton>
                          </div>
                        </div>
                      )}
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
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                "rounded-2xl border-2 border-dashed px-6 py-8 text-center text-sm transition-colors cursor-pointer",
                isDragOver
                  ? "border-accent bg-accent/5 text-accent"
                  : "border-border-default bg-surface-sunken/40 text-text-secondary hover:border-accent/50 hover:bg-accent/[0.02]",
              )}
              onClick={() => setShowUploadDialog(true)}
            >
              <p className="font-medium">
                {isDragOver
                  ? "Drop photos or folders here"
                  : "Drag photos or folders here, or click to open upload"}
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                Browser upload: JPEG, PNG, WebP, GIF up to{" "}
                {browserE2EEMaxUploadSizeLabel()}. RAW, TIFF, HEIC/AVIF use
                RawDrive Desktop for source-side encryption.
              </p>
            </div>

            {visibleAssets.length > 0 && (
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs text-text-tertiary">
                  {visibleAssets.length} photo
                  {visibleAssets.length === 1 ? "" : "s"}
                </span>
                <GalleryViewSwitcher
                  value={photoViewMode}
                  onChange={setPhotoViewMode}
                  size="sm"
                />
              </div>
            )}

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
              <div className={cn(PHOTO_VIEW_CONTAINER[photoViewMode])}>
                {pagedAssets.map((entry) => {
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
                    ? (favoritesCountByAsset.get(entry.asset.id) ?? 0)
                    : 0;
                  const isSelected = Boolean(
                    entry.asset && selectedAssetIds.has(entry.asset.id),
                  );
                  const tileLabel = entry.asset?.filename || "photo";

                  return (
                    <article
                      key={entry.id}
                      className={cn(
                        "surface-panel relative cursor-pointer overflow-hidden transition-shadow hover:shadow-lg group",
                        PHOTO_VIEW_TILE[photoViewMode],
                        bulkMode &&
                          entry.asset &&
                          isSelected &&
                          "ring-2 ring-accent-primary",
                      )}
                      // QA #18: in bulk mode, each tile is draggable. Drop
                      // target is the album chip above. Carries either the
                      // whole selection set (when the dragged asset is part
                      // of the selection) or just this one asset (when
                      // dragging an unselected tile).
                      draggable={!!entry.asset}
                      onDragStart={(e) => {
                        if (!entry.asset) return;
                        const ids =
                          bulkMode && isSelected
                            ? Array.from(selectedAssetIds)
                            : [entry.asset.id];
                        e.dataTransfer.setData(
                          "application/x-rawdrive-asset-ids",
                          JSON.stringify(ids),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => {
                        if (bulkMode && entry.asset) {
                          toggleAssetSelection(entry.asset.id);
                          return;
                        }
                        const idx = assets.findIndex((a) => a.id === entry.id);
                        if (idx !== -1) setLightboxIndex(idx);
                      }}
                      role={bulkMode ? "checkbox" : "button"}
                      aria-checked={bulkMode ? isSelected : undefined}
                      tabIndex={0}
                      aria-label={
                        bulkMode
                          ? `${isSelected ? "Deselect" : "Select"} ${tileLabel}`
                          : `View ${tileLabel}`
                      }
                      onKeyDown={(e) => {
                        if (e.currentTarget !== e.target) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (bulkMode && entry.asset) {
                            toggleAssetSelection(entry.asset.id);
                            return;
                          }
                          const idx = assets.findIndex(
                            (a) => a.id === entry.id,
                          );
                          if (idx !== -1) setLightboxIndex(idx);
                        }
                      }}
                    >
                      {bulkMode && entry.asset && (
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                            isSelected
                              ? "border-accent-primary bg-accent-primary text-text-inverse"
                              : "border-border-strong bg-surface-overlay text-text-secondary glass-blur-medium",
                          )}
                        >
                          {isSelected && <CheckCircle className="h-4 w-4" />}
                        </span>
                      )}
                      {favoriteCount > 0 && (
                        <div
                          className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-surface-scrim-strong/60 px-2 py-0.5 text-xs font-medium text-text-media glass-blur-subtle"
                          aria-label={`${favoriteCount} guest favorite${favoriteCount === 1 ? "" : "s"}`}
                        >
                          <svg
                            className="h-3.5 w-3.5 text-error"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M12 21s-7-4.5-9.5-9C.5 8.5 2 4 6 4c2 0 3.5 1 4 2 .5-1 2-2 4-2 4 0 5.5 4.5 3.5 8-2.5 4.5-9.5 9-9.5 9z" />
                          </svg>
                          {favoriteCount}
                        </div>
                      )}
                      <div className="relative">
                        <GalleryAssetTileImage
                          asset={entry.asset}
                          token={token}
                          isProcessing={isProcessing}
                          aspectRatio={
                            (photoViewMode === "masonry" ||
                              photoViewMode === "justified") &&
                            entry.asset?.width &&
                            entry.asset?.height
                              ? entry.asset.width / entry.asset.height
                              : null
                          }
                        />
                        {!bulkMode && entry.asset && !isProcessing && (
                          <div
                            className="absolute bottom-2 right-2 z-10 flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GlassIconButton
                              size="md"
                              variant={
                                copiedAssetId === entry.asset.id
                                  ? "success"
                                  : "accent"
                              }
                              label={
                                copiedAssetId === entry.asset.id
                                  ? `${entry.asset.filename} link copied`
                                  : `Share ${entry.asset.filename}`
                              }
                              className={cn(
                                "!text-text-media shadow-elevation-1 ring-2 ring-surface-raised/60 hover:!text-text-media",
                                copiedAssetId === entry.asset.id
                                  ? "!bg-feedback-success hover:!bg-feedback-success/90"
                                  : "!bg-accent-primary hover:!bg-accent-primary/90",
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleShareAsset(e, entry.asset!.id);
                              }}
                            >
                              <Share />
                            </GlassIconButton>
                            <GlassIconButton
                              size="md"
                              variant="danger"
                              label={`Delete ${entry.asset.filename}`}
                              className="!bg-feedback-error !text-text-media shadow-elevation-1 ring-2 ring-surface-raised/60 hover:!bg-feedback-error/90 hover:!text-text-media"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm({
                                  assetId: entry.asset!.id,
                                  filename:
                                    entry.asset!.filename || "this photo",
                                });
                              }}
                            >
                              <Trash />
                            </GlassIconButton>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 p-4">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {entry.asset?.filename ?? "Photo unavailable"}
                        </p>
                        {entry.is_hero && (
                          <div className="flex items-center justify-end text-xs text-text-secondary">
                            <span className="status-badge status-badge--accent">
                              Hero
                            </span>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* F-046: grow the render window on demand. Showing X of N keeps
                the photographer oriented in a large wedding gallery without
                mounting every tile up front. */}
            {hasMoreAssets && (
              <div className="flex flex-col items-center gap-2 py-4">
                <button
                  type="button"
                  onClick={() => setVisibleLimit((n) => n + GRID_PAGE_SIZE)}
                  className="rounded-xl border border-border-default bg-surface-sunken/60 px-5 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-accent/50 hover:bg-accent/[0.04] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  Load more photos
                </button>
                <span className="text-xs text-text-tertiary">
                  Showing {pagedAssets.length} of {visibleAssets.length}
                </span>
              </div>
            )}

            {gallery && (
              <EmbeddedVideosPanel
                galleryId={id}
                initialVideos={readEmbeddedVideos(
                  gallery.settings as Record<string, unknown>,
                )}
                onChange={(next: EmbeddedVideo[]) => {
                  setGallery((prev) =>
                    prev
                      ? {
                          ...prev,
                          settings: {
                            ...(prev.settings ?? {}),
                            embedded_videos: next,
                          },
                        }
                      : prev,
                  );
                }}
              />
            )}
          </div>
        </section>
      </div>

      {uploadDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim p-2 glass-blur-medium sm:p-4"
          onClick={(e) => {
            if (e.currentTarget === e.target && uploadDialogCanClose)
              setShowUploadDialog(false);
          }}
        >
          <section
            ref={uploadDialogRef}
            data-testid="gallery-upload-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Upload photos to gallery"
            aria-describedby="gallery-upload-dialog-description"
            tabIndex={-1}
            className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-elevation-1"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-start gap-3">
                <GlassIconButton
                  type="button"
                  size="md"
                  variant="ghost"
                  label={
                    activeUploadCount > 0
                      ? "Back to gallery; uploads continue"
                      : "Back to gallery"
                  }
                  data-testid="upload-dialog-back"
                  className="shrink-0 text-text-secondary hover:text-text-primary"
                  onClick={handleUploadDialogBack}
                >
                  <ChevronLeft />
                </GlassIconButton>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-text-primary sm:text-lg">
                    Upload photos to gallery
                  </h2>
                  <p
                    id="gallery-upload-dialog-description"
                    className="text-sm text-text-secondary"
                  >
                    {uploadStatusHeadline}
                  </p>
                  <div
                    data-testid="upload-mobile-status"
                    className="mt-3 flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-sunken px-3 py-2 md:hidden"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-text-inverse">
                      {uploadStage === "details"
                        ? 1
                        : uploadStage === "processing"
                          ? 2
                          : 3}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text-primary">
                        {uploadStage === "details"
                          ? "Select photos"
                          : uploadStage === "processing"
                            ? "Processing upload"
                            : "Visibility"}
                      </span>
                      <span className="block truncate text-xs text-text-secondary">
                        {uploadStage === "details"
                          ? "Choose files or a folder"
                          : uploadStage === "processing"
                            ? "Encrypting and uploading"
                            : gallery.is_published
                              ? "Client links live"
                              : "Private until published"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              {uploadDialogCanClose && (
                <GlassIconButton
                  size="md"
                  variant="ghost"
                  label="Close upload dialog"
                  className="text-text-secondary hover:text-text-primary"
                  onClick={() => setShowUploadDialog(false)}
                >
                  <XMark />
                </GlassIconButton>
              )}
            </div>

            <div
              data-testid="upload-desktop-stepper"
              className="hidden border-b border-border-subtle px-6 py-4 md:grid md:grid-cols-3 md:gap-3"
            >
              {[
                {
                  key: "details" as const,
                  label: "Details",
                  helper: "Select files",
                },
                {
                  key: "processing" as const,
                  label: "Processing",
                  helper: "Encrypt and upload",
                },
                {
                  key: "visibility" as const,
                  label: "Visibility",
                  helper: gallery.is_published
                    ? "Client links live"
                    : "Unpublished",
                },
              ].map((step, index) => {
                const active = uploadStage === step.key;
                const done =
                  (step.key === "details" && uploadStage !== "details") ||
                  (step.key === "processing" && uploadStage === "visibility");
                return (
                  <div
                    key={step.key}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2",
                      active
                        ? "border-accent bg-accent-subtle"
                        : done
                          ? "border-border-default bg-surface-container-low"
                          : "border-border-subtle bg-surface-sunken",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        active || done
                          ? "bg-accent text-text-inverse"
                          : "bg-surface-container-high text-text-secondary",
                      )}
                    >
                      {done ? <CheckCircle className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-text-primary">
                        {step.label}
                      </span>
                      <span className="block truncate text-xs text-text-secondary">
                        {step.helper}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-4 overflow-y-auto p-4 sm:p-5 lg:grid-cols-3 lg:gap-6 lg:p-6">
              <div className="space-y-4 lg:col-span-2">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={handleFileSelect}
                  role="button"
                  tabIndex={0}
                  aria-label="Select or drop photos for upload"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleFileSelect();
                    }
                  }}
                  className={cn(
                    "relative flex min-h-56 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors sm:min-h-80 sm:px-6 sm:py-10",
                    isDragOver
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-border-default bg-surface-sunken text-text-secondary hover:border-accent hover:bg-accent-subtle",
                  )}
                >
                  {uploadPreviewBackendAsset && (
                    <>
                      <UploadDropzoneBackendPreview
                        asset={uploadPreviewBackendAsset}
                        token={token}
                      />
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-surface-scrim/70"
                      />
                    </>
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated text-text-primary shadow-elevation-1 sm:mb-5 sm:h-20 sm:w-20">
                      <Plus className="h-8 w-8 sm:h-9 sm:w-9" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary sm:text-xl">
                      {isDragOver
                        ? "Drop photos to start upload"
                        : "Add photos"}
                    </h3>
                    <p className="mt-2 max-w-md text-sm text-text-secondary">
                      Camera JPEG/JFIF, PNG, WebP and GIF up to{" "}
                      {browserE2EEMaxUploadSizeLabel()} per file. RAW, TIFF,
                      HEIC and AVIF use RawDrive Desktop.
                    </p>
                    <div className="mt-5 flex w-full flex-col items-stretch justify-center gap-2 sm:mt-6 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                      <button
                        type="button"
                        className="btn-primary px-5 py-2 text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileSelect();
                        }}
                      >
                        Select files
                      </button>
                      <button
                        type="button"
                        className="btn-tertiary px-5 py-2 text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFolderSelect();
                        }}
                      >
                        Choose folder
                      </button>
                    </div>
                  </div>
                </div>

                <div data-testid="upload-mobile-tethered-capture">
                  {renderTetheredCapturePanel("mobile")}
                </div>

                <div className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary">
                        Processing queue
                      </h3>
                      <p className="text-xs text-text-secondary">
                        {upload.items.length > 0
                          ? uploadStatusHeadline
                          : "Files appear here after selection."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeUploadCount > 0 && (
                        <>
                          {upload.isPaused ? (
                            <button
                              onClick={upload.resumeAll}
                              className="btn-tertiary px-3 py-1.5 text-xs"
                            >
                              Resume all
                            </button>
                          ) : (
                            <button
                              onClick={upload.pauseAll}
                              className="btn-tertiary px-3 py-1.5 text-xs"
                            >
                              Pause all
                            </button>
                          )}
                          <button
                            onClick={upload.cancelAll}
                            className="btn-danger px-3 py-1.5 text-xs"
                          >
                            Cancel all
                          </button>
                        </>
                      )}
                      {activeUploadCount === 0 && failedUploadCount > 0 && (
                        <button
                          onClick={upload.retryAll}
                          className="btn-tertiary px-3 py-1.5 text-xs"
                        >
                          Retry all ({failedUploadCount})
                        </button>
                      )}
                      {activeUploadCount === 0 &&
                        (failedUploadCount > 0 || blockedUploadCount > 0) && (
                          <button
                            onClick={upload.clearFinished}
                            className="btn-tertiary px-3 py-1.5 text-xs"
                          >
                            Dismiss
                          </button>
                        )}
                    </div>
                  </div>

                  {bytesTotal > 0 && (
                    <div className="mt-4 space-y-1">
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span>
                          {formatUploadBytes(bytesUploaded)} of{" "}
                          {formatUploadBytes(bytesTotal)}
                        </span>
                        <span className="font-medium text-text-primary">
                          {overallBytePercent}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className="h-full rounded-full bg-accent transition-all duration-300"
                          style={{ width: `${overallBytePercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                    {upload.items.length === 0 ? (
                      <div className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-5 text-center text-sm text-text-secondary">
                        No files selected yet.
                      </div>
                    ) : (
                      upload.items.map((item) => {
                        const warnings = visibleUploadWarnings(
                          item.scanManifest?.findings,
                        );
                        const isFailed = item.status === "error";
                        const isTerminal =
                          item.status === "complete" ||
                          item.status === "error" ||
                          item.status === "blocked" ||
                          item.status === "needs_desktop";
                        const statusLabel =
                          item.status === "complete"
                            ? "Done"
                            : isFailed
                              ? "Failed"
                              : item.status === "uploading"
                                ? "Uploading..."
                                : item.status === "encrypting"
                                  ? "Encrypting"
                                  : item.status === "paused"
                                    ? "Paused"
                                    : item.status === "screening"
                                      ? "Screening"
                                      : item.status === "pending"
                                        ? "Queued"
                                        : item.status === "blocked"
                                          ? "Blocked"
                                          : item.status === "needs_desktop"
                                            ? "Desktop"
                                            : item.status;
                        const statusTone =
                          item.status === "complete"
                            ? "text-success"
                            : isFailed
                              ? "text-error"
                              : item.status === "paused"
                                ? "text-feedback-warning"
                                : item.status === "blocked" ||
                                    item.status === "needs_desktop"
                                  ? "text-feedback-warning"
                                  : "text-text-secondary";
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                                {item.file.name}
                              </span>
                              <span className="text-text-tertiary tabular-nums">
                                {formatUploadBytes(item.file.size)}
                              </span>
                              <span
                                className={cn(
                                  "w-20 text-right font-medium",
                                  statusTone,
                                )}
                              >
                                {statusLabel}
                              </span>
                              {isFailed && (
                                <button
                                  type="button"
                                  onClick={() => upload.retry(item.id)}
                                  className="text-xs font-medium text-accent hover:underline"
                                >
                                  Retry
                                </button>
                              )}
                              {(item.status === "uploading" ||
                                item.status === "pending") && (
                                <button
                                  type="button"
                                  onClick={() => upload.pause(item.id)}
                                  className="text-xs font-medium text-text-secondary hover:text-text-primary"
                                >
                                  Pause
                                </button>
                              )}
                              {item.status === "paused" && (
                                <button
                                  type="button"
                                  onClick={() => upload.resume(item.id)}
                                  className="text-xs font-medium text-accent hover:underline"
                                >
                                  Resume
                                </button>
                              )}
                              {isTerminal && (
                                <button
                                  type="button"
                                  onClick={() => upload.dismiss(item.id)}
                                  className="text-xs font-medium text-text-tertiary hover:text-text-primary"
                                  aria-label={`Dismiss ${item.file.name}`}
                                >
                                  Dismiss
                                </button>
                              )}
                            </div>
                            {(isFailed ||
                              item.status === "blocked" ||
                              item.status === "needs_desktop") &&
                              item.error && (
                                <p
                                  className={cn(
                                    "mt-2 text-xs",
                                    isFailed
                                      ? "text-error"
                                      : "text-feedback-warning",
                                  )}
                                >
                                  {item.error}
                                </p>
                              )}
                            {warnings.length > 0 && (
                              <p className="mt-2 text-xs text-feedback-warning">
                                {warnings.length === 1
                                  ? warnings[0].message
                                  : `${warnings.length} scan warnings`}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <aside
                data-testid="upload-desktop-sidebar"
                className="hidden space-y-4 lg:block"
              >
                <div className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                  <h3 className="text-sm font-semibold text-text-primary">
                    Details
                  </h3>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-text-tertiary">
                        Destination
                      </dt>
                      <dd className="mt-1 font-medium text-text-primary">
                        {gallery.title}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-text-tertiary">
                        Sub-gallery
                      </dt>
                      <dd className="mt-1 font-medium text-text-primary">
                        {activeAlbumDetails?.name ?? "All Photos"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                  <h3 className="text-sm font-semibold text-text-primary">
                    Visibility
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    {gallery.is_published
                      ? "This gallery is published. Uploaded photos appear after processing completes."
                      : "This gallery is unpublished. Uploaded photos stay private until you publish it."}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <ToggleSwitch
                      checked={gallery.is_published}
                      label="Gallery visibility"
                      checkedLabel="Published"
                      uncheckedLabel="Publish gallery"
                      busy={publishing}
                      onCheckedChange={() => void togglePublishState()}
                    />
                  </div>
                  <div
                    data-testid="visibility-share-links"
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <span className="text-xs font-semibold text-text-secondary">
                      Share links
                    </span>
                    <GlassIconButton
                      type="button"
                      size="md"
                      variant="ghost"
                      onClick={() => copyShareUrl()}
                      label="Copy gallery share link"
                      aria-disabled={!gallery.is_published}
                      className="border-border-default bg-surface-container text-text-secondary hover:border-accent-primary/60 hover:bg-surface-container-high hover:text-accent-primary"
                    >
                      <Share />
                    </GlassIconButton>
                    <GlassIconButton
                      type="button"
                      size="md"
                      variant="ghost"
                      onClick={() => openShareLink(undefined, "Gallery")}
                      label="Email gallery share link"
                      aria-disabled={!gallery.is_published}
                      className="border-border-default bg-surface-container text-text-secondary hover:border-accent-primary/60 hover:bg-surface-container-high hover:text-accent-primary"
                    >
                      <Envelope />
                    </GlassIconButton>
                  </div>
                </div>

                {renderTetheredCapturePanel("desktop")}
              </aside>
            </div>
          </section>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-scrim-strong/50 glass-blur-subtle"
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl border border-text-media/10 bg-surface-container-high p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-on-surface">
              {deleteConfirm.isBulk
                ? `Delete ${deleteConfirm.filename}?`
                : "Delete photo?"}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              {deleteConfirm.isBulk
                ? `${deleteConfirm.filename.charAt(0).toUpperCase() + deleteConfirm.filename.slice(1)} will be permanently deleted. This cannot be undone.`
                : `"${deleteConfirm.filename}" will be permanently deleted. This cannot be undone.`}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-xl px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-overlay/10"
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
                        await bulkAssetAction(
                          t,
                          "delete",
                          Array.from(selectedAssetIds),
                        );
                        clearSelection();
                        await refreshGalleryAssets();
                        await refreshAlbums();
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Bulk delete failed",
                        );
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
          onPrev={() =>
            setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i))
          }
          onNext={() =>
            setLightboxIndex((i) =>
              i !== null && i < assets.length - 1 ? i + 1 : i,
            )
          }
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < assets.length - 1}
          isProofing={gallery?.gallery_type === "proofing"}
          onProofingAction={handleProofingAction}
          comments={commentsByAsset[assets[lightboxIndex].asset!.id] ?? []}
          onComment={async (assetId, comment) => {
            const t = getStoredAccessToken();
            if (!t || !gallery) return;
            const created = await createComment(t, gallery.id, {
              asset_id: assetId,
              author_name: "Studio",
              body: comment,
            });
            setCommentsByAsset((current) => {
              const existing = current[assetId] ?? [];
              if (existing.some((item) => item.id === created.id))
                return current;
              return {
                ...current,
                [assetId]: [...existing, created],
              };
            });
            return created;
          }}
          // M13: feed filmstrip + compare mode + watermark overlay (FR-088,092,093,094)
          allAssets={assets
            .map((a) => a.asset)
            .filter((a): a is Asset => a !== null)}
          gallery={gallery ?? undefined}
          onDeleteRequest={(targetAsset) => {
            setDeleteConfirm({
              assetId: targetAsset.id,
              filename: targetAsset.filename || "this photo",
            });
          }}
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
            "rounded-xl border border-border-default bg-surface-raised/95 glass-blur-medium",
            "shadow-xl px-4 py-3",
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
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
            <GlassIconButton
              size="sm"
              variant="ghost"
              label="Dismiss"
              className="-mr-1 -mt-1 text-text-tertiary"
              onClick={() =>
                setUploadToast((t) => (t ? { ...t, visible: false } : null))
              }
            >
              <XMark />
            </GlassIconButton>
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
            "rounded-xl border border-border-default bg-surface-raised/95 glass-blur-medium",
            "shadow-xl px-4 py-3",
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
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
                Rename the files locally and try again if you meant to upload
                them.
              </p>
            </div>
            <GlassIconButton
              size="sm"
              variant="ghost"
              label="Dismiss"
              className="-mr-1 -mt-1 text-text-tertiary"
              onClick={() =>
                setDuplicateWarning((t) =>
                  t ? { ...t, visible: false } : null,
                )
              }
            >
              <XMark />
            </GlassIconButton>
          </div>
        </div>
      )}

      {/* Terms-of-Service / copyright acceptance gate. Opened by the upload
          pre-check (submitFiles) or the backend 403 safety-net (onTermsRequired).
          On accept, handleTermsAccepted clears the gate and replays any stashed
          upload batch. */}
      <TermsAcceptanceModal
        open={termsModalOpen}
        token={token}
        onAccepted={handleTermsAccepted}
        onCancel={() => setTermsModalOpen(false)}
      />
    </div>
  );
}

// F-045: hydrate gallery entries into full Asset records WITHOUT firing
// one getAsset() per entry concurrently. The previous `Promise.all(
// entries.map(getAsset))` issued N parallel authenticated GETs — on a
// 500-photo gallery that saturates the HTTP/1.1 6-connection-per-host
// pool, delays time-to-interactive, and hammers the Go API + DB. We cap
// in-flight requests to HYDRATE_CONCURRENCY and walk the list in order,
// so the connection pool stays healthy and the grid still fills quickly.
// (The true fix is a batch/embedded-asset endpoint on the galleries API;
// this bounded worker pool is the in-page mitigation for the N+1.)
const HYDRATE_CONCURRENCY = 6;

function dedupeGalleryAssetEntries(entries: GalleryAsset[]): GalleryAsset[] {
  const seenAssetIds = new Set<string>();
  const deduped: GalleryAsset[] = [];
  for (const entry of entries) {
    if (seenAssetIds.has(entry.asset_id)) continue;
    seenAssetIds.add(entry.asset_id);
    deduped.push(entry);
  }
  return deduped;
}

async function hydrateGalleryAssets(
  token: string,
  entries: GalleryAsset[],
): Promise<GalleryAssetRecord[]> {
  const uniqueEntries = dedupeGalleryAssetEntries(entries);

  // PERF-23: when the server already embedded assets (?include_assets=true),
  // hydrate straight from the list response and skip the per-asset getAsset()
  // loop entirely. The bounded-concurrency pool below remains the fallback for
  // the un-embedded path (older server, or a degraded include response).
  if (
    uniqueEntries.length > 0 &&
    uniqueEntries.every((entry) => entry.asset !== undefined)
  ) {
    return uniqueEntries
      .map((entry) => ({ ...entry, asset: entry.asset ?? null }))
      .filter((entry): entry is GalleryAssetRecord => Boolean(entry.asset));
  }

  const results = new Array<GalleryAssetRecord>(uniqueEntries.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < uniqueEntries.length) {
      const index = cursor++;
      const entry = uniqueEntries[index];
      try {
        const asset = await getAsset(token, entry.asset_id);
        results[index] = { ...entry, asset };
      } catch {
        results[index] = { ...entry, asset: null };
      }
    }
  };
  const pool = Array.from(
    { length: Math.min(HYDRATE_CONCURRENCY, uniqueEntries.length) },
    () => worker(),
  );
  await Promise.all(pool);
  return results.filter((entry): entry is GalleryAssetRecord =>
    Boolean(entry?.asset),
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
