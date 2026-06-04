"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Expand, MoreVertical, Share, Trash } from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { GlassButton } from "@/components/ui/glass-button";
import {
  deleteGallery,
  galleryPublicUrl,
  type Gallery,
} from "@/lib/api/galleries";

// Recent-gallery overflow menu (BUG-2, UAT 2026-06-04).
//
// The dashboard "Recent Galleries" card used to render a bare ⋮ glyph with no
// behaviour — clicks fell through to the card's navigation. This is a real
// overflow menu: Open / Copy link / Delete, reusing the deleteGallery API,
// galleryPublicUrl, and the shared glass-menu primitives.
//
// It MUST be rendered as a sibling of the card <Link> (never nested inside it),
// so we don't put <button>s inside an <a>; and every interaction stops
// propagation so using the menu never triggers the surrounding card navigation.
export function RecentGalleryMenu({
  gallery,
  token,
  onDeleted,
}: {
  gallery: Gallery;
  token: string | null;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  const stop = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleOpenGallery = (event: React.MouseEvent) => {
    stop(event);
    setOpen(false);
    router.push(`/galleries/${gallery.id}`);
  };

  const handleCopyLink = async (event: React.MouseEvent) => {
    stop(event);
    try {
      await navigator.clipboard.writeText(galleryPublicUrl(gallery));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied (insecure context / permissions) — leave the menu open
      // so the user can retry; never fake a success state.
    }
  };

  const handleConfirmDelete = async (event: React.MouseEvent) => {
    stop(event);
    setDeleting(true);
    try {
      await deleteGallery(token ?? "", gallery.id);
      onDeleted(gallery.id);
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <div ref={ref} className="relative" onClick={stop}>
      <GlassIconButton
        type="button"
        size="sm"
        variant="glass"
        active={open}
        label={`Actions for ${gallery.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          stop(event);
          setOpen((prev) => !prev);
          setConfirmingDelete(false);
        }}
      >
        <MoreVertical />
      </GlassIconButton>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${gallery.title}`}
          className="glass-menu absolute right-0 top-full z-[var(--z-popover)] mt-2 w-52 p-2"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleOpenGallery}
            className="glass-menu-item"
          >
            <Expand className="h-5 w-5 shrink-0 text-text-secondary" />
            <span>Open gallery</span>
          </button>

          {gallery.is_published ? (
            <button
              type="button"
              role="menuitem"
              onClick={handleCopyLink}
              className="glass-menu-item"
            >
              <Share className="h-5 w-5 shrink-0 text-text-secondary" />
              <span>{copied ? "Link copied" : "Copy link"}</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              disabled
              className="glass-menu-item"
              title="Publish this gallery before sharing a client link"
            >
              <Share className="h-5 w-5 shrink-0 text-text-tertiary" />
              <span>Publish to share</span>
            </button>
          )}

          {confirmingDelete ? (
            <div
              role="alertdialog"
              aria-label={`Confirm deleting ${gallery.title}`}
              className="glass-confirm-bar mt-1"
            >
              <span className="glass-confirm-bar__label">Delete?</span>
              <GlassButton
                type="button"
                size="sm"
                variant="quiet"
                onClick={(event) => {
                  stop(event);
                  setConfirmingDelete(false);
                }}
              >
                Cancel
              </GlassButton>
              <GlassButton
                type="button"
                size="sm"
                variant="danger"
                autoFocus
                disabled={deleting}
                onClick={handleConfirmDelete}
              >
                {deleting ? "Deleting…" : "Confirm"}
              </GlassButton>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                stop(event);
                setConfirmingDelete(true);
              }}
              className="glass-menu-item text-error"
            >
              <Trash className="h-5 w-5 shrink-0" />
              <span>Delete</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
