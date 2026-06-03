"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createGallery, deleteGallery, galleryPublicUrl, updateGallery, type Gallery } from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import { createContactAuth, listContacts, type Contact } from "@/lib/api/crm";
import { getWorkspaceProfile, type WorkspaceProfile } from "@/lib/api/workspace-profile";
import { authFetch } from "@/lib/api/authFetch";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { GRID_VARIANTS, type EncryptedAssetLike } from "@/lib/media-encryption/asset-media";
import { appendStoredGalleryKeyFragment } from "@/lib/media-encryption/share-url";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { readGalleryCoverAssetId } from "@/lib/gallery-design-config";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Camera, ClipboardList, Envelope, Grid, ListBullet, Phone, Trash, Share, XMark } from "@/components/icons";

function GalleryCoverPreview({
  gallery,
  coverAsset,
  token,
  alt,
}: {
  gallery: Gallery;
  coverAsset?: Asset;
  token: string | null;
  alt: string;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  const coverAssetId = readGalleryCoverAssetId(gallery.settings, gallery.cover_asset_id);
  const fallbackAsset = useMemo<EncryptedAssetLike | null>(() => {
    if (coverAsset) return coverAsset;
    if (!gallery.cover_thumbnails || Object.keys(gallery.cover_thumbnails).length === 0) return null;
    return {
      id: coverAssetId,
      filename: gallery.title,
      thumbnail_urls: gallery.cover_thumbnails,
    };
  }, [coverAsset, coverAssetId, gallery.cover_thumbnails, gallery.title]);
  const media = useDecryptedAssetUrl(fallbackAsset, GRID_VARIANTS, token);

  if (media.loading) {
    return <div className="h-full w-full animate-pulse bg-surface-container-high" aria-hidden="true" />;
  }

  if (media.src && media.src !== failedSrc) {
    return (
      <img
        src={media.src}
        alt={alt}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(media.src)}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <svg className="w-10 h-10 text-text-tertiary/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
      </svg>
    </div>
  );
}

function GalleryPublishSwitch({
  gallery,
  busy,
  onToggle,
}: {
  gallery: Gallery;
  busy: boolean;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>, gallery: Gallery) => void;
}) {
  const archived = gallery.status === "archived";
  const label = archived ? "Archived" : gallery.is_published ? "Published" : "Unpublished";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={gallery.is_published}
      aria-label={
        archived
          ? `${gallery.title} is archived`
          : gallery.is_published
            ? `${gallery.title} is published. Switch to unpublished.`
            : `${gallery.title} is unpublished. Switch to published.`
      }
      disabled={busy || archived}
      onClick={(event) => onToggle(event, gallery)}
      className="publish-state-toggle"
      data-state={gallery.is_published ? "published" : "unpublished"}
      title={
        archived
          ? "Archived galleries cannot be published from this card"
          : gallery.is_published
            ? "Unpublish - client links will stop working"
            : "Publish - clients will be able to view this gallery"
      }
    >
      <span className="publish-state-toggle__track" aria-hidden="true">
        <span className="publish-state-toggle__thumb" />
      </span>
      <span className="publish-state-toggle__label">
        {busy ? "Saving..." : label}
      </span>
    </button>
  );
}

function buildGalleryCardShareUrl(gallery: Gallery, workspaceProfile: WorkspaceProfile | null): string {
  if (!gallery.slug) return "";
  const base = galleryPublicUrl(gallery, workspaceProfile);
  return appendStoredGalleryKeyFragment(base, gallery.id);
}

function buildGalleryShareText(gallery: Gallery, url: string): string {
  const title = gallery.title?.trim() || "Gallery";
  return `Your ${title} gallery is ready: ${url}`;
}

function buildGalleryEmailHref(gallery: Gallery, url: string): string {
  const title = gallery.title?.trim() || "Gallery";
  const subject = `${title} gallery`;
  const body = buildGalleryShareText(gallery, url);
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildGalleryWhatsAppHref(gallery: Gallery, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildGalleryShareText(gallery, url))}`;
}

function GalleryShareMenu({
  gallery,
  shareUrl,
  open,
  copied,
  onToggle,
  onCopy,
}: {
  gallery: Gallery;
  shareUrl: string;
  open: boolean;
  copied: boolean;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCopy: () => void;
}) {
  const canShare = gallery.is_published && Boolean(shareUrl);
  const emailHref = canShare ? buildGalleryEmailHref(gallery, shareUrl) : "";
  const whatsAppHref = canShare ? buildGalleryWhatsAppHref(gallery, shareUrl) : "";

  const runMenuAction = (
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canShare) return;
    action();
  };

  return (
    <div
      className="relative"
      data-gallery-share-menu
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <GlassIconButton
        type="button"
        size="md"
        variant={copied ? "success" : "solid"}
        active={open}
        label={copied ? `${gallery.title} link copied` : `Share ${gallery.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "shadow-elevation-1 ring-2 ring-surface-raised/60",
          copied
            ? "bg-feedback-success text-white hover:bg-feedback-success/90"
            : "bg-accent-primary text-white hover:bg-accent-primary/90",
        )}
      >
        <Share />
      </GlassIconButton>

      {open && (
        <div
          role="menu"
          aria-label={`Share ${gallery.title}`}
          className="fixed left-4 right-4 top-20 z-popover mx-auto max-w-sm rounded-2xl border border-border-default bg-surface-overlay p-2 shadow-xl backdrop-blur-md sm:left-auto sm:right-6 sm:mx-0"
        >
          {canShare ? (
            <div className="space-y-1">
              <button
                type="button"
                role="menuitem"
                onClick={(event) => runMenuAction(event, onCopy)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <ClipboardList className="h-5 w-5 shrink-0 text-text-secondary" />
                <span>Copy link</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => runMenuAction(event, () => {
                  window.location.href = emailHref;
                })}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <Envelope className="h-5 w-5 shrink-0 text-text-secondary" />
                <span>Email</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => runMenuAction(event, () => {
                  window.open(whatsAppHref, "_blank", "noopener,noreferrer");
                })}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <Phone className="h-5 w-5 shrink-0 text-text-secondary" />
                <span>WhatsApp</span>
              </button>
            </div>
          ) : (
            <p className="rounded-xl bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
              Publish this gallery before sharing client links.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function GalleriesPage() {
  const searchParams = useSearchParams();
  const createRequested = searchParams?.get("create") === "true";
  const clientParam = searchParams?.get("client") ?? "";
  const projectParam = searchParams?.get("project") ?? "";
  const [token] = useState(() => getStoredAccessToken());
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
  const [shareMenuGalleryId, setShareMenuGalleryId] = useState<string | null>(null);
  const [coverAssets, setCoverAssets] = useState<Record<string, Asset>>({});
  // Gallery ID currently being published/unpublished — prevents double-clicks.
  // Backs the GalleryPublishSwitch `busy` state via toggleGalleryPublish.
  const [publishingGalleryId, setPublishingGalleryId] = useState<string | null>(null);
  const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfile | null>(null);
  // M23: tethering toggle state — persists while the create panel is open.
  const [tetheringMode, setTetheringMode] = useState(false);
  const [tetherDir, setTetherDir] = useState("");

  const openCreateForm = useCallback(() => {
    setError(null);
    setTitleError("");
    setShowCreate(true);
  }, []);

  const resetCreateForm = useCallback(() => {
    setError(null);
    setShowCreate(false);
    setNewTitle("");
    setTitleError("");
    setLinkedContactId("");
    setLinkedProjectId("");
    setNewClientName("");
    setNewClientEmail("");
    setTetheringMode(false);
    setTetherDir("");
  }, []);

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

  const missingCoverAssetIds = useMemo(() => {
    return Array.from(
      new Set(
        galleries
          .map((g) => readGalleryCoverAssetId(g.settings, g.cover_asset_id))
          .filter((id): id is string => Boolean(id && !coverAssets[id])),
      ),
    );
  }, [coverAssets, galleries]);

  // Arms the inline confirm bar for the given gallery card. The actual
  // delete happens in confirmDelete() — splitting these two keeps the
  // browser confirm() dialog out of the flow (UX rule 2026-05-18) and
  // gives the user a visible "Cancel" path right where the click landed.
  const armDelete = (e: React.MouseEvent, galleryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteId(galleryId);
  };

  const copyShareLink = (gallery: Gallery) => {
    if (!gallery.is_published) return;
    const url = buildGalleryCardShareUrl(gallery, workspaceProfile);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(gallery.id);
      setShareMenuGalleryId(null);
      setTimeout(() => setCopiedId(null), 1500);
    }).catch(() => {});
  };

  const confirmDelete = async (galleryId: string) => {
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

  const toggleGalleryPublish = async (event: React.MouseEvent<HTMLButtonElement>, gallery: Gallery) => {
    event.preventDefault();
    event.stopPropagation();
    if (!token || publishingGalleryId === gallery.id || gallery.status === "archived") return;

    setPublishingGalleryId(gallery.id);
    setError(null);
    try {
      const updated = await updateGallery(token, gallery.id, { is_published: !gallery.is_published });
      setGalleries((prev) =>
        prev.map((item) =>
          item.id === gallery.id
            ? {
                ...item,
                ...updated,
                cover_thumbnails: updated.cover_thumbnails || item.cover_thumbnails,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update publish state");
    } finally {
      setPublishingGalleryId(null);
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

  useEffect(() => {
    if (!shareMenuGalleryId) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-gallery-share-menu]")) return;
      setShareMenuGalleryId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShareMenuGalleryId(null);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [shareMenuGalleryId]);

  const refresh = useCallback(() => {
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
  }, []);

  const refreshContacts = useCallback(() => {
    if (!token) return;
    listContacts(token)
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [token]);

  useEffect(() => {
    refresh();
    refreshContacts();
  }, [refresh, refreshContacts]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getWorkspaceProfile(token)
      .then((profile) => {
        if (!cancelled) setWorkspaceProfile(profile);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || missingCoverAssetIds.length === 0) return;
    let cancelled = false;

    void Promise.all(
      missingCoverAssetIds.map(async (assetId) => {
        try {
          return await getAsset(token, assetId);
        } catch {
          return null;
        }
      }),
    ).then((assets) => {
      if (cancelled) return;
      setCoverAssets((prev) => {
        const next = { ...prev };
        for (const asset of assets) {
          if (asset) next[asset.id] = asset;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [missingCoverAssetIds, token]);

  useEffect(() => {
    if (!createRequested) return;
    setError(null);
    setTitleError("");
    setLinkedContactId(clientParam);
    setLinkedProjectId(projectParam);
    setShowCreate(true);
  }, [clientParam, createRequested, projectParam]);

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
        tethering_enabled: tetheringMode,
        tether_directory: tetheringMode && tetherDir.trim() ? tetherDir.trim() : null,
      });
      setShowCreate(false);
      setNewTitle("");
      setNewType("proofing");
      setLinkedContactId("");
      setLinkedProjectId("");
      setTetheringMode(false);
      setTetherDir("");
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
          <GlassIconButton
            onClick={() => {
              setTetheringMode((v) => !v);
              if (!showCreate) openCreateForm();
            }}
            variant={tetheringMode ? "accent" : "glass"}
            active={tetheringMode}
            label={tetheringMode ? "Tethering enabled — click to disable" : "Enable tethering"}
            size="md"
          >
            <Camera />
          </GlassIconButton>
          <button
            onClick={openCreateForm}
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
                onChange={(e) => { setNewTitle(e.target.value); if (titleError) setTitleError(""); if (error) setError(null); }}
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
            {/* M23: tethering directory — visible when the tethering toggle is on */}
            {tetheringMode && (
              <div className="rounded-xl border border-accent-primary/30 bg-accent-primary/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-accent-primary shrink-0" />
                  <span className="text-xs font-medium text-accent-primary uppercase tracking-wider">
                    Tethering enabled
                  </span>
                </div>
                <label className="text-xs text-text-tertiary">Watch directory</label>
                <input
                  type="text"
                  value={tetherDir}
                  onChange={(e) => setTetherDir(e.target.value)}
                  placeholder="/Users/you/Camera Imports"
                  className="w-full rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  aria-label="Local directory for tethered camera output"
                />
                <p className="text-xs text-text-tertiary">
                  The RawDrive desktop app watches this folder and auto-uploads every new shot into this gallery.
                </p>
              </div>
            )}
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
              onClick={resetCreateForm}
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
            const coverAssetId = readGalleryCoverAssetId(g.settings, g.cover_asset_id);
            const coverAsset = coverAssetId ? coverAssets[coverAssetId] : undefined;
            const shareUrl = buildGalleryCardShareUrl(g, workspaceProfile);

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
                    <GalleryCoverPreview
                      gallery={g}
                      coverAsset={coverAsset}
                      token={token}
                      alt={`${g.title} cover`}
                    />

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
                      <GalleryShareMenu
                        gallery={g}
                        shareUrl={shareUrl}
                        open={shareMenuGalleryId === g.id}
                        copied={copiedId === g.id}
                        onToggle={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setConfirmDeleteId(null);
                          setShareMenuGalleryId((current) => (current === g.id ? null : g.id));
                        }}
                        onCopy={() => copyShareLink(g)}
                      />
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
                    <GalleryCoverPreview
                      gallery={g}
                      coverAsset={coverAsset}
                      token={token}
                      alt=""
                    />
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
                  {/* Publish state is a real action, not just a filter chip:
                      users can publish/unpublish from the gallery list
                      without opening the detail page. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <GalleryPublishSwitch
                      gallery={g}
                      busy={publishingGalleryId === g.id}
                      onToggle={toggleGalleryPublish}
                    />
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
                      <GalleryShareMenu
                        gallery={g}
                        shareUrl={shareUrl}
                        open={shareMenuGalleryId === g.id}
                        copied={copiedId === g.id}
                        onToggle={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setConfirmDeleteId(null);
                          setShareMenuGalleryId((current) => (current === g.id ? null : g.id));
                        }}
                        onCopy={() => copyShareLink(g)}
                      />
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
