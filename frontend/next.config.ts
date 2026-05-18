import { fileURLToPath } from "node:url";
import path from "node:path";
import type { NextConfig } from "next";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

// F-010 (audit 2026-04-10): hardened response headers for the Next.js frontend.
// Covers the same OWASP A05 baseline as the Go API's SecurityHeaders middleware
// (backend/internal/middleware/security_headers.go). Next.js needs a SLIGHTLY
// more permissive CSP than the API because it ships HTML with hydration
// scripts — 'unsafe-inline' on script-src is required for Next's runtime
// inline bootstrap until we wire a nonce-based CSP in a follow-up.
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
const apiOrigin = apiUrl.startsWith("http://") ? ` ${apiUrl}` : "";
const devConnectExtras = isDev ? " http://localhost:* ws://localhost:*" : apiOrigin;
const devImgExtras = isDev ? " http://localhost:*" : "";

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
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Inline scripts remain until nonce-based CSP lands; unsafe-eval is dev-only.
      // checkout.razorpay.com — Razorpay Checkout SDK (loaded by /settings/plans
      // and /onboarding to open the payment modal). Without it the script tag
      // gets blocked by CSP and the polling loop in those pages throws
      // "Razorpay script timeout" after 8s. Added 2026-05-18.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:" + devImgExtras,
      // connect-src must include the API origin for same-origin fetches
      // through rewrites() plus any R2 public buckets the client talks to.
      // Dev adds localhost:* so cross-origin dev fetches to the Go API work.
      // Razorpay Checkout makes XHRs to api.razorpay.com and lumberjack
      // (analytics) — the existing `https:` token already covers them.
      "connect-src 'self' https:" + devConnectExtras,
      "font-src 'self' data: https://fonts.gstatic.com",
      // Razorpay Checkout opens its payment UI in iframes pointing to
      // api.razorpay.com / checkout.razorpay.com. Without an explicit
      // frame-src the directive falls back to default-src 'self' and the
      // iframe gets blocked, causing the modal to render blank.
      "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
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
