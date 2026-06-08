"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useInfiniteRender } from "@/hooks/use-infinite-render";
import { useScrollRevealGroup } from "@/hooks/use-scroll-reveal";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createGallery,
  createGalleryShareLink,
  deleteGallery,
  galleryPublicUrl,
  updateGallery,
  type Gallery,
} from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import { createContactAuth, listContacts, type Contact } from "@/lib/api/crm";
import {
  getWorkspaceProfile,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { authFetch } from "@/lib/api/authFetch";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  GRID_VARIANTS,
  mediaKeyIdsForAsset,
  type EncryptedAssetLike,
} from "@/lib/media-encryption/asset-media";
import {
  appendStoredGalleryKeyFragment,
  setUrlSearchParamBeforeFragment,
} from "@/lib/media-encryption/share-url";
import { useDecryptedAssetUrl } from "@/lib/media-encryption/use-decrypted-asset-url";
import { readGalleryCoverAssetId } from "@/lib/gallery-design-config";
import { galleryShareExpiryDays } from "@/lib/gallery-share-expiry";
import { LockedMediaFallback } from "@/components/gallery/media-key-recovery";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { GlassButton } from "@/components/ui/glass-button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  ClipboardList,
  Envelope,
  Grid,
  ListBullet,
  Phone,
  Photo,
  Plus,
  Trash,
  Share,
  XMark,
} from "@/components/icons";

function GalleryCoverPreview({
  gallery,
  coverAsset,
  token,
  alt,
}: {
  gallery: Gallery;
  coverAsset?: EncryptedAssetLike;
  token: string | null;
  alt: string;
}) {
  const [failedSrc, setFailedSrc] = useState("");
  const coverAssetId =
    gallery.cover_asset?.id ??
    readGalleryCoverAssetId(gallery.settings, gallery.cover_asset_id);
  const fallbackAsset = useMemo<EncryptedAssetLike | null>(() => {
    if (coverAsset) return coverAsset;
    if (gallery.cover_asset) return gallery.cover_asset;
    if (
      !gallery.cover_thumbnails ||
      Object.keys(gallery.cover_thumbnails).length === 0
    )
      return null;
    return {
      id: coverAssetId,
      filename: gallery.title,
      thumbnail_urls: gallery.cover_thumbnails,
    };
  }, [
    coverAsset,
    coverAssetId,
    gallery.cover_asset,
    gallery.cover_thumbnails,
    gallery.title,
  ]);
  const media = useDecryptedAssetUrl(
    fallbackAsset,
    GRID_VARIANTS,
    token || getStoredAccessToken(),
  );
  if (media.loading) {
    return (
      <div
        className="h-full w-full animate-pulse bg-surface-container-high"
        aria-hidden="true"
      />
    );
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

  if (media.error) {
    return (
      <LockedMediaFallback
        asset={fallbackAsset}
        galleryId={gallery.id}
        error={media.error}
        message={media.error}
        className="bg-surface-container-low"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <Photo className="empty-state-icon" aria-hidden="true" />
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
  onToggle: (
    event: React.MouseEvent<HTMLButtonElement>,
    gallery: Gallery,
  ) => void;
}) {
  const archived = gallery.status === "archived";
  const label = archived
    ? "Archived"
    : gallery.is_published
      ? "Published"
      : "Unpublished";

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

function buildGalleryCardShareUrl(
  gallery: Gallery,
  workspaceProfile: WorkspaceProfile | null,
  coverAsset?: EncryptedAssetLike | null,
): string {
  if (!gallery.slug) return "";
  const base = galleryPublicUrl(gallery, workspaceProfile);
  return appendStoredGalleryKeyFragment(
    base,
    gallery.id,
    mediaKeyIdsForAsset(coverAsset ?? gallery.cover_asset),
  );
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

type ShareCopyFallback = {
  galleryId: string;
  galleryTitle: string;
  url: string;
};

type ShareActionResult = "copied" | "manual" | void;

async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText)
    return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function friendlyShareUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function ShareCopyFallbackNotice({
  fallback,
  onRetry,
  onOpen,
  onDismiss,
}: {
  fallback: ShareCopyFallback;
  onRetry: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rounded-xl border border-border-default bg-surface-raised p-4 shadow-elevation-1"
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-text-primary">
            Copy blocked by this browser
          </p>
          <p className="text-sm text-text-secondary">
            Select the link below or try copying again. This link opens{" "}
            {fallback.galleryTitle}.
          </p>
          <p
            className="truncate text-xs text-text-tertiary"
            title={fallback.url}
          >
            {friendlyShareUrl(fallback.url)}
          </p>
        </div>
        <GlassButton
          type="button"
          onClick={onDismiss}
          variant="quiet"
          size="sm"
          className="self-start"
        >
          Dismiss
        </GlassButton>
      </div>
      <textarea
        aria-label="Share link"
        readOnly
        value={fallback.url}
        rows={2}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-3 w-full resize-none rounded-xl border border-border-default bg-surface-sunken px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <GlassButton type="button" onClick={onRetry} variant="primary">
          Try copy again
        </GlassButton>
        <GlassButton type="button" onClick={onOpen} variant="surface">
          Open link
        </GlassButton>
      </div>
    </div>
  );
}

function GalleryShareMenu({
  gallery,
  shareUrl,
  open,
  copied,
  busy,
  onToggle,
  onCopy,
  onEmail,
  onWhatsApp,
}: {
  gallery: Gallery;
  shareUrl: string;
  open: boolean;
  copied: boolean;
  busy: boolean;
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCopy: () => void | Promise<void>;
  onEmail: () => void | Promise<void>;
  onWhatsApp: () => void | Promise<void>;
}) {
  const canShare = gallery.is_published && Boolean(shareUrl);

  const runMenuAction = (
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void | Promise<void>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!canShare || busy) return;
    void action();
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
        label={
          copied ? `${gallery.title} link copied` : `Share ${gallery.title}`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        <Share />
      </GlassIconButton>

      {open && (
        <div
          role="menu"
          aria-label={`Share ${gallery.title}`}
          className="glass-menu absolute right-0 top-full z-[var(--z-popover)] mt-2 w-56 p-2"
        >
          {canShare ? (
            <div className="space-y-1">
              <button
                type="button"
                role="menuitem"
                onClick={(event) => runMenuAction(event, onCopy)}
                disabled={busy}
                className="glass-menu-item"
              >
                <ClipboardList className="h-5 w-5 shrink-0 text-text-secondary" />
                <span>{busy ? "Preparing link..." : "Copy link"}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => runMenuAction(event, onEmail)}
                disabled={busy}
                className="glass-menu-item"
              >
                <Envelope className="h-5 w-5 shrink-0 text-text-secondary" />
                <span>Email</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={(event) => runMenuAction(event, onWhatsApp)}
                disabled={busy}
                className="glass-menu-item"
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

function GalleryCardActions({
  gallery,
  shareUrl,
  shareOpen,
  copied,
  sharing,
  confirmingDelete,
  deleting,
  onToggleShare,
  onCopyShare,
  onEmailShare,
  onWhatsAppShare,
  onArmDelete,
  onCancelDelete,
  onConfirmDelete,
  className,
}: {
  gallery: Gallery;
  shareUrl: string;
  shareOpen: boolean;
  copied: boolean;
  sharing: boolean;
  confirmingDelete: boolean;
  deleting: boolean;
  onToggleShare: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCopyShare: () => void;
  onEmailShare: () => void;
  onWhatsAppShare: () => void;
  onArmDelete: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onCancelDelete: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onConfirmDelete: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-end gap-1.5", className)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <GalleryShareMenu
        gallery={gallery}
        shareUrl={shareUrl}
        open={shareOpen}
        copied={copied}
        busy={sharing}
        onToggle={onToggleShare}
        onCopy={onCopyShare}
        onEmail={onEmailShare}
        onWhatsApp={onWhatsAppShare}
      />
      {confirmingDelete ? (
        <div
          role="alertdialog"
          aria-busy={deleting}
          aria-label="Confirm gallery deletion"
          className="glass-confirm-bar flex-wrap"
        >
          <span className="glass-confirm-bar__label">Delete?</span>
          <GlassButton
            type="button"
            onClick={onCancelDelete}
            variant="quiet"
            size="sm"
            disabled={deleting}
          >
            Cancel
          </GlassButton>
          <GlassButton
            type="button"
            autoFocus
            onClick={onConfirmDelete}
            variant="danger"
            size="sm"
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Confirm"}
          </GlassButton>
          {deleting && (
            <div
              role="status"
              aria-live="polite"
              className="basis-full space-y-1 px-1 pb-1 text-xs font-medium text-text-secondary"
            >
              <span>Deleting gallery…</span>
              <span
                aria-hidden="true"
                className="block h-1.5 overflow-hidden rounded-full bg-surface-container-high"
              >
                <span className="block h-full w-2/3 animate-pulse rounded-full bg-feedback-error" />
              </span>
            </div>
          )}
        </div>
      ) : (
        <GlassIconButton
          type="button"
          size="md"
          variant="danger"
          label={`Delete ${gallery.title}`}
          onClick={onArmDelete}
          disabled={deleting}
        >
          <Trash />
        </GlassIconButton>
      )}
    </div>
  );
}

export default function GalleriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createRequested = searchParams?.get("create") === "true";
  const clientParam = searchParams?.get("client") ?? "";
  const projectParam = searchParams?.get("project") ?? "";
  // BUG-4 (UAT 2026-06-04): the global header search navigates here with
  // `?q=<term>`, but the term was being dropped — the list mounted unfiltered.
  // Seed the search filter from the URL using the same lazy-initial-state
  // pattern as create/client/project above (no set-state-on-mount the React
  // Compiler would flag).
  const searchParam = searchParams?.get("q") ?? "";
  const [token] = useState(() => getStoredAccessToken());
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  // Deep-link prefill: arriving from CRM/dashboard with
  // `?create=true&client=…&project=…` opens the create panel pre-populated.
  // The page always mounts fresh on those navigations (they originate from
  // other routes), so capturing the params as lazy initial state is
  // equivalent to syncing them in an effect — without the synchronous
  // set-state-on-mount the React Compiler flags.
  const [showCreate, setShowCreate] = useState(() => createRequested);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"proofing" | "delivery">("delivery");
  const [linkedContactId, setLinkedContactId] = useState(() => clientParam);
  const [linkedProjectId, setLinkedProjectId] = useState(() => projectParam);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);
  const [creating, setCreating] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => searchParam);
  // ID of the gallery currently armed for delete. The single-string shape
  // means arming Delete on a different card auto-disarms the previous one,
  // so the inline confirm bar never appears on two cards simultaneously.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingGalleryId, setDeletingGalleryId] = useState<string | null>(
    null,
  );
  // ID of the gallery whose share link was just copied — cleared after 1.5s.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareMenuGalleryId, setShareMenuGalleryId] = useState<string | null>(
    null,
  );
  const [sharingGalleryId, setSharingGalleryId] = useState<string | null>(null);
  const [shareCopyFallback, setShareCopyFallback] =
    useState<ShareCopyFallback | null>(null);
  const [coverAssets, setCoverAssets] = useState<Record<string, Asset>>({});
  // Gallery ID currently being published/unpublished — prevents double-clicks.
  // Backs the GalleryPublishSwitch `busy` state via toggleGalleryPublish.
  const [publishingGalleryId, setPublishingGalleryId] = useState<string | null>(
    null,
  );
  const [workspaceProfile, setWorkspaceProfile] =
    useState<WorkspaceProfile | null>(null);
  const openCreateForm = useCallback(() => {
    setError(null);
    setShareCopyFallback(null);
    setTitleError("");
    setShowCreate(true);
  }, []);

  const resetCreateForm = useCallback(() => {
    setError(null);
    setShareCopyFallback(null);
    setShowCreate(false);
    setNewTitle("");
    setTitleError("");
    setLinkedContactId("");
    setLinkedProjectId("");
    setNewClientName("");
    setNewClientEmail("");
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
        if (filterStatus === "unpublished" && (g.is_published || isArchived))
          return false;
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

  // Continuous scrolling: render gallery cards in growing windows instead of
  // all at once, and reveal each card with a soft rise on first view.
  const {
    visibleCount,
    hasMore: hasMoreCards,
    sentinelRef: cardSentinelRef,
  } = useInfiniteRender(filteredGalleries.length, {
    initialCount: 24,
    batchSize: 24,
  });
  const visibleGalleries = useMemo(
    () => filteredGalleries.slice(0, visibleCount),
    [filteredGalleries, visibleCount],
  );
  const revealGroupRef = useScrollRevealGroup<HTMLDivElement>([
    visibleGalleries,
    viewMode,
  ]);

  // Cover hydration is bounded to the rendered window so request counts do
  // not scale with total gallery count (AGENTS.md performance hot paths).
  const missingCoverAssetIds = useMemo(() => {
    return Array.from(
      new Set(
        visibleGalleries
          .map((g) => {
            if (g.cover_asset) return "";
            const coverAssetId = readGalleryCoverAssetId(
              g.settings,
              g.cover_asset_id,
            );
            if (!coverAssetId || coverAssets[coverAssetId]) return "";
            // `g.cover_asset` is already falsy here (guarded above), so the
            // former `g.cover_asset?.id === coverAssetId` check was dead and
            // narrowed cover_asset to `never`, breaking the type-check.
            return coverAssetId;
          })
          .filter((id): id is string => Boolean(id && !coverAssets[id])),
      ),
    );
  }, [coverAssets, visibleGalleries]);

  // Arms the inline confirm bar for the given gallery card. The actual
  // delete happens in confirmDelete() — splitting these two keeps the
  // browser confirm() dialog out of the flow (UX rule 2026-05-18) and
  // gives the user a visible "Cancel" path right where the click landed.
  const armDelete = (e: React.MouseEvent, galleryId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeleteId(galleryId);
  };

  const createWorkingShareUrl = async (
    gallery: Gallery,
    channel: "copy" | "email" | "whatsapp",
  ) => {
    if (!token) {
      throw new Error("Sign in again to create a share link.");
    }
    if (!gallery.is_published) {
      throw new Error("Publish this gallery before sharing client links.");
    }

    const coverAssetId = readGalleryCoverAssetId(
      gallery.settings,
      gallery.cover_asset_id,
    );
    const coverAsset =
      gallery.cover_asset ??
      (coverAssetId ? coverAssets[coverAssetId] : undefined);
    const baseUrl = buildGalleryCardShareUrl(
      gallery,
      workspaceProfile,
      coverAsset,
    );
    if (!baseUrl) {
      throw new Error("Share link unavailable: gallery URL is missing.");
    }

    const expiryDays = galleryShareExpiryDays(gallery);
    const link = await createGalleryShareLink(token, gallery.id, {
      access_mode: "public",
      download_allowed: gallery.download_enabled !== false,
      channel,
      ...(expiryDays !== undefined ? { expiry_days: expiryDays } : {}),
    });
    return setUrlSearchParamBeforeFragment(baseUrl, "share", link.token);
  };

  const runShareAction = async (
    gallery: Gallery,
    channel: "copy" | "email" | "whatsapp",
    action: (url: string) => Promise<ShareActionResult> | ShareActionResult,
  ) => {
    if (sharingGalleryId === gallery.id) return;
    setSharingGalleryId(gallery.id);
    setError(null);
    setShareCopyFallback(null);
    try {
      const url = await createWorkingShareUrl(gallery, channel);
      const result = await action(url);
      if (channel === "copy" && result !== "manual") {
        setCopiedId(gallery.id);
        setTimeout(() => setCopiedId(null), 1500);
      }
      setShareMenuGalleryId(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create gallery share link",
      );
    } finally {
      setSharingGalleryId(null);
    }
  };

  const copyShareLink = (gallery: Gallery) => {
    void runShareAction(gallery, "copy", async (url) => {
      const copied = await writeClipboardText(url);
      if (copied) return "copied";
      setShareCopyFallback({
        galleryId: gallery.id,
        galleryTitle: gallery.title || "this gallery",
        url,
      });
      return "manual";
    });
  };

  const retryShareFallbackCopy = async () => {
    if (!shareCopyFallback) return;
    setError(null);
    const copied = await writeClipboardText(shareCopyFallback.url);
    if (!copied) {
      setError(
        "This browser is still blocking clipboard access. Select the link field and copy it manually.",
      );
      return;
    }
    const galleryId = shareCopyFallback.galleryId;
    setShareCopyFallback(null);
    setCopiedId(galleryId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const openShareFallbackLink = () => {
    if (!shareCopyFallback) return;
    window.open(shareCopyFallback.url, "_blank", "noopener,noreferrer");
  };

  const dismissShareFallback = () => {
    setShareCopyFallback(null);
    setError(null);
  };

  const emailShareLink = (gallery: Gallery) => {
    void runShareAction(gallery, "email", (url) => {
      window.location.href = buildGalleryEmailHref(gallery, url);
    });
  };

  const whatsAppShareLink = (gallery: Gallery) => {
    void runShareAction(gallery, "whatsapp", (url) => {
      window.open(
        buildGalleryWhatsAppHref(gallery, url),
        "_blank",
        "noopener,noreferrer",
      );
    });
  };

  const confirmDelete = async (galleryId: string) => {
    if (!token) {
      setConfirmDeleteId(null);
      return;
    }
    if (deletingGalleryId) return;
    setDeletingGalleryId(galleryId);
    try {
      await deleteGallery(token, galleryId);
      setConfirmDeleteId(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete gallery");
      setConfirmDeleteId(null);
    } finally {
      setDeletingGalleryId(null);
    }
  };

  const toggleGalleryPublish = async (
    event: React.MouseEvent<HTMLButtonElement>,
    gallery: Gallery,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      !token ||
      publishingGalleryId === gallery.id ||
      gallery.status === "archived"
    )
      return;

    setPublishingGalleryId(gallery.id);
    setError(null);
    try {
      const updated = await updateGallery(token, gallery.id, {
        is_published: !gallery.is_published,
      });
      setGalleries((prev) =>
        prev.map((item) =>
          item.id === gallery.id
            ? {
                ...item,
                ...updated,
                cover_thumbnails:
                  updated.cover_thumbnails || item.cover_thumbnails,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update publish state",
      );
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
      .catch((err) => {
        setError(err?.message || "Failed to load galleries");
        setGalleries([]);
      })
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
      const created = await createGallery(token, {
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
      // Open the new gallery immediately rather than leaving the user to hunt
      // for it in the list (fixes the "new gallery inaccessible after creation"
      // UX gap). Fall back to a list refresh if the id is somehow absent.
      if (created?.id) {
        router.push(`/galleries/${created.id}`);
      } else {
        refresh();
      }
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
      <PageContainer width="full" className="px-0">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="full" className="px-0">
      {error && (
        <InlineAlert variant="error" className="mb-4">
          {error}
        </InlineAlert>
      )}
      {shareCopyFallback && (
        <ShareCopyFallbackNotice
          fallback={shareCopyFallback}
          onRetry={() => {
            void retryShareFallbackCopy();
          }}
          onOpen={openShareFallbackLink}
          onDismiss={dismissShareFallback}
        />
      )}
      <PageHeader
        title="Galleries"
        titleAccessory={
          <span className="page-header-count-badge">
            {filteredGalleries.length === galleries.length
              ? `${galleries.length} ${galleries.length === 1 ? "gallery" : "galleries"}`
              : `${filteredGalleries.length} of ${galleries.length} galleries`}
          </span>
        }
        actions={
          <div className="galleries-header-actions">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter galleries..."
              className="input-base galleries-header-actions__search text-sm"
              aria-label="Filter galleries"
            />
            <GlassButton
              onClick={openCreateForm}
              variant="primary"
              className="shrink-0 whitespace-nowrap"
              aria-label="Create new gallery"
              icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              <span className="sm:inline">New Gallery</span>
            </GlassButton>
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
        }
      />

      {/* Active filter chips */}
      {(filterType || filterStatus || searchQuery.trim()) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-text-tertiary">Filtered by:</span>
          {filterType && (
            <GlassButton
              onClick={() => setFilterType(null)}
              variant="quiet"
              size="sm"
              icon={<XMark className="h-3 w-3" aria-hidden="true" />}
            >
              {filterType}
            </GlassButton>
          )}
          {filterStatus && (
            <GlassButton
              onClick={() => setFilterStatus(null)}
              variant="quiet"
              size="sm"
              icon={<XMark className="h-3 w-3" aria-hidden="true" />}
            >
              {/* Display proper-cased label to match the per-card badge.
                  filterStatus values are publish-state buckets
                  (published / unpublished / archived) since 2026-05-18. */}
              {filterStatus.charAt(0).toUpperCase() + filterStatus.slice(1)}
            </GlassButton>
          )}
          {searchQuery.trim() && (
            <GlassButton
              onClick={() => setSearchQuery("")}
              variant="quiet"
              size="sm"
              icon={<XMark className="h-3 w-3" aria-hidden="true" />}
            >
              &quot;{searchQuery.trim()}&quot;
            </GlassButton>
          )}
          <GlassButton
            onClick={() => {
              setFilterType(null);
              setFilterStatus(null);
              setSearchQuery("");
            }}
            variant="quiet"
            size="sm"
          >
            Clear all
          </GlassButton>
        </div>
      )}

      {showCreate && (
        <div className="surface-panel space-y-4 p-6">
          <h2 className="text-lg font-semibold text-text-primary">
            New Gallery
          </h2>
          <div className="space-y-3">
            <div>
              <label className="form-label">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  if (titleError) setTitleError("");
                  if (error) setError(null);
                }}
                className={cn(
                  "input-base mt-1 w-full",
                  titleError ? "border-feedback-error" : null,
                )}
                placeholder="e.g. Sharma Wedding 2026"
                autoFocus
                aria-invalid={!!titleError}
                aria-describedby={titleError ? "title-error" : undefined}
              />
              {titleError && (
                <p
                  id="title-error"
                  className="mt-1 text-xs text-feedback-error"
                >
                  {titleError}
                </p>
              )}
            </div>
            <div>
              <label className="form-label">Type</label>
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as "proofing" | "delivery")
                }
                className="input-base mt-1 w-full"
              >
                <option value="proofing">
                  Proofing — client selects favorites
                </option>
                <option value="delivery">Delivery — final deleviary</option>
              </select>
            </div>
            <div className="rounded-xl border border-border-default bg-surface-container-low p-4">
              <label className="form-label">Linked client</label>
              <select
                value={linkedContactId}
                onChange={(e) => setLinkedContactId(e.target.value)}
                className="input-base mt-1 w-full"
              >
                <option value="">No client linked yet</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                    {contact.email ? ` - ${contact.email}` : ""}
                  </option>
                ))}
              </select>
              {linkedProjectId && (
                <p className="mt-2 text-xs text-text-secondary">
                  This gallery will also stay attached to project{" "}
                  {linkedProjectId.slice(0, 8)}.
                </p>
              )}
              <div className="gallery-client-grid mt-4">
                <input
                  type="text"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="New client name"
                  className="input-base text-sm"
                />
                <input
                  type="email"
                  value={newClientEmail}
                  onChange={(e) => setNewClientEmail(e.target.value)}
                  placeholder="Email optional"
                  className="input-base text-sm"
                />
                <GlassButton
                  type="button"
                  onClick={handleCreateClient}
                  disabled={creatingClient || !newClientName.trim()}
                  variant="surface"
                  size="md"
                >
                  {creatingClient ? "Adding..." : "Add client"}
                </GlassButton>
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <GlassButton
              onClick={resetCreateForm}
              variant="surface"
              disabled={creating}
            >
              Cancel
            </GlassButton>
            <GlassButton
              onClick={handleCreate}
              disabled={creating}
              variant="primary"
            >
              {creating ? "Creating…" : "Create Gallery"}
            </GlassButton>
          </div>
        </div>
      )}

      {galleries.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-sunken">
            <Photo className="empty-state-icon" aria-hidden="true" />
          </div>
          <p className="text-text-secondary">
            No galleries yet. Create your first gallery to get started.
          </p>
          {!showCreate && (
            <GlassButton
              onClick={() => setShowCreate(true)}
              variant="primary"
              className="mt-4"
              icon={<Plus className="h-4 w-4" aria-hidden="true" />}
            >
              Create your first gallery
            </GlassButton>
          )}
        </div>
      ) : (
        <div
          ref={revealGroupRef}
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              : "space-y-3"
          }
        >
          {visibleGalleries.map((g, index) => {
            const coverAssetId = readGalleryCoverAssetId(
              g.settings,
              g.cover_asset_id,
            );
            const coverAsset =
              g.cover_asset ??
              (coverAssetId ? coverAssets[coverAssetId] : undefined);
            const shareUrl = buildGalleryCardShareUrl(
              g,
              workspaceProfile,
              coverAsset,
            );

            const galleryHref = `/galleries/${g.id}`;

            return (
              <article
                key={g.id}
                data-reveal
                style={
                  {
                    "--reveal-delay": `${(index % 12) * 40}ms`,
                  } as React.CSSProperties
                }
                className={cn(
                  "group relative rounded-xl border border-border-default bg-surface-raised",
                  "hover:border-accent/30 hover:shadow-elevation-1 transition-all duration-200",
                  viewMode === "list" && "flex items-center gap-4",
                )}
              >
                {/* Cover thumbnail (grid view) */}
                {viewMode === "grid" && (
                  <Link
                    href={galleryHref}
                    aria-label={`Open ${g.title}`}
                    className="relative block aspect-[16/10] w-full overflow-hidden rounded-t-xl bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
                  >
                    <GalleryCoverPreview
                      gallery={g}
                      coverAsset={coverAsset}
                      token={token}
                      alt={`${g.title} cover`}
                    />
                  </Link>
                )}

                {/* List view thumbnail */}
                {viewMode === "list" && (
                  <Link
                    href={galleryHref}
                    aria-label={`Open ${g.title}`}
                    className="relative ml-4 block h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-surface-sunken focus:outline-none focus:ring-2 focus:ring-border-focus"
                  >
                    <GalleryCoverPreview
                      gallery={g}
                      coverAsset={coverAsset}
                      token={token}
                      alt=""
                    />
                  </Link>
                )}

                <div
                  className={
                    viewMode === "grid"
                      ? "p-4 space-y-3"
                      : "flex-1 min-w-0 py-4"
                  }
                >
                  {viewMode === "grid" ? (
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="min-w-0 flex-1 truncate font-medium text-text-primary">
                        <Link
                          href={galleryHref}
                          className="rounded-md focus:outline-none focus:ring-2 focus:ring-border-focus"
                        >
                          {g.title}
                        </Link>
                      </h3>
                      <GalleryCardActions
                        gallery={g}
                        shareUrl={shareUrl}
                        shareOpen={shareMenuGalleryId === g.id}
                        copied={copiedId === g.id}
                        sharing={sharingGalleryId === g.id}
                        confirmingDelete={confirmDeleteId === g.id}
                        deleting={deletingGalleryId === g.id}
                        onToggleShare={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (deletingGalleryId === g.id) return;
                          setConfirmDeleteId(null);
                          setShareMenuGalleryId((current) =>
                            current === g.id ? null : g.id,
                          );
                        }}
                        onCopyShare={() => copyShareLink(g)}
                        onEmailShare={() => emailShareLink(g)}
                        onWhatsAppShare={() => whatsAppShareLink(g)}
                        onArmDelete={(event) => armDelete(event, g.id)}
                        onCancelDelete={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (deletingGalleryId === g.id) return;
                          setConfirmDeleteId(null);
                        }}
                        onConfirmDelete={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void confirmDelete(g.id);
                        }}
                        className="shrink-0"
                      />
                    </div>
                  ) : (
                    <h3 className="truncate font-medium text-text-primary">
                      <Link
                        href={galleryHref}
                        className="rounded-md focus:outline-none focus:ring-2 focus:ring-border-focus"
                      >
                        {g.title}
                      </Link>
                    </h3>
                  )}
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
                <div
                  className={cn(
                    "flex items-center gap-2",
                    viewMode === "grid" ? "px-4 pb-4" : "pr-4",
                  )}
                >
                  <span className="text-xs text-text-tertiary">
                    {new Date(g.created_at).toLocaleDateString("en-IN")}
                  </span>
                  {viewMode === "list" && (
                    <GalleryCardActions
                      gallery={g}
                      shareUrl={shareUrl}
                      shareOpen={shareMenuGalleryId === g.id}
                      copied={copiedId === g.id}
                      sharing={sharingGalleryId === g.id}
                      confirmingDelete={confirmDeleteId === g.id}
                      deleting={deletingGalleryId === g.id}
                      onToggleShare={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (deletingGalleryId === g.id) return;
                        setConfirmDeleteId(null);
                        setShareMenuGalleryId((current) =>
                          current === g.id ? null : g.id,
                        );
                      }}
                      onCopyShare={() => copyShareLink(g)}
                      onEmailShare={() => emailShareLink(g)}
                      onWhatsAppShare={() => whatsAppShareLink(g)}
                      onArmDelete={(event) => armDelete(event, g.id)}
                      onCancelDelete={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (deletingGalleryId === g.id) return;
                        setConfirmDeleteId(null);
                      }}
                      onConfirmDelete={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void confirmDelete(g.id);
                      }}
                      className="ml-2"
                    />
                  )}
                </div>
              </article>
            );
          })}
          {hasMoreCards && (
            <div
              ref={cardSentinelRef}
              data-testid="galleries-load-more-sentinel"
              aria-hidden="true"
              className="col-span-full h-px"
            />
          )}
        </div>
      )}
    </PageContainer>
  );
}
