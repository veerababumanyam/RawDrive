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
  getGalleryWorkspaceSummary,
  listAlbumAssets,
  listGalleryAlbums,
  listGalleryAssets,
  updateGallery,
  updateGalleryCover,
  type Gallery,
  type GalleryAlbum,
  type GalleryAsset,
  type GalleryWorkspaceSummary,
} from "@/lib/api/galleries";
import { listProofingSelections, createComment, exportProofingSelectionsCsv, type ProofingSelection } from "@/lib/api/proofing";
import {
  galleryStatusClasses,
  galleryTypeClasses,
  getAssetPreviewUrl,
  proofingStatusClasses,
} from "@/lib/dashboard-ui";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { PhotoLightbox } from "@/components/gallery/photo-lightbox";
import { FaceFilter } from "@/components/gallery/face-filter";
import { GalleryAIPanel } from "@/components/gallery/gallery-ai-panel";
import { GalleryWorkspaceNav } from "@/components/gallery/gallery-workspace-nav";
import { GalleryShareCenter } from "@/components/gallery/gallery-share-center";
import { GalleryPublishChecklist } from "@/components/gallery/gallery-publish-checklist";
import { DeliveryContinuityPanel } from "@/components/gallery/delivery-continuity-panel";
import { SalesContinuityPanel } from "@/components/gallery/sales-continuity-panel";

type GalleryAssetRecord = GalleryAsset & {
  asset: Asset | null;
};

export default function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [workspaceSummary, setWorkspaceSummary] = useState<GalleryWorkspaceSummary | null>(null);
  const [assets, setAssets] = useState<GalleryAssetRecord[]>([]);
  const [selections, setSelections] = useState<ProofingSelection[]>([]);
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
        const [galleryData, galleryAssets, gallerySelections, summary] = await Promise.all([
          getGallery(token, id),
          listGalleryAssets(token, id),
          listProofingSelections(token, id).catch((err) => { console.warn("Failed to load proofing selections:", err?.message); return []; }),
          getGalleryWorkspaceSummary(token, id).catch(() => null),
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
        setWorkspaceSummary(summary);
        setAssets(hydratedAssets);
        setSelections(gallerySelections ?? []);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load gallery.");
          setGallery(null);
          setWorkspaceSummary(null);
          setAssets([]);
          setSelections([]);
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

  // Link each newly-completed upload to this gallery then reload the asset list.
  useEffect(() => {
    const t = getStoredAccessToken();
    if (!t || !id) return;
    const toLink = upload.items.filter(
      (item) => item.status === "complete" && item.assetId && !linkedAssetIdsRef.current.has(item.assetId),
    );
    if (toLink.length === 0) return;

    (async () => {
      for (const item of toLink) {
        if (!item.assetId) continue;
        try {
          await addAssetToGallery(t, id, item.assetId, 0);
          linkedAssetIdsRef.current.add(item.assetId);
        } catch (err) {
          console.warn("Failed to link asset to gallery:", err);
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
    })();
  }, [upload.items, id]);

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
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-surface-sunken" />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="h-[420px] rounded-2xl bg-surface-sunken" />
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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <GalleryWorkspaceNav galleryId={gallery.id} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Link href="/galleries" className="btn-tertiary px-0 py-0 text-sm">
            Back to galleries
          </Link>
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
                Cover photo
              </Link>
              <span className="text-text-tertiary">·</span>
              <Link
                href={`/galleries/${gallery.id}/design`}
                className="text-xs text-accent-primary hover:underline"
              >
                Design & theme
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
            <span
              className={cn(
                galleryTypeClasses[gallery.gallery_type] || "status-badge status-badge--neutral",
              )}
            >
              {gallery.gallery_type}
            </span>
            <span
              className={cn(
                galleryStatusClasses[gallery.status] || "status-badge status-badge--neutral",
              )}
            >
              {gallery.status}
            </span>
            <span className={gallery.is_published ? "status-badge status-badge--success" : "status-badge status-badge--neutral"}>
              {gallery.is_published ? "Published" : "Unpublished"}
            </span>
          </div>
        </div>

        <div id="share" className="flex flex-wrap gap-3">
          <Link href={`/galleries/${gallery.id}/proofing`} className="btn-primary px-4 py-2.5 text-sm">
            Review proofing
          </Link>
          {/* GAL-FR-130: CSV export of selections — must fetch with auth
              header since the endpoint is JWT-protected. A bare <a href>
              would navigate without the Authorization header and get 401. */}
          <button
            className="btn-tertiary px-4 py-2.5 text-sm"
            onClick={async () => {
              const t = getStoredAccessToken();
              if (!t) return;
              try {
                const blob = await exportProofingSelectionsCsv(t, gallery.id);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${gallery.title || "selections"}-proofing.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to export CSV");
              }
            }}
          >
            Export selections (CSV)
          </button>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="surface-panel p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Assets</p>
              <p className="mt-3 text-2xl font-semibold text-text-primary">{assets.length}</p>
            </div>
            <div className="surface-panel p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Selections</p>
              <p className="mt-3 text-2xl font-semibold text-text-primary">{selections.length}</p>
            </div>
            <div className="surface-panel p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Selection limit</p>
              <p className="mt-3 text-2xl font-semibold text-text-primary">
                {gallery.max_selections > 0 ? gallery.max_selections : "Open"}
              </p>
            </div>
          </div>

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
                    <button
                      type="button"
                      onClick={() => copyShareUrl()}
                      className="btn-tertiary px-3 py-1.5 text-xs"
                    >
                      Copy gallery link
                    </button>
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

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setActiveAlbum(null)}
                  className={cn("shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", !activeAlbum ? "bg-accent-primary/10 text-accent-primary" : "text-text-tertiary hover:text-text-primary")}
                >
                  All Photos
                </button>
                {albums.map((album) => {
                  const assetCount = albumAssetIdsByAlbum[album.id]?.length ?? 0;
                  // QA #18: per-album drop target. When a user drags selected
                  // assets (or a native file list) onto an album chip, assign
                  // those assets to the album via addAlbumAssets. This lets
                  // photographers re-organize the gallery without leaving the
                  // page. Native file drops are intentionally ignored here —
                  // new uploads go through the page-level dropzone; the album
                  // chip is only a sub-gallery-membership target.
                  return (
                    <div
                      key={album.id}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-border-subtle px-1 py-1 transition-colors"
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
                        className={cn("px-2 py-1 text-xs font-medium transition-colors", activeAlbum === album.id ? "text-accent-primary" : "text-text-secondary hover:text-text-primary")}
                      >
                        {album.name} <span className="text-text-tertiary">{assetCount}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyShareUrl(album.id)}
                        className="rounded-md px-2 py-1 text-xs text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-accent-primary"
                      >
                        Share
                      </button>
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
                      {previewUrl ? (
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

        <aside className="space-y-4">
          <GalleryPublishChecklist gallery={gallery} assets={assets} />
          {authToken && <GalleryShareCenter gallery={gallery} token={authToken} />}

          <div className="surface-panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Linked CRM</p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">Client workspace</h2>
              </div>
              <span className="status-badge status-badge--accent">
                {workspaceSummary?.lifecycle_state || gallery.status || "draft"}
              </span>
            </div>

            {workspaceSummary?.primary_contact ? (
              <div className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                <p className="font-medium text-text-primary">{workspaceSummary.primary_contact.name}</p>
                {workspaceSummary.primary_contact.email && (
                  <p className="mt-1 text-sm text-text-secondary">{workspaceSummary.primary_contact.email}</p>
                )}
                {workspaceSummary.primary_contact.phone && (
                  <p className="text-sm text-text-secondary">{workspaceSummary.primary_contact.phone}</p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Link href={`/crm/contacts/${workspaceSummary.primary_contact.id}`} className="btn-tertiary px-3 py-2 text-center">
                    Client profile
                  </Link>
                  <Link href={`/billing?create=true&client=${workspaceSummary.primary_contact.id}`} className="btn-tertiary px-3 py-2 text-center">
                    Invoice
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                <p className="text-sm text-text-secondary">
                  No client is linked yet. Link one from the gallery list or settings so proofing, invoices, and delivery history roll up into CRM.
                </p>
                <Link href={`/galleries?create=true`} className="mt-3 inline-flex text-xs text-accent-primary hover:underline">
                  Create a client-linked gallery
                </Link>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
              <span>Project {gallery.project_id ? "linked" : "not linked"}</span>
              <span>Event {gallery.event_id ? "linked" : "not linked"}</span>
              <span>Deal {gallery.deal_id ? "linked" : "not linked"}</span>
              <span>Invoice {gallery.invoice_id ? "linked" : "not linked"}</span>
            </div>
          </div>

          {token && (
            <DeliveryContinuityPanel
              galleryId={gallery.id}
              token={token}
              selectedCount={(selectionCounts.selected || 0) + (selectionCounts.approved || 0)}
              totalCount={assets.length}
            />
          )}

          <SalesContinuityPanel
            invoiceId={gallery.invoice_id}
            dealId={gallery.deal_id}
            projectId={gallery.project_id}
            cartCount={0}
          />

          <div className="surface-panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Proofing status</h2>
              {proofingFilter && (
                <button
                  onClick={() => setProofingFilter(null)}
                  className="text-xs text-accent-primary hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setProofingFilter((f) => f === "selected" ? null : "selected")}
                className={cn(
                  "status-badge status-badge--accent cursor-pointer transition-all",
                  proofingFilter === "selected" ? "ring-2 ring-accent-primary" : "hover:ring-1 hover:ring-accent-primary/40",
                )}
                title="Click to filter assets by selection status"
              >
                Selected {selectionCounts.selected || 0}
              </button>
              <button
                onClick={() => setProofingFilter((f) => f === "approved" ? null : "approved")}
                className={cn(
                  "status-badge status-badge--success cursor-pointer transition-all",
                  proofingFilter === "approved" ? "ring-2 ring-accent-primary" : "hover:ring-1 hover:ring-accent-primary/40",
                )}
                title="Click to filter assets by approval status"
              >
                Approved {selectionCounts.approved || 0}
              </button>
              <button
                onClick={() => setProofingFilter((f) => f === "rejected" ? null : "rejected")}
                className={cn(
                  "status-badge status-badge--danger cursor-pointer transition-all",
                  proofingFilter === "rejected" ? "ring-2 ring-accent-primary" : "hover:ring-1 hover:ring-accent-primary/40",
                )}
                title="Click to filter assets by rejection status"
              >
                Rejected {selectionCounts.rejected || 0}
              </button>
            </div>
          </div>

          <div className="surface-panel space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Recent selections</h2>
              <span className="text-xs text-text-tertiary">{selections.length}</span>
            </div>

            {selections.length === 0 ? (
              <p className="text-sm text-text-secondary">No proofing selections have been submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {selections.slice(0, 6).map((selection) => (
                  <div key={selection.id} className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{selection.client_name}</p>
                        <p className="text-xs text-text-secondary">{selection.client_email}</p>
                      </div>
                      <span
                        className={cn(
                          proofingStatusClasses[selection.status] || "status-badge status-badge--neutral",
                        )}
                      >
                        {selection.status}
                      </span>
                    </div>
                    {selection.note && (
                      <p className="mt-3 text-sm leading-relaxed text-text-secondary">{selection.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* M19: Cover template selector */}
          <div className="surface-panel space-y-4 p-5">
            <h2 className="text-lg font-semibold text-text-primary">Cover page</h2>
            <p className="text-xs text-text-secondary">
              Choose a cover template for the public gallery landing page.
            </p>
            <select
              value={gallery.cover_template || "none"}
              onChange={async (e) => {
                const t = getStoredAccessToken();
                if (!t || !gallery) return;
                try {
                  await updateGalleryCover(t, gallery.id, { template: e.target.value });
                  setGallery({ ...gallery, cover_template: e.target.value });
                } catch (err) {
                  console.error("Failed to update cover template:", err);
                }
              }}
              className="input-base w-full"
            >
              <option value="none">None (no cover page)</option>
              <option value="full_bleed">Full Bleed</option>
              <option value="split_screen">Split Screen</option>
              <option value="minimal_white">Minimal White</option>
              <option value="classic_film">Classic Film Border</option>
              <option value="festive">Festive</option>
            </select>
            {gallery.cover_template && gallery.cover_template !== "none" && gallery.slug && (
              <a
                href={`/g/${gallery.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-primary hover:underline"
              >
                Preview cover page
              </a>
            )}
          </div>

          {/* M21: AI Panel — face scan & AI studio link */}
          {authToken && <GalleryAIPanel galleryId={id} token={authToken} />}

          {/* M19: Client selections summary (grouped by client) */}
          {selections.length > 0 && (() => {
            const grouped = selections.reduce<Record<string, { name: string; email: string; count: number; latest: string; notes: string[] }>>((acc, s) => {
              const key = s.client_email || "anonymous";
              if (!acc[key]) acc[key] = { name: s.client_name, email: s.client_email, count: 0, latest: s.created_at, notes: [] };
              acc[key].count++;
              if (s.created_at > acc[key].latest) acc[key].latest = s.created_at;
              if (s.note) acc[key].notes.push(s.note);
              return acc;
            }, {});
            return (
              <div className="surface-panel space-y-4 p-5">
                <h2 className="text-lg font-semibold text-text-primary">Client submissions</h2>
                <div className="space-y-3">
                  {Object.entries(grouped).map(([email, data]) => (
                    <div key={email} className="rounded-2xl border border-border-default bg-surface-container-low p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-text-primary">{data.name || "Anonymous"}</p>
                          <p className="text-xs text-text-secondary">{data.email}</p>
                        </div>
                        <span className="status-badge status-badge--accent">{data.count} photos</span>
                      </div>
                      <p className="mt-1 text-xs text-text-tertiary">
                        Submitted {new Date(data.latest).toLocaleDateString("en-IN")}
                      </p>
                      {data.notes.length > 0 && (
                        <p className="mt-2 text-xs text-text-secondary italic">
                          &ldquo;{data.notes[0]}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </aside>
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
