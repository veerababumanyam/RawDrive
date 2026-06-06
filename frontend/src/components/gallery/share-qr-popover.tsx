"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import QRCodeLib from "qrcode";
import { cn } from "@/lib/utils";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { Download, QrCode, XMark } from "@/components/icons";

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
        <GlassIconButton
          type="button"
          onClick={() => setOpen(false)}
          label="Close QR code"
          size="sm"
          variant="ghost"
        >
          <XMark className="h-4 w-4" aria-hidden="true" />
        </GlassIconButton>
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
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2 text-xs font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Download className="h-4 w-4" aria-hidden="true" /> Download PNG
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
      <GlassIconButton
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={nativeDisabled}
        aria-disabled={unavailable || loadingUrl ? true : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        data-testid="share-qr-toggle"
        label={label}
        size="md"
        variant="glass"
        active={open}
        className={cn(
          unavailable || loadingUrl ? "cursor-not-allowed opacity-50" : null,
        )}
      >
        <QrCode className="h-5 w-5" aria-hidden="true" />
      </GlassIconButton>
      {panel && portalTarget ? createPortal(panel, portalTarget) : null}
    </span>
  );
}
