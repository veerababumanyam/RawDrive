"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import type { Gallery } from "@/lib/api/galleries";
import { ShareQrPopover } from "@/components/gallery/share-qr-popover";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { ArrowLeft, Check, Copy, Eye } from "@/components/icons";
import { copyTextToClipboard } from "@/lib/clipboard";

// Owner-facing chrome bar that sits above the rendered preview. Pinned
// just below the dashboard header so the photographer can copy the
// shareable URL without scrolling back to the action bar. Lives in a
// dedicated component so the clipboard/feedback behavior is unit-
// testable without spinning up the whole preview page (which fetches
// auth-scoped APIs).
interface Props {
  gallery: Gallery;
  publicUrl: string;
  isPublished?: boolean;
  getShareUrl?: () => string | Promise<string>;
}

export function PreviewChrome({
  gallery,
  publicUrl,
  isPublished,
  getShareUrl,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const published = isPublished ?? gallery.is_published === true;
  const shareEnabled = published && Boolean(publicUrl);

  const resolveShareUrl = useCallback(async () => {
    if (getShareUrl) return getShareUrl();
    return publicUrl;
  }, [getShareUrl, publicUrl]);

  const handleCopy = useCallback(async () => {
    setError(null);
    if (!shareEnabled) {
      setError(
        published
          ? "Preview URL unavailable."
          : "Publish this gallery before copying the client link.",
      );
      return;
    }
    try {
      const shareUrl = await resolveShareUrl();
      if (!shareUrl) throw new Error("Share link unavailable.");
      await copyTextToClipboard(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — long-press the URL to copy manually.");
    }
  }, [published, resolveShareUrl, shareEnabled]);

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
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back
        </Link>

        <div className="flex items-center gap-2">
          <span className="status-badge status-badge--accent">
            <Eye className="mr-1 inline h-3 w-3" aria-hidden="true" /> Preview
            Mode
          </span>
          {!published && (
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
          <GlassIconButton
            type="button"
            onClick={handleCopy}
            disabled={!shareEnabled}
            data-testid="preview-share-button"
            label={copied ? "Share link copied" : "Copy share link"}
            variant={copied ? "success" : "accent"}
            size="md"
            className={!shareEnabled ? "cursor-not-allowed opacity-50" : ""}
          >
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </GlassIconButton>
          <ShareQrPopover
            url={getShareUrl ? "" : publicUrl}
            getShareUrl={getShareUrl}
            disabled={!shareEnabled}
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
