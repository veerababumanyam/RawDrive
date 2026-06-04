"use client";

// public-gallery-products.tsx — renders the product catalog section on
// the public gallery page. Thin client wrapper around ProductPreview that
// shares a single clientEmail state across all product cards so the
// visitor only has to enter their email once to build a cart.
//
// Print products are rendered without DPI preflight here because we
// don't know which asset the visitor intends to print at gallery level.
// The per-photo preflight will fire once ProductPreview is also
// instantiated inside the asset viewer lightbox (tracked separately).

import { useState } from "react";
import dynamic from "next/dynamic";
import type { GalleryProduct } from "@/lib/api/commerce";

// PERF-SPLIT: the product catalog only renders when a gallery actually has
// products (the section early-returns null otherwise). ProductPreview is a
// ~430-line commerce card (cart state, Razorpay checkout, DPI preflight), so
// load it in an async chunk instead of the public gallery's first-load JS.
// ssr:false is safe — it is a "use client" interactive card that keys the
// cart by client email and never renders on the server.
const ProductPreview = dynamic(
  () =>
    import("@/components/gallery/product-preview").then((m) => m.ProductPreview),
  {
    ssr: false,
    loading: () => (
      <div
        className="aspect-[4/3] w-full animate-pulse rounded-2xl border border-border-subtle bg-surface-sunken"
        aria-busy="true"
        aria-label="Loading product"
      />
    ),
  },
);

interface PublicGalleryProductsProps {
  slug: string;
  workspaceScope?: string | null;
  shareToken?: string | null;
  gallerySessionToken?: string | null;
  products: GalleryProduct[];
}

export function PublicGalleryProducts({
  slug,
  workspaceScope,
  shareToken,
  gallerySessionToken,
  products,
}: PublicGalleryProductsProps) {
  const [clientEmail, setClientEmail] = useState("");

  if (products.length === 0) {
    return null;
  }

  return (
    <section
      className="max-w-6xl mx-auto px-4 pb-16 space-y-6"
      aria-labelledby="products-heading"
    >
      <header className="space-y-2">
        <h2
          id="products-heading"
          className="text-2xl font-semibold text-text-primary"
        >
          Available products
        </h2>
        <p className="text-sm text-text-secondary max-w-2xl">
          Digital downloads, prints, and albums from this gallery. Add items to
          your cart and check out when you&apos;re ready.
        </p>
      </header>

      {/* Shared email field — ProductPreview keys the public cart by this
          address so a visitor can add multiple products in one session. */}
      <label className="block max-w-md">
        <span className="block text-xs font-medium uppercase tracking-wide text-text-secondary mb-1">
          Your email (to save your cart)
        </span>
        <input
          type="email"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="w-full touch-min rounded-xl px-4 py-2 bg-surface-overlay/5 border border-text-media/10 text-text-primary placeholder-text-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {products.map((product) => (
          <ProductPreview
            key={product.id}
            product={product}
            slug={slug}
            workspaceScope={workspaceScope}
            shareToken={shareToken}
            gallerySessionToken={gallerySessionToken}
            clientEmail={clientEmail || undefined}
          />
        ))}
      </div>
    </section>
  );
}
