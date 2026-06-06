"use client";

// product-preview.tsx — M14 GAL-FR-156: gallery product preview UI.
//
// Shows a single gallery product (digital download, print, album, or
// bundle) with inline controls for print sizing + DPI quality feedback
// and an add-to-cart button. The component is self-contained: parent
// provides the product + source asset dimensions, and the component
// calls the commerce API directly for preflight and cart operations.
//
// Print size presets are a common subset of Indian-market sizes; studios
// can override via the `sizes` prop. DPI feedback is server-computed
// (not approximated client-side) so the quality classification matches
// the backend print_preflight service exactly.

import { useCallback, useEffect, useState } from "react";
import {
  evaluatePrintPreflight,
  formatPaisa,
  productTypeLabel,
  upsertPublicCart,
  type GalleryProduct,
  type PrintPreflightResult,
} from "@/lib/api/commerce";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { CheckCircle, XCircle, InfoCircle } from "@/components/icons";

// Indian wedding photography standard print sizes (inches).
const DEFAULT_PRINT_SIZES: PrintSize[] = [
  { label: "4×6", widthIn: 4, heightIn: 6 },
  { label: "5×7", widthIn: 5, heightIn: 7 },
  { label: "8×10", widthIn: 8, heightIn: 10 },
  { label: "11×14", widthIn: 11, heightIn: 14 },
  { label: "16×20", widthIn: 16, heightIn: 20 },
];

interface PrintSize {
  label: string;
  widthIn: number;
  heightIn: number;
}

interface ProductPreviewProps {
  /** The product to display. */
  product: GalleryProduct;
  /** Public gallery slug for the cart API call. */
  slug: string;
  /** Optional workspace subdomain scope for business-subdomain public URLs. */
  workspaceScope?: string | null;
  /** Optional first-touch share token for stale workspace-scope recovery. */
  shareToken?: string | null;
  /** Optional durable gallery session minted by password/share access. */
  gallerySessionToken?: string | null;
  /** Source image dimensions so DPI preflight can classify print quality. */
  sourceWidthPx?: number;
  sourceHeightPx?: number;
  /** Client email for persistent cart keying. */
  clientEmail?: string;
  /** Owner preview renders the card but must not write public cart state. */
  previewMode?: boolean;
  /** Override the default print size presets. */
  sizes?: PrintSize[];
  /** Called when the product is successfully added to the cart. */
  onAddedToCart?: () => void;
}

export function ProductPreview({
  product,
  slug,
  workspaceScope,
  shareToken,
  gallerySessionToken,
  sourceWidthPx,
  sourceHeightPx,
  clientEmail,
  previewMode = false,
  sizes = DEFAULT_PRINT_SIZES,
  onAddedToCart,
}: ProductPreviewProps) {
  const [selectedSize, setSelectedSize] = useState<PrintSize>(sizes[0]);
  const [quantity, setQuantity] = useState(1);
  const [preflight, setPreflight] = useState<PrintPreflightResult | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [addingToCart, setAddingToCart] = useState(false);
  const [addSuccess, setAddSuccess] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const isPrintProduct =
    product.product_type === "print" || product.product_type === "album";
  const canPreflight =
    isPrintProduct &&
    sourceWidthPx &&
    sourceHeightPx &&
    sourceWidthPx > 0 &&
    sourceHeightPx > 0;

  // Signature of the inputs that drive a preflight call. When it changes we
  // either need a fresh preflight (canPreflight) or must drop any stale one
  // (cannot preflight). Computing a string lets the adjust-during-render below
  // react to ALL input changes the way the old effect's synchronous
  // setPreflightError(null) / setPreflight(null) did — same timing, but
  // committed in-render instead of as a cascading post-effect setState.
  const preflightInputKey = canPreflight
    ? `${sourceWidthPx}x${sourceHeightPx}@${selectedSize.widthIn}x${selectedSize.heightIn}`
    : "";

  // Optimistically reset preflight result + error the moment the inputs change
  // (mirrors the original effect-start clears): when we can preflight, the
  // error is cleared while the new result is in flight; when we can't, the
  // stale result is dropped so the add-to-cart guard never sees it.
  const [lastPreflightInputKey, setLastPreflightInputKey] =
    useState(preflightInputKey);
  if (lastPreflightInputKey !== preflightInputKey) {
    setLastPreflightInputKey(preflightInputKey);
    setPreflightError(null);
    if (!canPreflight) {
      setPreflight(null);
    }
  }

  // Re-run preflight whenever the selected size or source dimensions change.
  // Guarded so the effect only synchronizes with the backend when a preflight
  // is actually possible; the optimistic clearing lives in the render-time
  // adjust above, keeping this effect free of synchronous setState.
  useEffect(() => {
    if (!canPreflight) return;
    let cancelled = false;
    evaluatePrintPreflight({
      source_width_px: sourceWidthPx!,
      source_height_px: sourceHeightPx!,
      print_width_in: selectedSize.widthIn,
      print_height_in: selectedSize.heightIn,
    })
      .then((result) => {
        if (!cancelled) setPreflight(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreflightError(
            err instanceof Error ? err.message : "preflight failed",
          );
          setPreflight(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canPreflight, selectedSize, sourceWidthPx, sourceHeightPx]);

  const handleAddToCart = useCallback(async () => {
    if (previewMode) {
      setAddError("Cart is disabled in owner preview.");
      return;
    }
    if (!clientEmail) {
      setAddError("enter your email to save your cart");
      return;
    }
    setAddingToCart(true);
    setAddError(null);
    setAddSuccess(false);
    try {
      const customization: Record<string, unknown> = { quantity };
      if (isPrintProduct) {
        customization.print_size = selectedSize.label;
        customization.print_width_in = selectedSize.widthIn;
        customization.print_height_in = selectedSize.heightIn;
      }
      const items = [{ product_id: product.id, quantity, customization }];
      if (workspaceScope || shareToken || gallerySessionToken) {
        await upsertPublicCart(
          slug,
          clientEmail,
          items,
          undefined,
          workspaceScope,
          shareToken,
          gallerySessionToken,
        );
      } else {
        await upsertPublicCart(slug, clientEmail, items);
      }
      setAddSuccess(true);
      onAddedToCart?.();
      // Auto-dismiss the success state after a few seconds so the user
      // can add another product without confusion.
      setTimeout(() => setAddSuccess(false), 3000);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "failed to add to cart");
    } finally {
      setAddingToCart(false);
    }
  }, [
    clientEmail,
    gallerySessionToken,
    isPrintProduct,
    onAddedToCart,
    previewMode,
    product.id,
    quantity,
    selectedSize,
    shareToken,
    slug,
    workspaceScope,
  ]);

  const totalPrice = product.price_amount * quantity;

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5 glass-blur-full border border-text-media/10">
      {/* Header: type badge + name */}
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-text-secondary">
          {productTypeLabel(product.product_type)}
        </div>
        <h3 className="text-xl font-semibold">{product.name}</h3>
        {product.description ? (
          <p className="text-sm text-text-secondary">{product.description}</p>
        ) : null}
      </header>

      {/* Print size selector — only for print/album products */}
      {isPrintProduct ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-text-secondary">
            Print size
          </label>
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Print size"
          >
            {sizes.map((size) => {
              const active = size.label === selectedSize.label;
              return (
                <button
                  key={size.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedSize(size)}
                  className={[
                    "touch-min min-w-[60px] rounded-xl px-4 py-2 text-sm font-medium",
                    "border transition-all duration-200",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "bg-accent/20 border-accent text-accent-primary shadow-md"
                      : "bg-surface-overlay/5 border-text-media/10 hover:bg-surface-overlay/10",
                  ].join(" ")}
                >
                  {size.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* DPI quality feedback — only when a preflight result is available */}
      {canPreflight ? (
        <DPIQualityBadge result={preflight} error={preflightError} />
      ) : null}

      {/* Quantity stepper */}
      <div className="flex items-center justify-between gap-4">
        <label className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          Quantity
        </label>
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label="Quantity"
        >
          <GlassIconButton
            size="sm"
            variant="glass"
            label="Decrease quantity"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
          >
            <span aria-hidden>−</span>
          </GlassIconButton>
          <span
            className="min-w-[2.5rem] text-center text-base font-medium tabular-nums"
            aria-live="polite"
          >
            {quantity}
          </span>
          <GlassIconButton
            size="sm"
            variant="glass"
            label="Increase quantity"
            onClick={() => setQuantity((q) => q + 1)}
          >
            <span aria-hidden>+</span>
          </GlassIconButton>
        </div>
      </div>

      {/* Price + add to cart */}
      <footer className="flex items-center justify-between border-t border-text-media/10 pt-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-text-secondary">
            Total
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatPaisa(totalPrice, product.price_currency)}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={
            addingToCart ||
            previewMode ||
            (preflight?.quality === "fail" && isPrintProduct)
          }
          className={[
            "touch-min rounded-xl px-5 py-2 text-sm font-semibold",
            "bg-accent text-text-inverse shadow-md transition-all duration-200",
            "hover:brightness-110 hover:shadow-lg",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          {previewMode
            ? "Preview only"
            : addingToCart
              ? "Adding…"
              : addSuccess
                ? "Added ✓"
                : "Add to cart"}
        </button>
      </footer>

      {addError ? (
        <p role="alert" className="text-sm text-feedback-error">
          {addError}
        </p>
      ) : null}
    </div>
  );
}

// DPIQualityBadge renders the print preflight classification with a
// color + icon cue. Fail is highlighted strongly because it blocks
// the add-to-cart button; lower tiers are advisory.
function DPIQualityBadge({
  result,
  error,
}: {
  result: PrintPreflightResult | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div
        className="flex items-start gap-2 text-xs text-feedback-warning"
        role="status"
      >
        <InfoCircle />
        <span>Print quality check unavailable: {error}</span>
      </div>
    );
  }
  if (!result) {
    return (
      <div
        className="flex items-center gap-2 text-xs text-text-secondary"
        role="status"
      >
        <InfoCircle />
        <span>Checking print quality…</span>
      </div>
    );
  }

  const palette = qualityPalette(result.quality);
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border p-3 ${palette.container}`}
    >
      <div className="flex items-start gap-2">
        <span className={palette.icon}>
          {result.quality === "fail" ? (
            <XCircle />
          ) : result.quality === "warning" ? (
            <InfoCircle />
          ) : (
            <CheckCircle />
          )}
        </span>
        <div className="flex-1 space-y-1">
          <div className={`text-xs font-semibold uppercase ${palette.label}`}>
            {result.quality} — {result.effective_dpi} DPI
          </div>
          <p className="text-xs text-text-secondary">{result.message}</p>
          {result.shortfall ? (
            <p className="text-xs text-text-secondary">
              Recommended source: {result.required_width_px}×
              {result.required_height_px}px
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// qualityPalette maps a backend quality level to theme-token-friendly
// classes. All classes are utility-token-backed (no raw hex values), so
// the component adapts to liquid-glass / liquid-glass-dark / midnight.
function qualityPalette(quality: PrintPreflightResult["quality"]): {
  container: string;
  icon: string;
  label: string;
} {
  switch (quality) {
    case "excellent":
    case "good":
      return {
        container: "bg-feedback-success/10 border-feedback-success/30",
        icon: "text-feedback-success",
        label: "text-feedback-success",
      };
    case "acceptable":
      return {
        container: "bg-info/10 border-info/30",
        icon: "text-info",
        label: "text-info",
      };
    case "warning":
      return {
        container: "bg-feedback-warning/10 border-feedback-warning/30",
        icon: "text-feedback-warning",
        label: "text-feedback-warning",
      };
    case "fail":
      return {
        container: "bg-feedback-error/10 border-feedback-error/40",
        icon: "text-feedback-error",
        label: "text-feedback-error",
      };
  }
}
