// F-098 (audit 2026-05-30): single typed source for the Content-Security-Policy
// script-src directive, shared by the static next.config.ts header (no nonce,
// 'unsafe-inline' fallback for paths the middleware doesn't cover) and the
// per-request middleware (frontend/src/middleware.ts) which passes a nonce so
// 'unsafe-inline' can be dropped. Kept dependency-free so it is safe to import
// from the Edge middleware runtime (no node: APIs).

export interface CspOptions {
  /** True for `next dev` — adds 'unsafe-eval' + localhost carve-outs. */
  isDev: boolean;
  /**
   * Per-request nonce. When supplied, script-src drops 'unsafe-inline' and
   * uses `'nonce-<value>' 'strict-dynamic'` instead — the F-098 fix. A static
   * header (computed once at build/boot) CANNOT supply a nonce, so it omits this
   * and keeps the documented 'unsafe-inline' fallback. The per-request
   * middleware is the only place that can pass it.
   */
  nonce?: string;
  /** Extra HTTP(S) API origin to allow for API-backed media and fetches. */
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
 *   - nonce present  → `script-src 'self' 'nonce-<n>' 'strict-dynamic'
 *                       'wasm-unsafe-eval' blob: https://checkout.razorpay.com`
 *                       (NO 'unsafe-inline')
 *   - nonce absent   → `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'
 *                       blob: https://checkout.razorpay.com`
 *                       (static-header fallback)
 *
 * 'strict-dynamic' lets a nonced script load further scripts (Razorpay's SDK
 * pulls additional bundles) without enumerating every origin, while ignoring
 * host-source allowlists in CSP3-capable browsers — which is exactly the
 * hardened posture the finding asks for.
 *
 * Other directives keep their existing, separately-justified sources:
 *   - checkout.razorpay.com (script + frame): Razorpay Checkout SDK + modal.
 *   - youtube / youtube-nocookie / vimeo / instagram (frame): embedded-videos panel.
 *   - www.instagram.com (script): Instagram's official embed.js processor.
 *   - script-src 'wasm-unsafe-eval': required by the approved @jsquash/webp
 *     upload fallback so Safari/iOS can generate source-side WebP derivatives;
 *     production still forbids broad JavaScript 'unsafe-eval'.
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
    // when no per-request nonce is available.
    scriptSrcTokens.push("'unsafe-inline'");
  }
  // Narrow WebAssembly compilation allowance for the upload WebP encoder
  // fallback. This is not broad JavaScript eval; production keeps
  // 'unsafe-eval' forbidden below.
  scriptSrcTokens.push("'wasm-unsafe-eval'");
  scriptSrcTokens.push("blob:");
  if (isDev) {
    // unsafe-eval is dev-only (turbopack/react-refresh). 'strict-dynamic'
    // disables host allowlists in CSP3 browsers, so when a nonce is present we
    // must still allow eval explicitly in dev.
    scriptSrcTokens.push("'unsafe-eval'");
  }
  scriptSrcTokens.push("https://checkout.razorpay.com");
  // Instagram embeds render from controlled blockquote markup plus the official
  // embed processor. The nonce path still excludes 'unsafe-inline'; this host
  // source primarily covers the documented no-nonce fallback and older CSP
  // behavior, while strict-dynamic trusts the app bundle's script insertion.
  scriptSrcTokens.push("https://www.instagram.com");

  const apiSource = normalizeHttpOrigin(apiOrigin);
  const apiExtra = apiSource ? ` ${apiSource}` : "";
  const devConnectExtras = isDev ? " http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*" : "";
  const devMediaExtras = isDev ? " http://localhost:* http://127.0.0.1:*" : "";

  return [
    "default-src 'self'",
    `script-src ${scriptSrcTokens.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Some gallery surfaces still render authenticated API-backed /storage/*
    // image URLs directly. Allow only the configured API origin here; encrypted
    // display paths still decrypt to blob: URLs in application code.
    "img-src 'self' data: blob: https:" + apiExtra + devMediaExtras,
    // connect-src must include the API origin for authFetch and same-origin
    // rewrites() plus any public buckets the client talks to. Dev adds
    // localhost:* so cross-origin dev fetches to the Go API work. Razorpay
    // Checkout makes XHRs to api.razorpay.com and lumberjack (analytics) — the
    // existing `https:` token already covers them.
    "connect-src 'self' https:" + apiExtra + devConnectExtras,
    "font-src 'self' data: https://fonts.gstatic.com",
    "media-src 'self' blob: https:" + apiExtra + devMediaExtras,
    // Razorpay Checkout opens its payment UI in iframes pointing to
    // api.razorpay.com / checkout.razorpay.com. www.youtube.com /
    // youtube-nocookie.com / player.vimeo.com / www.instagram.com — the
    // per-gallery embedded videos panel
    // (frontend/src/components/gallery/embedded-videos-panel.tsx) renders
    // YouTube, Vimeo, and Instagram embeds. Without these origins the browser
    // blocks the iframes silently.
    "frame-src 'self' https://api.razorpay.com https://checkout.razorpay.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.instagram.com",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function normalizeHttpOrigin(value: string | undefined): string {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
}
