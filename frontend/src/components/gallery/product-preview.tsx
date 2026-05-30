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
  /** Source image dimensions so DPI preflight can classify print quality. */
  sourceWidthPx?: number;
  sourceHeightPx?: number;
  /** Client email for persistent cart keying. */
  clientEmail?: string;
  /** Override the default print size presets. */
  sizes?: PrintSize[];
  /** Called when the product is successfully added to the cart. */
  onAddedToCart?: () => void;
}

export function ProductPreview({
  product,
  slug,
  sourceWidthPx,
  sourceHeightPx,
  clientEmail,
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

  const isPrintProduct = product.product_type === "print" || product.product_type === "album";
  const canPreflight =
    isPrintProduct && sourceWidthPx && sourceHeightPx && sourceWidthPx > 0 && sourceHeightPx > 0;

  // Re-run preflight whenever the selected size or source dimensions change.
  useEffect(() => {
    if (!canPreflight) {
      setPreflight(null);
      return;
    }
    let cancelled = false;
    setPreflightError(null);
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
          setPreflightError(err instanceof Error ? err.message : "preflight failed");
          setPreflight(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canPreflight, selectedSize, sourceWidthPx, sourceHeightPx]);

  const handleAddToCart = useCallback(async () => {
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
      await upsertPublicCart(slug, clientEmail, [
        { product_id: product.id, quantity, customization },
      ]);
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
  }, [clientEmail, isPrintProduct, onAddedToCart, product.id, quantity, selectedSize, slug]);

  const totalPrice = product.price_amount * quantity;

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5 backdrop-blur-xl border border-white/10">
      {/* Header: type badge + name */}
      <header className="space-y-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {productTypeLabel(product.product_type)}
        </div>
        <h3 className="text-xl font-semibold">{product.name}</h3>
        {product.description ? (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        ) : null}
      </header>

      {/* Print size selector — only for print/album products */}
      {isPrintProduct ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Print size
          </label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Print size">
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
                    "min-h-[44px] min-w-[60px] rounded-xl px-4 py-2 text-sm font-medium",
                    "border transition-all duration-200",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "bg-accent/20 border-accent text-accent-foreground shadow-md"
                      : "bg-white/5 border-white/10 hover:bg-white/10",
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
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Quantity
        </label>
        <div className="flex items-center gap-2" role="group" aria-label="Quantity">
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
      <footer className="flex items-center justify-between border-t border-white/10 pt-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="text-2xl font-semibold tabular-nums">
            {formatPaisa(totalPrice, product.price_currency)}
          </div>
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={addingToCart || (preflight?.quality === "fail" && isPrintProduct)}
          className={[
            "min-h-[44px] rounded-xl px-5 py-2 text-sm font-semibold",
            "bg-accent text-accent-foreground shadow-md transition-all duration-200",
            "hover:brightness-110 hover:shadow-lg",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "disabled:cursor-not-allowed disabled:opacity-50",
          ].join(" ")}
        >
          {addingToCart ? "Adding…" : addSuccess ? "Added ✓" : "Add to cart"}
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
      <div className="flex items-start gap-2 text-xs text-feedback-warning" role="status">
        <InfoCircle />
        <span>Print quality check unavailable: {error}</span>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
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
          <p className="text-xs text-muted-foreground">{result.message}</p>
          {result.shortfall ? (
            <p className="text-xs text-muted-foreground">
              Recommended source: {result.required_width_px}×{result.required_height_px}px
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
