"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Check, Copy, Download, QRCode } from "@/components/icons";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { components } from "@/lib/tokens";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { downloadQrPng, downloadQrSvg, renderQrToCanvas } from "@/lib/qr";

// On-screen QR resolution. The downloadable PNG/SVG are generated fresh at
// print quality (see lib/qr.ts) — this is just the preview the photographer
// sees in the card.
const QR_DISPLAY_SIZE = 200;

const subscribeNoop = () => () => {};

// Client-only flag via useSyncExternalStore. The server snapshot is `false`,
// so the SSR HTML and the first client render agree (no hydration mismatch);
// the store then commits `true` on the client. This lets us read the
// window.location-derived share URL only on the client while keeping the
// render pure (no setState-in-effect, which the React-Compiler lint forbids).
function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

type ShareUrlGetter = () => string | Promise<string>;

interface GalleryShareQrCardProps {
  /**
   * Returns the durable, gallery-wide public share URL - the same value the
   * Copy/Share buttons use, including the `?share=` session handoff and
   * `#rd_key` end-to-end-encryption fragment when present. Called only on the
   * client so the card stays SSR- and hydration-safe.
   */
  getShareUrl: ShareUrlGetter;
  /** Gallery title — used in the accessible QR label. */
  title: string;
  /** Gallery slug — used to name the downloaded files. */
  slug: string;
  className?: string;
}

/**
 * Always-visible "Share & QR" card for the gallery workspace. Once a gallery
 * is published this surfaces the public link as a scannable QR right where the
 * photographer publishes — no need to dig into the preview page — plus
 * high-quality downloads (print-resolution PNG + vector SVG) they can drop into
 * a print package, a marketing card, or WhatsApp. Scanning the QR opens the
 * gallery URL.
 */
export function GalleryShareQrCard({
  getShareUrl,
  title,
  slug,
  className,
}: GalleryShareQrCardProps) {
  const isClient = useIsClient();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [url, setUrl] = useState("");
  const [urlResolved, setUrlResolved] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fileBase = `${slug || "gallery"}-qr`;
  // Clean, human-readable address for display - strips the protocol, share
  // token, and `#rd_key` fragment so non-technical users see a tidy
  // "rawdrive.in/g/event" rather than a wall of key material. The QR and
  // Copy use the full `url`; both the share token and fragment must travel with
  // the link for private/E2E galleries to open.
  const displayUrl = url
    ? url.replace(/^https?:\/\//, "").split(/[?#]/)[0]
    : "";
  const securedShareUrl = /[?&]share=/.test(url);
  const preparingUrl = isClient && !url && !actionError && !urlResolved;

  useEffect(() => {
    if (!isClient) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return "";
        setUrlResolved(false);
        setActionError(null);
        return getShareUrl();
      })
      .then((nextUrl) => {
        if (cancelled) return;
        setUrl(nextUrl);
        setUrlResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setUrl("");
        setUrlResolved(true);
        setActionError("Couldn't prepare the share QR - try Copy instead.");
      });
    return () => {
      cancelled = true;
    };
  }, [getShareUrl, isClient]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    let cancelled = false;
    renderQrToCanvas(canvas, url, QR_DISPLAY_SIZE)
      .then(() => {
        if (!cancelled) setRenderError(false);
      })
      .catch(() => {
        if (!cancelled) setRenderError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Plain handlers — the React Compiler memoizes them; manual useCallback here
  // trips react-hooks/preserve-manual-memoization (it infers the setState
  // setters as deps).
  const handleCopy = async () => {
    if (!url) return;
    setActionError(null);
    try {
      await copyTextToClipboard(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("Couldn't copy — long-press the address to copy it.");
    }
  };

  const handleDownloadPng = async () => {
    if (!url) return;
    setActionError(null);
    try {
      await downloadQrPng(url, fileBase);
    } catch {
      setActionError("Couldn't prepare the PNG — please try again.");
    }
  };

  const handleDownloadSvg = async () => {
    if (!url) return;
    setActionError(null);
    try {
      await downloadQrSvg(url, fileBase);
    } catch {
      setActionError("Couldn't prepare the SVG — please try again.");
    }
  };

  if (!url) {
    return (
      <section
        className={cn("surface-panel p-5", className)}
        data-testid="share-qr-card"
      >
        <div
          data-testid="share-qr-card-unavailable"
          className="flex items-center gap-3 text-sm text-text-secondary"
        >
          <QRCode aria-hidden="true" className="h-5 w-5 text-text-tertiary" />
          <p>
            {actionError ||
              (preparingUrl
                ? "Preparing this gallery's shareable QR code..."
                : "Publish this gallery to generate its shareable QR code.")}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn("surface-panel p-5", className)}
      data-testid="share-qr-card"
      aria-labelledby="share-qr-card-heading"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* QR plate — fixed high-contrast white for scanner reliability across
            all three themes (the qrCode design token, not a theme surface). */}
        <div
          className="flex shrink-0 justify-center self-center rounded-2xl p-3 sm:self-start"
          style={{ backgroundColor: components.qrCode.light }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`QR code to open the ${title} gallery`}
            data-testid="share-qr-card-canvas"
            className="max-w-full"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            Share & QR
          </p>
          <h3
            id="share-qr-card-heading"
            className="mt-1 text-lg font-semibold text-text-primary"
          >
            Scan to open this gallery
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Clients can scan this code to open the gallery — or download it for
            prints, cards, and WhatsApp.
          </p>

          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border-default bg-surface-sunken px-3 py-2">
            <span
              className="min-w-0 flex-1 truncate text-sm text-text-primary"
              title={url}
            >
              {displayUrl}
            </span>
            {securedShareUrl && (
              <span className="status-badge status-badge--success hidden shrink-0 sm:inline-flex">
                Secured link
              </span>
            )}
            <GlassIconButton
              type="button"
              size="md"
              variant="ghost"
              onClick={() => void handleCopy()}
              active={copied}
              data-testid="share-qr-card-copy"
              label={copied ? "Gallery address copied" : "Copy gallery address"}
              className="shrink-0"
            >
              {copied ? <Check /> : <Copy />}
            </GlassIconButton>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadPng()}
              data-testid="share-qr-card-download-png"
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download QR (PNG)
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadSvg()}
              data-testid="share-qr-card-download-svg"
              className="btn-tertiary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              SVG (vector)
            </button>
          </div>
          <p className="mt-2 text-xs text-text-tertiary">
            PNG is print-ready and great for WhatsApp. SVG scales to any size
            for large prints and signage.
          </p>

          <p className="mt-3 text-xs text-error" role="alert">
            {renderError
              ? "Couldn't render the QR here — the Copy and download buttons still work."
              : actionError}
          </p>
        </div>
      </div>
    </section>
  );
}
