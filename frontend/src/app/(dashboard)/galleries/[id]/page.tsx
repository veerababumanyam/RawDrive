"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";
import { bulkAssetAction, getAsset, type Asset } from "@/lib/api/assets";
import {
  addAlbumAssets,
  addAssetToGallery,
  createGalleryAlbum,
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
import {
  assetIsProcessing,
  getAssetPreviewUrl,
  proofingStatusClasses,
} from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { useAssetReadySubscription } from "@/hooks/use-asset-ready-subscription";
import { PhotoLightbox } from "@/components/gallery/photo-lightbox";
import { FaceFilter } from "@/components/gallery/face-filter";
import { GalleryAIPanel } from "@/components/gallery/gallery-ai-panel";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { DeliveryContinuityPanel } from "@/components/gallery/delivery-continuity-panel";
import { SalesContinuityPanel } from "@/components/gallery/sales-continuity-panel";

type GalleryAssetRecord = GalleryAsset & {
  asset: Asset | null;
};

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
  const [authToken, setAuthToken] = useState<string>("");
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
  const handleBulkDelete = async () => {
    if (selectedAssetIds.size === 0 || !confirm(`Delete ${selectedAssetIds.size} photos? This cannot be undone.`)) return;
    const t = getStoredAccessToken();
    if (!t) return;
    try {
      await bulkAssetAction(t, "delete", Array.from(selectedAssetIds));
      clearSelection();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk delete failed");
    }
  };

  useEffect(() => {
    const token = getStoredAccessToken();

    if (!token) {
      setError("Your session expired. Please log in again.");
      setLoading(false);
      return;
    }
    setAuthToken(token);

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

  const buildShareUrl = useCallback((albumId?: string) => {
    if (!gallery?.slug) return "";
    const query = albumId ? `?album=${encodeURIComponent(albumId)}` : "";
    const path = `/g/${gallery.slug}${query}`;
    return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  }, [gallery?.slug]);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith("image/") || /\.(cr2|nef|arw|dng|raf|cr3|tiff?)$/i.test(f.name)
    );
    if (files.length > 0) upload.addFiles(files);
  }, [upload]);

  const handleFileSelect = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,.cr2,.nef,.arw,.dng,.raf,.cr3,.tif,.tiff";
    input.onchange = () => {
      if (input.files) upload.addFiles(Array.from(input.files));
    };
    input.click();
  }, [upload]);

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
            {/* Settings quick links */}
            <div className="mt-3 flex items-center gap-3">
              <Link
                href={`/galleries/${gallery.id}/cover`}
                className="text-xs text-accent-primary hover:underline"
              >
                Cover & Design
              </Link>
              <span className="text-text-tertiary">·</span>
              <Link
                href={`/galleries/${gallery.id}/analytics`}
                className="text-xs text-accent-primary hover:underline"
              >
                Analytics
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

          {/* Upload progress (shown when uploading) */}
          {upload.items.length > 0 && (
            <div className="surface-panel space-y-3 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">
                  Uploading {upload.items.filter(i => i.status === "uploading" || i.status === "pending" || i.status === "screening").length} files
                </h2>
                <div className="flex gap-2">
                  {upload.isPaused ? (
                    <button onClick={upload.resumeAll} className="text-xs text-accent hover:underline">Resume All</button>
                  ) : (
                    <button onClick={upload.pauseAll} className="text-xs text-text-secondary hover:underline">Pause All</button>
                  )}
                  <button onClick={upload.cancelAll} className="text-xs text-danger hover:underline">Cancel All</button>
                </div>
              </div>
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
                  return (
                    <div key={item.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="truncate flex-1 text-text-primary">{item.file.name}</span>
                        <div className="w-24 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${item.status === "error" ? "bg-danger" : "bg-accent"}`} style={{ width: `${item.progress}%` }} />
                        </div>
                        <span className="w-8 text-right text-text-tertiary">{item.progress}%</span>
                        <span className={`w-16 text-right ${item.status === "complete" ? "text-success" : item.status === "error" ? "text-danger" : "text-text-secondary"}`}>{item.status}</span>
                      </div>
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
                    <p className="text-sm text-text-secondary">
                      {assets.length === 0
                        ? "No assets yet"
                        : (faceFilterIds || proofingFilter)
                          ? `${visibleAssets.length} of ${assets.length} assets`
                          : `${assets.length} assets`}
                    </p>
                    {assets.length > 0 && (
                      <button onClick={() => setBulkMode(true)} className="text-xs text-text-tertiary hover:text-text-primary">Select</button>
                    )}
                  </>
                )}
                <button
                  onClick={handleFileSelect}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  Upload Photos
                </button>
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
                    <>
                      <button
                        type="button"
                        onClick={() => copyShareUrl()}
                        className="btn-tertiary px-3 py-1.5 text-xs"
                      >
                        Copy gallery link
                      </button>
                      <ShareQrPopover
                        url={gallery.is_published ? buildShareUrl() : ""}
                        disabled={!gallery.is_published}
                        label="Show QR code for gallery link"
                        filename={`${gallery.slug}-gallery-qr`}
                      />
                    </>
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

            {/* FaceFilter surfaces only when we have an auth token and at
                least one asset — before uploads there's nothing to
                cluster, and without a token the API calls would 401. */}
            {authToken && assets.length > 0 && (
              <FaceFilter token={authToken} galleryId={id} />
            )}

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
              <p className="font-medium">{isDragOver ? "Drop photos here" : "Drag photos here or click to browse"}</p>
              <p className="text-xs text-text-tertiary mt-1">
                JPEG, PNG, TIFF, RAW (CR2, NEF, ARW, DNG, RAF) — up to 2GB per file
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
                      className={cn("surface-panel cursor-pointer overflow-hidden transition-shadow hover:shadow-lg relative", bulkMode && entry.asset && selectedAssetIds.has(entry.asset.id) && "ring-2 ring-accent-primary")}
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
                      {isProcessing ? (
                        <div
                          className="relative flex aspect-[4/3] w-full animate-pulse items-center justify-center overflow-hidden bg-surface-sunken"
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
                      <div className="space-y-2 p-4">
                        <p className="truncate text-sm font-medium text-text-primary">
                          {entry.asset?.filename || "Unresolved asset"}
                        </p>
                        <div className="flex items-center justify-between text-xs text-text-secondary">
                          <span>Sort #{entry.sort_order}</span>
                          {entry.is_hero && <span className="status-badge status-badge--accent">Hero</span>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

      </div>

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
    </div>
  );
}
