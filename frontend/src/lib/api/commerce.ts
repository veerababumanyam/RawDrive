// commerce.ts — M14 gallery commerce API client (products, cart, preflight).
//
// The backend exposes two surfaces:
//   - Studio-authenticated:    /api/v1/galleries/{id}/products + cart + banners
//   - Anonymous public client: /api/v1/public/galleries/{slug}/cart + banners
//
// This client wraps both. Callers in the dashboard use the {id}-addressed
// variants with a JWT; public gallery pages use the {slug}-addressed
// variants without auth.

import { getApiBaseUrl } from "@/lib/api/base-url";

const apiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

// ─── Types ───────────────────────────────────────────────────────────

export type ProductType = "digital" | "print" | "album" | "bundle";

export interface GalleryProduct {
  id: string;
  gallery_id: string;
  workspace_id: string;
  name: string;
  description?: string;
  product_type: ProductType;
  price_amount: number; // paise — always integer
  price_currency: string; // "INR"
  asset_id?: string | null;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CartItemInput {
  product_id: string;
  quantity: number;
  customization?: Record<string, unknown>;
}

export interface CartItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface GalleryCart {
  id: string;
  gallery_id: string;
  client_email: string;
  items: CartItem[];
  coupon_code?: string;
  subtotal: number;
  discount: number;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface PrintPreflightRequest {
  source_width_px: number;
  source_height_px: number;
  print_width_in: number;
  print_height_in: number;
}

export interface PrintPreflightResult {
  width_dpi: number;
  height_dpi: number;
  effective_dpi: number;
  quality: "excellent" | "good" | "acceptable" | "warning" | "fail";
  message: string;
  required_width_px: number;
  required_height_px: number;
  shortfall: boolean;
}

export interface GalleryBanner {
  id: string;
  gallery_id: string;
  title: string;
  body?: string;
  cta_label?: string;
  cta_url?: string;
  coupon_code?: string;
  background_color?: string;
  text_color?: string;
  active_from?: string | null;
  active_until?: string | null;
  is_active: boolean;
}

// ─── Studio (JWT) routes ─────────────────────────────────────────────

export async function listProducts(token: string, galleryId: string): Promise<GalleryProduct[]> {
  const res = await fetch(apiUrl(`/api/v1/galleries/${galleryId}/products`), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`list products: ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.galleryproducts)) return body.galleryproducts;
  return [];
}

export async function createProduct(
  token: string,
  galleryId: string,
  input: Partial<GalleryProduct>,
): Promise<GalleryProduct> {
  const res = await fetch(apiUrl(`/api/v1/galleries/${galleryId}/products`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`create product: ${res.status}`);
  return res.json();
}

export async function updateProduct(
  token: string,
  galleryId: string,
  productId: string,
  input: Partial<GalleryProduct>,
): Promise<GalleryProduct> {
  const res = await fetch(apiUrl(`/api/v1/galleries/${galleryId}/products/${productId}`), {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`update product: ${res.status}`);
  return res.json();
}

export async function deleteProduct(
  token: string,
  galleryId: string,
  productId: string,
): Promise<void> {
  const res = await fetch(apiUrl(`/api/v1/galleries/${galleryId}/products/${productId}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`delete product: ${res.status}`);
}

// ─── Public (slug) routes ────────────────────────────────────────────

export async function upsertPublicCart(
  slug: string,
  clientEmail: string,
  items: CartItemInput[],
  couponCode?: string,
): Promise<GalleryCart> {
  const res = await fetch(apiUrl(`/api/v1/public/galleries/${slug}/cart`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_email: clientEmail,
      items,
      coupon_code: couponCode,
    }),
  });
  if (!res.ok) throw new Error(`upsert cart: ${res.status}`);
  return res.json();
}

export async function getPublicCart(slug: string, clientEmail: string): Promise<GalleryCart | null> {
  const res = await fetch(
    apiUrl(`/api/v1/public/galleries/${slug}/cart?email=${encodeURIComponent(clientEmail)}`),
  );
  if (!res.ok) return null;
  const cart = await res.json();
  // Empty cart is returned as { items: [] } — detect and bubble up as null.
  if (!cart || !cart.items || cart.items.length === 0) return null;
  return cart;
}

export async function clearPublicCart(slug: string, clientEmail: string): Promise<void> {
  await fetch(
    apiUrl(`/api/v1/public/galleries/${slug}/cart?email=${encodeURIComponent(clientEmail)}`),
    { method: "DELETE" },
  );
}

export async function listPublicBanners(slug: string): Promise<GalleryBanner[]> {
  const res = await fetch(apiUrl(`/api/v1/public/galleries/${slug}/banners`));
  if (!res.ok) return [];
  const body = await res.json();
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.gallerybanners)) return body.gallerybanners;
  return [];
}

// listPublicProducts returns the active product catalog for a public
// gallery slug. Empty array on 404/error so the public page can render
// without products gracefully (many galleries don't sell anything).
export async function listPublicProducts(slug: string): Promise<GalleryProduct[]> {
  const res = await fetch(apiUrl(`/api/v1/public/galleries/${slug}/products`));
  if (!res.ok) return [];
  const products = (await res.json()) as GalleryProduct[] | null;
  return Array.isArray(products) ? products.filter((p) => p.is_active) : [];
}

// trackGalleryEvent posts an anonymous telemetry event for a public
// gallery. Fire-and-forget — the promise resolves to a boolean so
// callers can log failures in dev, but a rejection here must never
// break the surrounding render (analytics is best-effort).
export type PublicGalleryEventType = "banner_impression" | "banner_click" | "product_view";

export async function trackGalleryEvent(
  slug: string,
  eventType: PublicGalleryEventType,
  metadata?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/v1/public/galleries/${slug}/events`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: eventType, metadata }),
      // `keepalive` lets the request survive a page unload — important
      // for banner_click events that fire immediately before navigation.
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Commerce helpers (no auth) ──────────────────────────────────────

export async function evaluatePrintPreflight(
  req: PrintPreflightRequest,
  targetDpi = 300,
): Promise<PrintPreflightResult> {
  const res = await fetch(
    apiUrl(`/api/v1/commerce/print-preflight?target_dpi=${targetDpi}`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    },
  );
  if (!res.ok) throw new Error(`print preflight: ${res.status}`);
  return res.json();
}

// ─── Formatting helpers ──────────────────────────────────────────────

/**
 * Format a paisa amount as a localized currency string.
 * e.g. 250000 → "₹2,500"
 */
export function formatPaisa(amount: number, currency = "INR"): string {
  const rupees = amount / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(rupees);
}

/**
 * Human-readable product type label for UI.
 */
export function productTypeLabel(type: ProductType): string {
  switch (type) {
    case "digital":
      return "Digital Download";
    case "print":
      return "Print";
    case "album":
      return "Album";
    case "bundle":
      return "Bundle";
  }
}
