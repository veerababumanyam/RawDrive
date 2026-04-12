"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listGalleries, createGallery, deleteGallery, type Gallery } from "@/lib/api/galleries";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { galleryStatusClasses, galleryTypeClasses } from "@/lib/dashboard-ui";

export default function GalleriesPage() {
  const router = useRouter();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"proofing" | "delivery">("proofing");
  const [creating, setCreating] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const filteredGalleries = useMemo(() => {
    return galleries.filter((g) => {
      if (filterType && g.gallery_type !== filterType) return false;
      if (filterStatus) {
        if (filterStatus === "published" && !g.is_published) return false;
        if (filterStatus !== "published" && g.status !== filterStatus) return false;
      }
      return true;
    });
  }, [galleries, filterType, filterStatus]);

  const handleDelete = async (e: React.MouseEvent, galleryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this gallery? This action cannot be undone.")) return;
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      await deleteGallery(token, galleryId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete gallery");
    }
  };

  const refresh = () => {
    const token = getStoredAccessToken();
    listGalleries(token)
      .then(setGalleries)
      .catch((err) => { setError(err?.message || "Failed to load galleries"); setGalleries([]); })
      .finally(() => setLoading(false));
  };

  useEffect(refresh, []);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError("");
    setCreating(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      await createGallery(token, { title: newTitle.trim(), gallery_type: newType });
      setShowCreate(false);
      setNewTitle("");
      setNewType("proofing");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create gallery");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Galleries</h1>
          <p className="text-sm text-text-secondary mt-1">
            {filteredGalleries.length === galleries.length
              ? `${galleries.length} ${galleries.length === 1 ? "gallery" : "galleries"}`
              : `${filteredGalleries.length} of ${galleries.length} galleries`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
          >
            + New Gallery
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "segmented-control-button h-11 w-11 p-0",
              viewMode === "grid"
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
            )}
            aria-label="Grid view"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "segmented-control-button h-11 w-11 p-0",
              viewMode === "list"
                ? "segmented-control-button--active"
                : "segmented-control-button--inactive",
            )}
            aria-label="List view"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Active filter chips */}
      {(filterType || filterStatus) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-tertiary">Filtered by:</span>
          {filterType && (
            <button
              onClick={() => setFilterType(null)}
              className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-3 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/20"
            >
              {filterType}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          {filterStatus && (
            <button
              onClick={() => setFilterStatus(null)}
              className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-3 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/20"
            >
              {filterStatus}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={() => { setFilterType(null); setFilterStatus(null); }}
            className="text-xs text-text-tertiary hover:text-text-primary underline"
          >
            Clear all
          </button>
        </div>
      )}

      {showCreate && (
        <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">New Gallery</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-tertiary uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => { setNewTitle(e.target.value); if (titleError) setTitleError(""); }}
                className={cn(
                  "mt-1 w-full rounded-xl border bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none",
                  titleError ? "border-error focus:border-error" : "border-border-default focus:border-accent-primary",
                )}
                placeholder="e.g. Sharma Wedding 2026"
                autoFocus
                aria-invalid={!!titleError}
                aria-describedby={titleError ? "title-error" : undefined}
              />
              {titleError && (
                <p id="title-error" className="mt-1 text-xs text-error">{titleError}</p>
              )}
            </div>
            <div>
              <label className="text-xs text-text-tertiary uppercase tracking-wider">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as "proofing" | "delivery")}
                className="mt-1 w-full rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              >
                <option value="proofing">Proofing — client selects favorites</option>
                <option value="delivery">Delivery — final hand-off</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowCreate(false); setNewTitle(""); setTitleError(""); }}
              className="rounded-xl border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {creating ? "Creating…" : "Create Gallery"}
            </button>
          </div>
        </div>
      )}

      {galleries.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-surface-sunken flex items-center justify-center">
            <svg className="w-8 h-8 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
          <p className="text-text-secondary">No galleries yet. Create your first gallery to get started.</p>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
            >
              + Create your first gallery
            </button>
          )}
        </div>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          }
        >
          {filteredGalleries.map((g) => {
            const coverUrl =
              g.cover_thumbnails?.thumb_md_webp ||
              g.cover_thumbnails?.thumb_md ||
              g.cover_thumbnails?.thumb_sm_webp ||
              g.cover_thumbnails?.thumb_sm ||
              g.cover_thumbnails?.thumb_lg ||
              (g.cover_thumbnails ? Object.values(g.cover_thumbnails)[0] : undefined);

            return (
              <Link
                key={g.id}
                href={`/galleries/${g.id}`}
                className={cn(
                  "group relative block rounded-xl border border-border-default bg-surface-raised",
                  "hover:border-accent/30 hover:shadow-elevation-1 transition-all duration-200",
                  viewMode === "list" && "flex items-center gap-4",
                )}
              >
                {/* Cover thumbnail (grid view) */}
                {viewMode === "grid" && (
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-xl bg-surface-sunken">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={`${g.title} cover`}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg className="w-10 h-10 text-text-tertiary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                    )}

                    {/* Hover overlay with quick actions */}
                    <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/galleries/${g.id}`); }}
                        className="rounded-full bg-white/20 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 min-h-[36px]"
                      >
                        Open
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/galleries/${g.id}/design`); }}
                        className="rounded-full bg-white/20 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 min-h-[36px]"
                      >
                        Design
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, g.id)}
                        className="rounded-full bg-red-500/30 backdrop-blur-sm border border-red-400/30 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500/50 min-h-[36px]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {/* List view thumbnail */}
                {viewMode === "list" && (
                  <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-sunken ml-4">
                    {coverUrl ? (
                      <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <svg className="w-5 h-5 text-text-tertiary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                        </svg>
                      </div>
                    )}
                  </div>
                )}

                <div className={viewMode === "grid" ? "p-4 space-y-3" : "flex-1 min-w-0 py-4"}>
                  <h3 className="font-medium text-text-primary truncate">{g.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* Clickable type tag — filters the list */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFilterType((prev) => prev === g.gallery_type ? null : g.gallery_type);
                      }}
                      className={cn(
                        galleryTypeClasses[g.gallery_type] || "status-badge status-badge--neutral",
                        "cursor-pointer hover:ring-1 hover:ring-accent-primary/40 transition-all",
                      )}
                      title={`Filter by type: ${g.gallery_type}`}
                    >
                      {g.gallery_type}
                    </button>
                    {/* Clickable status tag */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setFilterStatus((prev) => prev === g.status ? null : g.status);
                      }}
                      className={cn(
                        galleryStatusClasses[g.status] || "status-badge status-badge--neutral",
                        "cursor-pointer hover:ring-1 hover:ring-accent-primary/40 transition-all",
                      )}
                      title={`Filter by status: ${g.status}`}
                    >
                      {g.status}
                    </button>
                    {g.is_published && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFilterStatus((prev) => prev === "published" ? null : "published");
                        }}
                        className="status-badge status-badge--success cursor-pointer hover:ring-1 hover:ring-accent-primary/40 transition-all"
                        title="Filter: published galleries"
                      >
                        Published
                      </button>
                    )}
                  </div>
                </div>

                {/* Date + list view actions */}
                <div className={cn(
                  "flex items-center gap-2",
                  viewMode === "grid" ? "px-4 pb-4" : "pr-4",
                )}>
                  <span className="text-xs text-text-tertiary">
                    {new Date(g.created_at).toLocaleDateString("en-IN")}
                  </span>
                  {viewMode === "list" && (
                    <button
                      onClick={(e) => handleDelete(e, g.id)}
                      className="ml-2 rounded-lg p-1.5 text-text-tertiary hover:text-error hover:bg-error/10 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Delete gallery"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
