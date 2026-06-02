import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

/**
 * Per-business subdomain rewrite middleware
 * -----------------------------------------
 * Handles incoming requests where the host is a per-workspace subdomain of
 * `rawdrive.in` shaped as `<business_profile_slug>-<business_unique_code>`
 * (migration 121). The trailing 8 characters after the last hyphen are the
 * globally-unique business code; the leading portion is the human-readable
 * studio slug.
 *
 * Mapping:
 *   photoworks-a1b2c3d4.rawdrive.in/                  → /studio?ws=photoworks-a1b2c3d4
 *   photoworks-a1b2c3d4.rawdrive.in/wedding-veera     → /g/wedding-veera?ws=photoworks-a1b2c3d4
 *   photoworks-a1b2c3d4.rawdrive.in/wedding-veera/photo/123
 *                                                     → /g/wedding-veera/photo/123?ws=photoworks-a1b2c3d4
 *
 * The `?ws=` query is consumed by the public gallery API call, which forwards
 * it to the backend's `resolveWorkspaceSubdomain()` (see
 * `backend/internal/handler/public_gallery_handler.go`). The backend extracts
 * the trailing 8-char code from `?ws=` and scopes the gallery slug lookup to
 * that workspace via INNER JOIN.
 *
 * Pass-through (no rewrite):
 *   - apex `rawdrive.in` and `www.rawdrive.in` — handled by exact-match nginx blocks
 *   - reserved labels (`api`, `app`, `admin`, …) — defense-in-depth; nginx already
 *     routes the exact-match `api.rawdrive.in` to the backend
 *   - paths starting with `/_next/`, `/api/`, `/static/`, `/g/`
 *   - hosts not ending in `.rawdrive.in` (localhost dev, IP-direct access)
 *
 * MUST stay in sync with the reserved labels in
 * `backend/internal/workspace/business_subdomain.go` and the DB CHECK
 * constraint in migration 121.
 */

const BASE_DOMAIN = "rawdrive.in";

// Mirror of backend reservedSubdomainLabels (workspace/business_subdomain.go)
// and the migration 121 CHECK constraint. Future additions need to touch all
// three places. The DB CHECK is the source of truth.
const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "app",
  "admin",
  "cdn",
  "mail",
  "ftp",
  "static",
  "assets",
  "blog",
  "docs",
  "support",
  "status",
  "billing",
  "payments",
  "auth",
  "login",
  "register",
  "mx",
  "ns",
  "cobolt",
  "rawdrive",
  "localhost",
  "test",
]);

const PASS_THROUGH_PREFIXES = ["/_next/", "/api/", "/static/", "/g/"];
const PASS_THROUGH_EXACT = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml", "/llms.txt"]);

// The trailing portion of a business subdomain — exactly 8 lowercase
// alphanumerics preceded by a single hyphen. e.g. `-a1b2c3d4` at the end of
// `photoworks-a1b2c3d4`. Used both to detect the new shape and to prevent
// stale `<gallery>.rawdrive.in` URLs (no trailing -<8char>) from being
// misinterpreted.
const BUSINESS_CODE_RE = /-[a-z0-9]{8}$/;

interface BusinessSubdomain {
  fullSubdomain: string; // "photoworks-a1b2c3d4"
  profileSlug: string;   // "photoworks"
  uniqueCode: string;    // "a1b2c3d4"
}

/**
 * Parse the Host header into a business subdomain (slug + code). Returns null
 * for apex, www, reserved labels, multi-level subdomains, hosts outside
 * .rawdrive.in, AND subdomains that don't end in -<8alnum> (i.e. the deprecated
 * per-gallery shape from migration 120 — those are intentionally left to 404
 * since the user opted to break them).
 */
function parseBusinessSubdomain(host: string | null): BusinessSubdomain | null {
  if (!host) return null;
  const lower = host.toLowerCase().split(":")[0];

  if (!lower.endsWith(`.${BASE_DOMAIN}`)) return null;
  if (lower === BASE_DOMAIN) return null;

  const sub = lower.slice(0, -(BASE_DOMAIN.length + 1));
  if (sub.includes(".")) return null;
  if (sub === "") return null;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;

  // The new shape requires a trailing -<8alphanumeric>. If absent, this is
  // either a legacy per-gallery URL (mig 120, deprecated) or an invalid
  // subdomain — bail and let the wildcard nginx default route to whatever
  // the apex would serve, which for unknown subdomains is a 404 from Next.js.
  if (!BUSINESS_CODE_RE.test(sub)) return null;

  const dashIdx = sub.length - 9;
  const profileSlug = sub.slice(0, dashIdx);
  const uniqueCode = sub.slice(dashIdx + 1);

  // Defense-in-depth: validate the leading slug shape too. Should always pass
  // if the workspace was created through the normal path (migration 121 CHECK
  // enforces it at the DB), but a manually-typed bogus subdomain shouldn't
  // crash here.
  if (profileSlug.length === 0) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,52}[a-z0-9])?$/.test(profileSlug)) return null;
  if (profileSlug.includes("--")) return null;

  return { fullSubdomain: sub, profileSlug, uniqueCode };
}

// F-098: a fresh per-request nonce lets the CSP drop 'unsafe-inline' from
// script-src. Edge-runtime safe — uses Web Crypto + btoa (no node: APIs).
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function resolveBusinessSubdomainRewrite(
  pathname: string,
  search: string,
  fullSubdomain: string,
): { pathname: string; search: string } {
  const targetPath = pathname === "/" || pathname === ""
    ? "/studio"
    : `/g${pathname}`;
  const merged = new URLSearchParams(search);
  merged.set("ws", fullSubdomain);
  return {
    pathname: targetPath,
    search: "?" + merged.toString(),
  };
}

export function middleware(req: NextRequest) {
  // F-098: build the nonced CSP once per request. The nonce is forwarded on the
  // REQUEST headers so Next.js stamps it onto its framework/bootstrap scripts
  // (and layout.tsx reads x-nonce for the theme-init <Script>); the same policy
  // is set on the RESPONSE for browser enforcement. Applied to every return path
  // via pass()/the rewrite below.
  const isDev = process.env.NODE_ENV !== "production";
  const isLocalBrowser =
    req.nextUrl.hostname === "localhost" ||
    req.nextUrl.hostname === "127.0.0.1" ||
    req.nextUrl.hostname === "::1";
  const apiOrigin =
    process.env.NEXT_PUBLIC_API_URL ||
    (isLocalBrowser ? "http://localhost:8080" : "");
  const nonce = generateNonce();
  const csp = buildCsp({ isDev, nonce, apiOrigin });

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  // Forward the request (carrying the nonce) and stamp the CSP on the response.
  const pass = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const biz = parseBusinessSubdomain(req.headers.get("host"));
  if (biz === null) {
    return pass();
  }

  const { pathname, search } = req.nextUrl;
  if (PASS_THROUGH_EXACT.has(pathname)) {
    return pass();
  }
  for (const prefix of PASS_THROUGH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return pass();
    }
  }

  const rewritten = req.nextUrl.clone();
  // Root (`/`) becomes the studio landing page; all other paths are gallery
  // slugs or gallery sub-routes handled by the existing /g/[slug] tree.
  // In both cases, preserve existing query params and append `ws=<sub>` so
  // server components can scope public API calls to the business workspace.
  const target = resolveBusinessSubdomainRewrite(pathname, search, biz.fullSubdomain);
  rewritten.pathname = target.pathname;
  rewritten.search = target.search;

  const res = NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  // Also surface via response headers so server components can read the
  // subdomain via `headers()` if they prefer that over the query string.
  res.headers.set("x-workspace-subdomain", biz.fullSubdomain);
  res.headers.set("x-workspace-profile-slug", biz.profileSlug);
  res.headers.set("x-workspace-unique-code", biz.uniqueCode);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|llms\\.txt).*)",
  ],
};
