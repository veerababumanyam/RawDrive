import { fileURLToPath } from "node:url";
import path from "node:path";
import type { NextConfig } from "next";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

// F-010 (audit 2026-04-10): hardened response headers for the Next.js frontend.
// Covers the same OWASP A05 baseline as the Go API's SecurityHeaders middleware
// (backend/internal/middleware/security_headers.go).
//
// F-098 (audit 2026-05-30): the script-src directive is built by buildCsp()
// below so the policy lives in ONE typed place and the nonce-based hardening
// can be flipped on from a single switch. See the buildCsp doc comment for why
// the static next.config.ts header still falls back to 'unsafe-inline' and what
// the follow-up needs.
//
// DEV CARVE-OUT (cobolt-fix 2026-04-11): 49 client-side files fall back to
// `http://localhost:8080` when NEXT_PUBLIC_API_URL is unset and fetch the
// backend cross-origin (not through the rewrites() proxy below). The hardened
// prod CSP `connect-src 'self' https:` blocks that because localhost:8080 is
// neither same-origin nor HTTPS, which manifested as "Could not load state
// list" on /register and prevented Google sign-in from /login. In dev we add
// http://localhost:* and ws://localhost:* (the WS is for Next.js HMR). In
// production NEXT_PUBLIC_API_URL is set to an HTTPS URL which the existing
// `https:` token already covers, so this carve-out has zero prod impact.
const isDev = process.env.NODE_ENV !== "production";
// When NEXT_PUBLIC_API_URL is an HTTP URL (e.g. Docker dev with localhost:8080),
// include it explicitly so the CSP connect-src allows it even in production builds.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const apiOrigin = apiUrl.startsWith("http://") ? apiUrl : "";

export interface CspOptions {
  /** True for `next dev` — adds 'unsafe-eval' + localhost carve-outs. */
  isDev: boolean;
  /**
   * Per-request nonce. When supplied, script-src drops 'unsafe-inline' and
   * uses `'nonce-<value>' 'strict-dynamic'` instead — the F-098 fix. The
   * static next.config.ts header path CANNOT supply a nonce (headers are
   * computed once at build/boot, not per request), so it omits this and keeps
   * the documented 'unsafe-inline' fallback. A middleware that runs per request
   * (frontend/src/middleware.ts) is the only place that can pass it.
   */
  nonce?: string;
  /** Extra HTTP API origin to allow in connect-src (Docker dev fallback). */
  apiOrigin?: string;
}

/**
 * Build the Content-Security-Policy header value.
 *
 * F-098 — "Production CSP carries 'unsafe-inline' in script-src": the ONLY way
 * to safely drop 'unsafe-inline' from script-src (Next.js ships inline
 * hydration/bootstrap scripts that would otherwise be blocked, white-screening
 * the app) is a per-request nonce. This builder makes that a one-flag switch:
 *
 *   - nonce present  → `script-src 'self' 'nonce-<n>' 'strict-dynamic' blob:
 *                       https://checkout.razorpay.com`  (NO 'unsafe-inline')
 *   - nonce absent   → `script-src 'self' 'unsafe-inline' blob:
 *                       https://checkout.razorpay.com`  (static-header fallback)
 *
 * 'strict-dynamic' lets a nonced script load further scripts (Razorpay's SDK
 * pulls additional bundles) without enumerating every origin, while ignoring
 * host-source allowlists in CSP3-capable browsers — which is exactly the
 * hardened posture the finding asks for.
 *
 * Other directives keep their existing, separately-justified sources:
 *   - checkout.razorpay.com (script + frame): Razorpay Checkout SDK + modal.
 *   - youtube / youtube-nocookie / vimeo (frame): embedded-videos panel.
 *   - style-src 'unsafe-inline': required by Tailwind v4 + inline styles; NOT
 *     in scope for F-098 (the finding is script-src only) and styles cannot
 *     execute, so it is a far weaker concern.
 */
export function buildCsp({ isDev, nonce, apiOrigin }: CspOptions): string {
  const scriptSrcTokens = ["'self'"];
  if (nonce) {
    // Hardened path: nonce + strict-dynamic, no 'unsafe-inline'.
    scriptSrcTokens.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  } else {
    // Static-header fallback: Next.js inline bootstrap needs 'unsafe-inline'
    // when no per-request nonce is available. Tracked by the F-098 follow-up.
    scriptSrcTokens.push("'unsafe-inline'");
  }
  scriptSrcTokens.push("blob:");
  if (isDev) {
    // unsafe-eval is dev-only (turbopack/react-refresh). 'strict-dynamic'
    // disables host allowlists in CSP3 browsers, so when a nonce is present we
    // must still allow eval explicitly in dev.
    scriptSrcTokens.push("'unsafe-eval'");
  }
  scriptSrcTokens.push("https://checkout.razorpay.com");

  const devConnectExtras = isDev
    ? " http://localhost:* ws://localhost:*"
    : apiOrigin
      ? ` ${apiOrigin}`
      : "";
  const devImgExtras = isDev ? " http://localhost:*" : "";

  return [
    "default-src 'self'",
    `script-src ${scriptSrcTokens.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:" + devImgExtras,
    // connect-src must include the API origin for same-origin fetches through
    // rewrites() plus any public buckets the client talks to. Dev adds
    // localhost:* so cross-origin dev fetches to the Go API work. Razorpay
    // Checkout makes XHRs to api.razorpay.com and lumberjack (analytics) — the
    // existing `https:` token already covers them.
    "connect-src 'self' https:" + devConnectExtras,
    "font-src 'self' data: https://fonts.gstatic.com",
    // Razorpay Checkout opens its payment UI in iframes pointing to
    // api.razorpay.com / checkout.razorpay.com. www.youtube.com /
    // youtube-nocookie.com / player.vimeo.com — the per-gallery embedded
    // videos panel (frontend/src/components/gallery/embedded-videos-panel.tsx)
    // renders YouTube and Vimeo iframes. Without these origins the browser
    // blocks the iframes silently. Added 2026-05-18/19.
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    // Permissions-Policy — F-010 baseline locks every powerful feature to
    // the empty allowlist `()` so neither this document nor any embedded
    // third-party iframe can use them. `camera` is the one exception: the
    // dashboard "Photo Search" page (/galleries/[id]/photo-search) calls
    // navigator.mediaDevices.getUserMedia({ video: true }) to capture a
    // face for cluster matching. With `camera=()` Chrome blocks that at
    // the document level BEFORE the permission prompt fires — surfacing
    // as "Permissions policy violation: camera is not allowed in this
    // document" in the console and a "Permission denied" DOMException at
    // the API. `(self)` keeps the OWASP A05 intent (deny third-party
    // iframes) while allowing the page's own origin to request the
    // camera. Microphone stays denied since no feature needs it.
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), " +
      "magnetometer=(), gyroscope=(), accelerometer=(), fullscreen=(self)",
  },
  {
    // F-098: static-header CSP. A header configured here cannot carry a
    // per-request nonce, so buildCsp() (no nonce) emits the 'unsafe-inline'
    // fallback. Removing 'unsafe-inline' for real requires the middleware
    // nonce wiring documented on buildCsp() — frontend/src/middleware.ts must
    // call buildCsp({ isDev, nonce, apiOrigin }) per request and this static
    // entry should then be removed so it stops overriding the nonced header.
    key: "Content-Security-Policy",
    value: buildCsp({ isDev, apiOrigin }),
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["host.docker.internal"],
  // Production bootstrap (2026-04-11): required for slim Docker image
  // under deploy/docker-compose.prod-app.yml. See docs/superpowers/specs/
  // 2026-04-11-hostinger-production-bootstrap-design.md §3.3.
  output: 'standalone',
  turbopack: {
    root: frontendRoot,
  },
  images: {
    // Q9 (landing redesign 2026-04-11): prefer AVIF, then WebP, then the
    // original source format. Next.js image optimizer serves the smallest
    // format the visitor's browser can decode. This materially improves
    // LCP on the landing hero (~180 KB AVIF vs ~800 KB source JPEG) while
    // keeping compatibility with every browser we target.
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        // Apply to every route served by Next.js.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/auth/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/auth/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/:path*`,
      },
      {
        source: "/onboarding/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/onboarding/:path*`,
      },
      {
        source: "/workspace/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/workspace/:path*`,
      },
      {
        source: "/health",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/health`,
      },
    ];
  },
};

export default nextConfig;
