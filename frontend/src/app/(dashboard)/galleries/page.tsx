"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { listGalleries, createGallery, deleteGallery, duplicateGalleryAuth, type Gallery } from "@/lib/api/galleries";
import { createContactAuth, listContacts, type Contact } from "@/lib/api/crm";
import { authFetch } from "@/lib/api/authFetch";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { galleryStatusClasses, galleryTypeClasses, getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Grid, ListBullet, Trash } from "@/components/icons";

export default function GalleriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"proofing" | "delivery">("proofing");
  const [linkedContactId, setLinkedContactId] = useState("");
  const [linkedProjectId, setLinkedProjectId] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [creating, setCreating] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGalleries = useMemo(() => {
    return galleries.filter((g) => {
      if (filterType && g.gallery_type !== filterType) return false;
      if (filterStatus) {
        if (filterStatus === "published" && !g.is_published) return false;
        if (filterStatus !== "published" && g.status !== filterStatus) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesTitle = g.title?.toLowerCase().includes(q);
        const matchesDesc = g.description?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  }, [galleries, filterType, filterStatus, searchQuery]);

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
    authFetch("/api/v1/galleries")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to list galleries: ${res.status}`);
        const body = await res.json();
        // The backend returns one of: a bare array, `{galleries: [...]}`,
        // or `null` when there are zero rows. The previous fallback
        // (`body.galleries || []`) crashed with
        // "Cannot read properties of null (reading 'galleries')" because
        // `Array.isArray(null) === false` falls through to `null.galleries`.
        // Mirror the safe coercion from `lib/api/galleries.ts` so the page
        // tolerates an empty workspace.
        if (Array.isArray(body)) return body;
        if (body && Array.isArray(body.galleries)) return body.galleries;
        return [];
      })
      .then(setGalleries)
      .catch((err) => { setError(err?.message || "Failed to load galleries"); setGalleries([]); })
      .finally(() => setLoading(false));
  };

  const refreshContacts = () => {
    const token = getStoredAccessToken();
    if (!token) return;
    listContacts(token)
      .then(setContacts)
      .catch(() => setContacts([]));
  };

  useEffect(() => {
    refresh();
    refreshContacts();
  }, []);

  useEffect(() => {
    if (searchParams.get("create") !== "true") return;
    setLinkedContactId(searchParams.get("client") || "");
    setLinkedProjectId(searchParams.get("project") || "");
    setShowCreate(true);
  }, [searchParams]);

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      setTitleError("Title is required");
      return;
    }
    const isDuplicate = galleries.some(
      (g) => g.title?.toLowerCase() === newTitle.trim().toLowerCase(),
    );
    if (isDuplicate) {
      setTitleError("A gallery with this name already exists");
      return;
    }
    setTitleError("");
    setCreating(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      await createGallery(token, {
        title: newTitle.trim(),
        gallery_type: newType,
        primary_contact_id: linkedContactId || undefined,
        project_id: linkedProjectId || undefined,
      });
      setShowCreate(false);
      setNewTitle("");
      setNewType("proofing");
      setLinkedContactId("");
      setLinkedProjectId("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create gallery");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateClient = async () => {
    const name = newClientName.trim();
    if (!name) return;
    setCreatingClient(true);
    setError(null);
    try {
      // QA #19: previously createContact used a raw fetch with a stale
      // token, which silently 401'd and surfaced as "Add Client does
      // nothing". createContactAuth wraps authFetch so the token is
      // refreshed on 401 and the contact lands.
      const contact = await createContactAuth({
        name,
        email: newClientEmail.trim() || undefined,
        contact_type: "client",
      });
      setContacts((prev) => [contact, ...prev]);
      setLinkedContactId(contact.id);
      setNewClientName("");
      setNewClientEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setCreatingClient(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8">
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
    <div className="space-y-6 py-8">
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
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search galleries…"
            className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary min-h-[44px] w-48 lg:w-64"
            aria-label="Search galleries"
          />
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
          >
            + New Gallery
          </button>
          <GlassIconButton
            onClick={() => setViewMode("grid")}
            variant="accent"
            active={viewMode === "grid"}
            label="Grid view"
          >
            <Grid />
          </GlassIconButton>
          <GlassIconButton
            onClick={() => setViewMode("list")}
            variant="accent"
            active={viewMode === "list"}
            label="List view"
          >
            <ListBullet />
          </GlassIconButton>
        </div>
      </div>

      {/* Active filter chips */}
      {(filterType || filterStatus || searchQuery.trim()) && (
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
          {searchQuery.trim() && (
            <button
              onClick={() => setSearchQuery("")}
              className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-3 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/20"
            >
              &quot;{searchQuery.trim()}&quot;
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            onClick={() => { setFilterType(null); setFilterStatus(null); setSearchQuery(""); }}
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
            <div className="rounded-xl border border-border-default bg-surface-sunken/40 p-4">
              <label className="text-xs text-text-tertiary uppercase tracking-wider">Linked client</label>
              <select
                value={linkedContactId}
                onChange={(e) => setLinkedContactId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
              >
                <option value="">No client linked yet</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}{contact.email ? ` - ${contact.email}` : ""}
                  </option>
                ))}
              </select>
              {linkedProjectId && (
                <p className="mt-2 text-xs text-text-secondary">
                  This gallery will also stay attached to project {linkedProjectId.slice(0, 8)}.
                </p>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="New client name"
                  className="rounded-xl border border-border-default bg-surface-sunken px-3 py-2 text-sm text-text-primary"
                />
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="Email optional"
                  className="rounded-xl border border-border-default bg-surface-sunken px-3 py-2 text-sm text-text-primary"
                />
                <button
                  type="button"
                  onClick={handleCreateClient}
                  disabled={creatingClient || !newClientName.trim()}
                  className="btn-tertiary px-3 py-2 text-sm disabled:opacity-50"
                >
                  {creatingClient ? "Adding..." : "Add client"}
                </button>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowCreate(false);
                setNewTitle("");
                setTitleError("");
                setLinkedContactId("");
                setLinkedProjectId("");
                setNewClientName("");
                setNewClientEmail("");
              }}
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
            const coverUrl = getAssetPreviewUrl(
              { thumbnail_urls: g.cover_thumbnails || {} },
              getStoredAccessToken(),
            );

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

                    {/* Hover overlay with quick actions. Hidden on touch
                        devices (mobile/tablet without hover) because the
                        sticky-hover behavior on touch causes the first tap
                        to reveal the overlay and the second tap to land
                        on the Design button instead of opening the
                        gallery. Mobile users tap the card itself, which
                        is wrapped in <Link> -> /galleries/{id}. The
                        overlay shows only on devices with true hover
                        (desktop with mouse / trackpad). */}
                    <div className="absolute inset-0 hidden items-center justify-center gap-3 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:hover)]:flex">
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
                        onClick={async (e) => {
                          e.preventDefault(); e.stopPropagation();
                          try {
                            await duplicateGalleryAuth(g.id, `${g.title} (Copy)`);
                            refresh();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed to duplicate gallery");
                          }
                        }}
                        className="rounded-full bg-white/20 backdrop-blur-sm border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 min-h-[36px]"
                      >
                        Duplicate
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
                    {/* Clickable status tag — skip if published (the Published badge below covers it) */}
                    {!(g.is_published && g.status === "published") && (
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
                    )}
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
                    <GlassIconButton
                      onClick={(e) => handleDelete(e, g.id)}
                      className="ml-2"
                      size="sm"
                      variant="danger"
                      label="Delete gallery"
                    >
                      <Trash />
                    </GlassIconButton>
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
