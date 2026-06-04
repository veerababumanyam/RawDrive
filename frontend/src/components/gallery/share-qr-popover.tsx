"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { QrCode, Download, X } from "lucide-react";
import QRCodeLib from "qrcode";
import { cn } from "@/lib/utils";

// Inline "Show QR code" toggle that lives next to a copy-link button in
// the photographer's share UIs. Click renders the QR into a canvas inside
// a small floating panel anchored to the toggle; click again (or Esc /
// outside) closes it. Provides a "Download PNG" affordance so the
// photographer can drop the QR into a print package or WhatsApp.
//
// Rendering strategy: the panel is portaled into document.body with
// position:fixed coordinates derived from the toggle's bounding rect.
// This dodges the overflow-clipping bug that hid the popover when the
// toggle lived inside a horizontally-scrolling chip row (e.g. the
// Sub-galleries chip strip in the gallery dashboard). Anchoring is
// recomputed on scroll/resize so the popover stays glued to the toggle
// as the user scrolls. SSR-safe: createPortal is only reached after
// mount when `document` is available.
//
// Pure client component — the `qrcode` package is bundled into the
// frontend chunk per the same convention used by InviteGenerator.tsx
// (no server-side QR endpoint).
type ShareUrlGetter = () => string | Promise<string>;

interface ShareQrPopoverProps {
  url?: string;
  getShareUrl?: ShareUrlGetter;
  disabled?: boolean;
  label?: string;
  filename?: string;
  size?: number;
  onUnavailable?: () => void;
  /**
   * Optional className applied to the toggle wrapper so the caller can
   * match it to the visual weight of the adjacent "Copy" button.
   */
  className?: string;
}

interface AnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
}

const PANEL_WIDTH = 256; // matches the `w-64` Tailwind class below — kept in sync for viewport-overflow math
const PANEL_GAP = 8; // vertical gap between the toggle and the panel

export function ShareQrPopover({
  url = "",
  getShareUrl,
  disabled = false,
  label = "Show QR code",
  filename = "share-qr",
  size = 224,
  onUnavailable,
  className,
}: ShareQrPopoverProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState("");
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Resolve the portal target lazily inside render: `typeof document` is
  // undefined during SSR and `null` is a no-op for createPortal. This
  // sidesteps the React 19 react-hooks/set-state-in-effect rule that
  // would fire on the typical `useEffect(() => setMounted(true), [])`
  // pattern — we read the side-effect-free environment value directly.
  const portalTarget = typeof document !== "undefined" ? document.body : null;
  const currentUrl = resolvedUrl || url;

  // Recompute the toggle's bounding rect whenever the popover opens, and
  // again on scroll/resize so the panel follows. Layout-effect runs after
  // DOM mutation but before paint, so the panel never visibly snaps from
  // an old position to a new one.
  useLayoutEffect(() => {
    if (!open) return;

    function update() {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAnchor({
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    }

    update();
    // capture:true on scroll picks up the chip row's horizontal scroll
    // (which doesn't bubble) so the panel tracks the toggle as the row
    // is dragged.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Render the QR when the popover opens or the URL changes. Re-renders
  // on URL change so a photographer flipping between sub-album previews
  // or rotating share tokens sees the matching QR without a remount.
  useEffect(() => {
    if (!open || !currentUrl || !canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, currentUrl, {
      width: size,
      margin: 1,
      // ECC level "H" (~30% recovery) so a printed QR survives folding
      // and glare on a marketing card or a phone screenshot.
      errorCorrectionLevel: "H",
    })
      .then(() => setError(null))
      .catch(() => {
        setError("Could not render QR — try copying the URL instead.");
      });
  }, [currentUrl, open, size]);

  // Close on Escape and on outside-click. Both the toggle and the portaled
  // panel are "inside" — clicking anywhere else dismisses.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClickAway(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClickAway);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClickAway);
    };
  }, [open]);

  const handleDownload = useCallback(() => {
    if (!canvasRef.current) return;
    try {
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${filename}.png`;
      a.click();
    } catch {
      setError("Could not download QR — your browser blocked it.");
    }
  }, [filename]);

  const unavailable = disabled || (!currentUrl && !getShareUrl);
  const nativeDisabled = (unavailable && !onUnavailable) || loadingUrl;

  const handleToggle = useCallback(async () => {
    if (loadingUrl) return;
    if (disabled) {
      onUnavailable?.();
      return;
    }
    if (open) {
      setOpen(false);
      return;
    }
    if (currentUrl) {
      setOpen(true);
      return;
    }
    if (!getShareUrl) {
      onUnavailable?.();
      return;
    }

    setLoadingUrl(true);
    setError(null);
    try {
      const nextUrl = await getShareUrl();
      if (!nextUrl) {
        onUnavailable?.();
        return;
      }
      setResolvedUrl(nextUrl);
      setOpen(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not prepare QR — try copying the URL instead.",
      );
      onUnavailable?.();
    } finally {
      setLoadingUrl(false);
    }
  }, [
    currentUrl,
    disabled,
    getShareUrl,
    loadingUrl,
    onUnavailable,
    open,
  ]);

  // Resolve the panel position. We prefer right-anchored (panel's right
  // edge aligned to the toggle's right edge) so the panel hangs to the
  // left and stays inside the viewport on the common case. If that would
  // push the panel past the left edge (toggle is near the right edge of
  // a narrow screen), flip to left-anchored.
  //
  // The panel is rendered for the full lifetime of `open` (not gated on
  // `anchor !== null`) so the canvas inside it mounts immediately. If we
  // late-mounted the panel after anchor lands, the first-click QR-render
  // effect would early-return on a null canvasRef and never re-fire,
  // leaving the first-open in a blank state — the second open then
  // happened to find a stale anchor from the previous open and "magically
  // worked." The opacity-0 + pointer-events-none cloak below avoids
  // flashing an unpositioned panel for one frame.
  const positioned = anchor !== null && typeof window !== "undefined";
  let panelStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: PANEL_WIDTH,
    zIndex: 60,
    opacity: 0,
    pointerEvents: "none",
  };
  if (positioned && anchor) {
    const viewportWidth = window.innerWidth;
    let panelLeft = anchor.right - PANEL_WIDTH;
    if (panelLeft < 8) {
      panelLeft = Math.min(anchor.left, viewportWidth - PANEL_WIDTH - 8);
    }
    panelStyle = {
      position: "fixed",
      top: anchor.bottom + PANEL_GAP,
      left: Math.max(8, panelLeft),
      width: PANEL_WIDTH,
      zIndex: 60,
      opacity: 1,
      pointerEvents: "auto",
    };
  }

  const panel = open && (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Share QR code"
      data-testid="share-qr-popover"
      style={panelStyle}
      className="rounded-2xl border border-border-default bg-surface p-3 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-text-primary">Scan to open</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close QR code"
          className="text-text-tertiary transition-colors hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex justify-center rounded-xl bg-white p-2">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`QR code for ${currentUrl}`}
          data-testid="share-qr-canvas"
          className="max-w-full"
        />
      </div>
      <p
        className="mt-2 break-all text-[10px] leading-tight text-text-tertiary"
        title={currentUrl}
      >
        {currentUrl}
      </p>
      <button
        type="button"
        onClick={handleDownload}
        data-testid="share-qr-download"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-text-inverse transition-colors hover:bg-accent-hover"
      >
        <Download className="h-3.5 w-3.5" /> Download PNG
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[10px] text-error">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <span className={cn("inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={nativeDisabled}
        aria-disabled={unavailable || loadingUrl ? true : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        data-testid="share-qr-toggle"
        title={
          currentUrl || getShareUrl
            ? label
            : "Publish to generate a share QR"
        }
        className={cn(
          "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
          unavailable || loadingUrl
            ? "bg-surface-container-high text-text-tertiary cursor-not-allowed"
            : "bg-surface-container-high text-text-primary hover:bg-surface-container-highest",
        )}
      >
        <QrCode className="h-3.5 w-3.5" /> {loadingUrl ? "QR..." : "QR"}
      </button>
      {panel && portalTarget ? createPortal(panel, portalTarget) : null}
    </span>
  );
}
