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
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), " +
      "magnetometer=(), gyroscope=(), accelerometer=(), fullscreen=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js hydration requires inline scripts until nonce-based CSP lands.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      // connect-src must include the API origin for same-origin fetches
      // through rewrites() plus any R2 public buckets the client talks to.
      "connect-src 'self' https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
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
