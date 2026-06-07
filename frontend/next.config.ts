import { fileURLToPath } from "node:url";
import path from "node:path";
import type { NextConfig } from "next";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

// F-010 (audit 2026-04-10): hardened response headers for the Next.js frontend.
// Covers the same OWASP A05 baseline as the Go API's SecurityHeaders middleware
// (backend/internal/middleware/security_headers.go).
//
// F-098 (audit 2026-05-30): the Content-Security-Policy is now emitted PER
// REQUEST with a fresh nonce by frontend/src/middleware.ts (which calls
// buildCsp({ isDev, nonce, apiOrigin }) from src/lib/csp.ts). It is intentionally
// NOT listed here: a header configured in next.config.ts is computed once and
// cannot carry a per-request nonce, and a second static CSP would intersect with
// the nonced one in the browser and break 'strict-dynamic' script loading. The
// middleware matcher covers every HTML route; generated assets and public
// static files with extensions do not execute inline scripts, so they need no
// CSP.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "CDN-Cache-Control", value: "no-transform" },
  { key: "Cloudflare-CDN-Cache-Control", value: "no-transform" },
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
];

function apiRewriteBase() {
  return process.env.INTERNAL_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
}

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
    // format the visitor's browser can decode while keeping compatibility
    // with every browser we target.
    formats: ["image/avif", "image/webp"],
    // Keep public-page image variants on the default optimizer quality.
    qualities: [75],
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
    const apiBase = apiRewriteBase();
    return [
      {
        source: "/auth/:path*",
        destination: `${apiBase}/auth/:path*`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/api/v1/:path*`,
      },
      {
        source: "/onboarding/:path*",
        destination: `${apiBase}/onboarding/:path*`,
      },
      {
        source: "/workspace/:path*",
        destination: `${apiBase}/workspace/:path*`,
      },
      {
        source: "/health",
        destination: `${apiBase}/health`,
      },
    ];
  },
};

export default nextConfig;
