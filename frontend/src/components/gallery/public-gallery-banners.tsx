"use client";

// public-gallery-banners.tsx — renders live sale banners at the top of
// a public gallery page. Banners are studio-configured marketing blocks
// with a title, body, optional CTA, and an active window; only banners
// inside their window are returned by /public/galleries/{slug}/banners.
//
// Each banner fires `banner_impression` on mount (once per banner per
// render) and `banner_click` on CTA activation. Tracking is best-effort
// via trackGalleryEvent — a failed telemetry POST must never break the
// banner UI or prevent navigation.

import { useEffect, useState } from "react";
import {
  listPublicBanners,
  trackGalleryEvent,
  type GalleryBanner,
} from "@/lib/api/commerce";

interface PublicGalleryBannersProps {
  slug: string;
  ws?: string | null;
  shareToken?: string | null;
  gallerySessionToken?: string | null;
  /** Optional server-fetched banners so SSR skips the client round trip. */
  initialBanners?: GalleryBanner[];
}

// isSafeUrl gates the studio-controlled banner CTA URL before it lands in
// an <a href>. A studio owner with banner-management access could otherwise
// set cta_url to a `javascript:` (or `data:`, `vbscript:`, …) URI and land
// stored XSS on every public visitor who clicks the CTA — `rel="noopener"`
// only severs window.opener, it does NOT block javascript: execution, and
// CSP `unsafe-inline` does not cover javascript: href activation.
//
// We allow only absolute http(s) URLs and site-relative paths. The URL
// constructor normalizes the input (stripping the leading/trailing
// whitespace and embedded control chars that browsers would otherwise
// ignore, so `\tjava\nscript:alert(1)` cannot sneak through) and we then
// assert the resolved protocol is http: or https:. Anything unparseable or
// non-http(s) — including protocol-relative `//evil` rewritten through the
// base, mailto:, tel:, data:, blob:, file: — is rejected.
function isSafeUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    // A non-URL base lets the parser resolve site-relative hrefs ("/sale",
    // "shop") while still surfacing the real scheme of absolute inputs.
    const base = "https://rawdrive.invalid/";
    const url = new URL(raw, base);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function PublicGalleryBanners({
  slug,
  ws,
  shareToken,
  gallerySessionToken,
  initialBanners,
}: PublicGalleryBannersProps) {
  const [banners, setBanners] = useState<GalleryBanner[]>(initialBanners ?? []);
  const [loaded, setLoaded] = useState<boolean>(Boolean(initialBanners));

  // Client-side fetch fallback for pages that didn't prefetch banners.
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    const request =
      ws || shareToken || gallerySessionToken
        ? listPublicBanners(slug, ws, shareToken, gallerySessionToken)
        : listPublicBanners(slug);
    request
      .then((result) => {
        if (!cancelled) {
          setBanners(result);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, ws, shareToken, gallerySessionToken, loaded]);

  if (banners.length === 0) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-4 space-y-3">
      {banners.map((banner) => (
        <BannerCard
          key={banner.id}
          slug={slug}
          ws={ws}
          shareToken={shareToken}
          gallerySessionToken={gallerySessionToken}
          banner={banner}
        />
      ))}
    </div>
  );
}

// BannerCard is kept internal so impression tracking can key off the
// banner id at the right lifecycle boundary. Splitting this out of the
// list component is what gives each banner its own `useEffect` — if we
// tracked inside the parent, impression events would double-fire on
// re-renders where only one banner changed.
function BannerCard({
  slug,
  ws,
  shareToken,
  gallerySessionToken,
  banner,
}: {
  slug: string;
  ws?: string | null;
  shareToken?: string | null;
  gallerySessionToken?: string | null;
  banner: GalleryBanner;
}) {
  useEffect(() => {
    // Fire-and-forget impression. We intentionally don't await; a
    // failed tracking POST cannot block the render, and React's
    // strict mode double-invocation in dev is acceptable here since
    // a handful of duplicate impressions in dev doesn't affect
    // production metrics.
    if (ws || shareToken || gallerySessionToken) {
      void trackGalleryEvent(
        slug,
        "banner_impression",
        { banner_id: banner.id },
        ws,
        shareToken,
        gallerySessionToken,
      );
    } else {
      void trackGalleryEvent(slug, "banner_impression", {
        banner_id: banner.id,
      });
    }
  }, [slug, ws, shareToken, gallerySessionToken, banner.id]);

  const handleClick = () => {
    if (ws || shareToken || gallerySessionToken) {
      void trackGalleryEvent(
        slug,
        "banner_click",
        { banner_id: banner.id },
        ws,
        shareToken,
        gallerySessionToken,
      );
    } else {
      void trackGalleryEvent(slug, "banner_click", { banner_id: banner.id });
    }
  };

  const style: React.CSSProperties = {};
  if (banner.background_color) style.background = banner.background_color;
  if (banner.text_color) style.color = banner.text_color;

  return (
    <div
      role="region"
      aria-label={banner.title}
      className="glass-card rounded-2xl p-5 border border-white/10 flex items-center justify-between gap-4"
      style={style}
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold truncate">{banner.title}</h3>
        {banner.body ? (
          <p className="text-sm opacity-90 mt-1 line-clamp-2">{banner.body}</p>
        ) : null}
        {banner.coupon_code ? (
          <p className="text-xs uppercase tracking-wide mt-2 opacity-80">
            Use code{" "}
            <span className="font-mono font-semibold">
              {banner.coupon_code}
            </span>
          </p>
        ) : null}
      </div>
      {banner.cta_url && banner.cta_label && isSafeUrl(banner.cta_url) ? (
        <a
          href={banner.cta_url}
          onClick={handleClick}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 min-h-[44px] rounded-xl px-5 py-2 text-sm font-semibold bg-accent text-text-inverse shadow-md hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {banner.cta_label}
        </a>
      ) : null}
    </div>
  );
}
