"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createGallery, deleteGallery, type Gallery } from "@/lib/api/galleries";
import { createContactAuth, listContacts, type Contact } from "@/lib/api/crm";
import { authFetch } from "@/lib/api/authFetch";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Grid, ListBullet, Trash, Share, XMark } from "@/components/icons";

export default function GalleriesPage() {
  const searchParams = useSearchParams();
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"proofing" | "delivery">("delivery");
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
  // ID of the gallery currently armed for delete. The single-string shape
  // means arming Delete on a different card auto-disarms the previous one,
  // so the inline confirm bar never appears on two cards simultaneously.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // ID of the gallery whose share link was just copied — cleared after 1.5s.
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredGalleries = useMemo(() => {
    return galleries.filter((g) => {
      if (filterType && g.gallery_type !== filterType) return false;
      // 2026-05-18: Filter values are now publish-state buckets rather
      // than raw lifecycle statuses, to match the single-badge display.
      //   - "published"   → is_published flag is true
      //   - "unpublished" → not published AND not archived
      //   - "archived"    → status === "archived"
      // The card badge sets filterStatus to one of these three values.
      if (filterStatus) {
        const isArchived = g.status === "archived";
        if (filterStatus === "published" && !g.is_published) return false;
        if (filterStatus === "unpublished" && (g.is_published || isArchived)) return false;
        if (filterStatus === "archived" && !isArchived) return false;
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

  // Arms the inline confirm bar for the given gallery card. The actual
  // delete happens in confirmDelete() — splitting these two keeps the
  // browser confirm() dialog out of the flow (UX rule 2026-05-18) and
  // gives the user a visible "Cancel" path right where the click landed.
  const armDelete = (e: React.MouseEvent, galleryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteId(galleryId);
  };

  const copyShareLink = (e: React.MouseEvent, gallery: Gallery) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/g/${gallery.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(gallery.id);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
  };

  const confirmDelete = async (galleryId: string) => {
    const token = getStoredAccessToken();
    if (!token) {
      setConfirmDeleteId(null);
      return;
    }
    try {
      await deleteGallery(token, galleryId);
      setConfirmDeleteId(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete gallery");
      setConfirmDeleteId(null);
    }
  };

  // Escape dismisses the armed delete confirmation. Mounted only while a
  // card is armed so the listener doesn't run on every keystroke at idle.
  useEffect(() => {
    if (!confirmDeleteId) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmDeleteId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmDeleteId]);

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
      {/* Header — stacks vertically on mobile, side-by-side on sm+.
          Before 2026-05-18 this was a single horizontal row that
          crammed title + search + "+ New Gallery" + grid/list toggles
          into a ~390px mobile viewport, which made the New Gallery
          button wrap to two lines ("+ New" / "Gallery") and the
          grid/list toggles spill off the right edge. New layout:
            - Mobile: title row, then a full-width action row where
              search flexes to fill remaining space after the button
              and toggles claim their natural width.
            - sm+: title block left, actions block right (legacy
              layout, unchanged).
          whitespace-nowrap on the "+ New Gallery" button is what
          actually fixes the wrapping symptom — without it any width
          shortfall splits the label. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">Galleries</h1>
          <p className="text-sm text-text-secondary mt-1">
            {filteredGalleries.length === galleries.length
              ? `${galleries.length} ${galleries.length === 1 ? "gallery" : "galleries"}`
              : `${filteredGalleries.length} of ${galleries.length} galleries`}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search galleries…"
            className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary min-h-[44px] flex-1 min-w-0 sm:flex-none sm:w-48 lg:w-64"
            aria-label="Search galleries"
          />
          <button
            onClick={() => setShowCreate(true)}
            className="shrink-0 whitespace-nowrap rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px] inline-flex items-center justify-center gap-1"
            aria-label="Create new gallery"
          >
            <span aria-hidden="true">+</span>
            <span className="sm:inline">New Gallery</span>
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
              <XMark className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          {filterStatus && (
            <button
              onClick={() => setFilterStatus(null)}
              className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-3 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/20"
            >
              {/* Display proper-cased label to match the per-card badge.
                  filterStatus values are publish-state buckets
                  (published / unpublished / archived) since 2026-05-18. */}
              {filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
              <XMark className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
          {searchQuery.trim() && (
            <button
              onClick={() => setSearchQuery("")}
              className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-3 py-1 text-xs font-medium text-accent-primary hover:bg-accent-primary/20"
            >
              &quot;{searchQuery.trim()}&quot;
              <XMark className="w-3 h-3" aria-hidden="true" />
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

                    {/* Corner Delete affordance — always visible. Replaces
                        the older full-cover scrim that hosted Open /
                        Design / Duplicate / Delete buttons (2026-05-18,
                        commit 86093a7).

                        2026-05-18 follow-up: button was previously
                        hover-reveal + translucent glass-danger styling
                        ("variant=danger" → bg-feedback-error/[0.15]),
                        which disappeared on touch and was hard to spot
                        against busy wedding cover photos. Now: always
                        visible, solid bg-feedback-error fill, white
                        icon, surface-raised ring for separation from
                        the photo, shadow-elevation-1 for lift. Reads
                        as "destructive" from across the screen.

                        When armed, the corner swaps to an inline
                        confirm bar instead of firing window.confirm. */}
                    <div
                      className="absolute top-2 right-2 z-10 flex items-center gap-1.5"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      {/* Share — copies the public gallery link. Solid circle
                          matches the delete button treatment so it reads as
                          a tappable affordance against any cover photo. */}
                      <button
                        type="button"
                        aria-label={copiedId === g.id ? "Link copied!" : "Copy share link"}
                        title={copiedId === g.id ? "Link copied!" : "Copy share link"}
                        onClick={(e) => copyShareLink(e, g)}
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow-elevation-1 ring-2 ring-surface-raised/60 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-0",
                          copiedId === g.id
                            ? "bg-feedback-success focus:ring-feedback-success/50"
                            : "bg-accent-primary hover:bg-accent-primary/90 focus:ring-accent-primary/50",
                        )}
                      >
                        <Share className="h-4 w-4" />
                      </button>
                      {confirmDeleteId === g.id ? (
                        <div
                          role="alertdialog"
                          aria-label="Confirm gallery deletion"
                          className="flex items-center gap-1.5 rounded-full bg-surface-overlay/95 backdrop-blur-md px-2 py-1 border border-border-default shadow-elevation-1"
                        >
                          <span className="px-1.5 text-[11px] font-medium text-text-primary">
                            Delete?
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            autoFocus
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void confirmDelete(g.id); }}
                            className="rounded-full bg-feedback-error px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-feedback-error/90 transition-colors"
                          >
                            Confirm
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Delete gallery"
                          title="Delete gallery"
                          onClick={(e) => armDelete(e, g.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-feedback-error text-white shadow-elevation-1 ring-2 ring-surface-raised/60 transition-all hover:bg-feedback-error/90 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-feedback-error/50"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      )}
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
                  {/* Gallery description, rendered between title and
                      status badge. Two-line clamp keeps the card height
                      bounded — long descriptions (paragraph-length
                      shoot notes) would otherwise push the publish-
                      state chip and date below the visible footprint.
                      Hidden when blank rather than rendering a "Click
                      to add a description…" placeholder here: the
                      detail page is the right surface for the
                      add-description affordance; the card is a
                      read-only summary. */}
                  {g.description && g.description.trim() && (
                    <p
                      className="mt-1 text-sm text-text-secondary line-clamp-2"
                      title={g.description}
                    >
                      {g.description}
                    </p>
                  )}
                  {/* 2026-05-18: Single derived publish-state badge per
                      card. Previously the card stacked three chips —
                      `gallery_type` (proofing/delivery), lifecycle
                      `status` (almost always "draft"), and conditionally
                      "Published" — which added noise without
                      decision-value: the gallery-type is metadata, and
                      "draft" was the implicit state for every
                      not-yet-published gallery. The single badge below
                      reads as Published (green) / Archived (neutral) /
                      Unpublished (neutral) and stays click-filterable so
                      the active-filter chip strip still works. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(() => {
                      const publishState: "published" | "archived" | "unpublished" = g.is_published
                        ? "published"
                        : g.status === "archived"
                          ? "archived"
                          : "unpublished";
                      const label =
                        publishState === "published" ? "Published"
                        : publishState === "archived" ? "Archived"
                        : "Unpublished";
                      const badgeClass =
                        publishState === "published"
                          ? "status-badge status-badge--success"
                          : "status-badge status-badge--neutral";
                      return (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFilterStatus((prev) => prev === publishState ? null : publishState);
                          }}
                          className={cn(
                            badgeClass,
                            "cursor-pointer hover:ring-1 hover:ring-accent-primary/40 transition-all",
                          )}
                          title={`Filter: ${label.toLowerCase()} galleries`}
                        >
                          {label}
                        </button>
                      );
                    })()}
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
                    <div
                      className="ml-2 flex items-center gap-1.5"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      {/* Share — copies the public gallery link */}
                      <button
                        type="button"
                        aria-label={copiedId === g.id ? "Link copied!" : "Copy share link"}
                        title={copiedId === g.id ? "Link copied!" : "Copy share link"}
                        onClick={(e) => copyShareLink(e, g)}
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow-elevation-1 ring-2 ring-surface-raised/60 transition-all hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-0",
                          copiedId === g.id
                            ? "bg-feedback-success focus:ring-feedback-success/50"
                            : "bg-accent-primary hover:bg-accent-primary/90 focus:ring-accent-primary/50",
                        )}
                      >
                        <Share className="h-4 w-4" />
                      </button>
                      {confirmDeleteId === g.id ? (
                        <div
                          role="alertdialog"
                          aria-label="Confirm gallery deletion"
                          className="flex items-center gap-1.5 rounded-full bg-surface-overlay/95 backdrop-blur-md px-2 py-1 border border-border-default shadow-elevation-1"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        >
                          <span className="px-1.5 text-[11px] font-medium text-text-primary">Delete?</span>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-sunken hover:text-text-primary transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            autoFocus
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void confirmDelete(g.id); }}
                            className="rounded-full bg-feedback-error px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-feedback-error/90 transition-colors"
                          >
                            Confirm
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Delete gallery"
                          title="Delete gallery"
                          onClick={(e) => armDelete(e, g.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-feedback-error text-white shadow-elevation-1 transition-all hover:bg-feedback-error/90 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-feedback-error/50"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      )}
                    </div>
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
