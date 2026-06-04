"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, Check, Copy, Eye } from "lucide-react";
import type { Gallery } from "@/lib/api/galleries";
import { cn } from "@/lib/utils";
import { ShareQrPopover } from "@/components/gallery/share-qr-popover";

// Owner-facing chrome bar that sits above the rendered preview. Pinned
// just below the dashboard header so the photographer can copy the
// shareable URL without scrolling back to the action bar. Lives in a
// dedicated component so the clipboard/feedback behavior is unit-
// testable without spinning up the whole preview page (which fetches
// auth-scoped APIs).
interface Props {
  gallery: Gallery;
  publicUrl: string;
}

export function PreviewChrome({ gallery, publicUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    setError(null);
    if (!publicUrl) {
      setError("Preview URL unavailable.");
      return;
    }
    try {
      // Prefer the async Clipboard API. Fall back to the textarea +
      // execCommand trick for environments that block it (older Safari
      // and non-HTTPS local dev where clipboard API is undefined).
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicUrl);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = publicUrl;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } else {
        throw new Error("Clipboard unavailable");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — long-press the URL to copy manually.");
    }
  }, [publicUrl]);

  const isPublished = gallery.is_published === true;
  const friendlyUrl = publicUrl
    ? publicUrl.replace(/^https?:\/\//, "")
    : "Publish to generate a public URL";

  return (
    <div
      data-testid="preview-chrome"
      className="sticky top-16 z-30 mb-6 -mx-4 lg:-mx-8 border-b border-border-default bg-surface/95 px-4 py-3 glass-blur-soft"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <Link
          href={`/galleries/${gallery.id}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-text-primary"
          title="Back to gallery workspace"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>

        <div className="flex items-center gap-2">
          <span className="status-badge status-badge--accent">
            <Eye className="mr-1 inline h-3 w-3" /> Preview Mode
          </span>
          {!isPublished && (
            <span className="text-xs text-text-tertiary">
              Unpublished — clients can&apos;t access this link yet
            </span>
          )}
        </div>

        <div className="ml-auto flex flex-1 items-center gap-2 sm:flex-none">
          <span
            className="hidden truncate rounded-full bg-surface-sunken px-3 py-1.5 text-xs text-text-secondary sm:inline-block"
            title={publicUrl || ""}
          >
            {friendlyUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!publicUrl}
            data-testid="preview-share-button"
            aria-label={copied ? "Share link copied" : "Copy share link"}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              !publicUrl
                ? "bg-surface-container-high text-text-tertiary cursor-not-allowed"
                : copied
                  ? "bg-success text-text-inverse"
                  : "bg-accent text-text-inverse hover:bg-accent-hover",
            )}
            title={publicUrl ? `Copy ${publicUrl}` : "Publish to share"}
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Share link
              </>
            )}
          </button>
          <ShareQrPopover
            url={publicUrl}
            label="Show QR for share link"
            filename={`${gallery.slug || "gallery"}-qr`}
          />
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mx-auto mt-2 max-w-6xl rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs text-error"
        >
          {error}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {copied ? "Share link copied to clipboard." : ""}
      </p>
    </div>
  );
}
