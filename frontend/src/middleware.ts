import { NextResponse, type NextRequest } from "next/server";

/**
 * Gallery-subdomain rewrite middleware
 * -----------------------------------
 * Handles incoming requests where the host is a single-label subdomain of
 * `rawdrive.in` (e.g. `wedding-veera.rawdrive.in`) and rewrites the URL path
 * so the existing `/g/[slug]/*` App Router segment handles the request
 * without per-route changes.
 *
 * Mapping:
 *   wedding-veera.rawdrive.in/                 → /g/wedding-veera
 *   wedding-veera.rawdrive.in/photo/abc-123    → /g/wedding-veera/photo/abc-123
 *   wedding-veera.rawdrive.in/people/p1        → /g/wedding-veera/people/p1
 *
 * Pass-through (no rewrite):
 *   - apex `rawdrive.in` (and `www.rawdrive.in` — nginx sends it to apex anyway)
 *   - any reserved label (`api`, `app`, `admin`, …) — nginx already routes
 *     `api.rawdrive.in` exact-match to backend; this list is defense-in-depth
 *     so a request that bypasses nginx (e.g. a future direct connection) won't
 *     accidentally rewrite to a gallery path.
 *   - paths starting with `/_next/`, `/api/`, `/static/`, `/favicon.ico`
 *   - paths already starting with `/g/` (no double-rewrite)
 *   - hosts that don't end in `.rawdrive.in` (localhost in dev, IP-direct
 *     debugging, etc.)
 *
 * MUST stay in sync with `backend/internal/repository/gallery_subdomain.go`'s
 * `reservedSubdomainSlugs` map. If you add an entry here, add it there too —
 * the DB CHECK constraint in migration 120 is the ultimate guard but the two
 * lists should agree for a coherent UX.
 */

const BASE_DOMAIN = "rawdrive.in";

// Mirror of backend reservedSubdomainSlugs. Single source of truth lives in
// the DB CHECK constraint (migration 120). Both this file and the Go file
// should mirror that set exactly.
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

// Paths we never rewrite — Next.js internals, the API proxy, and any path
// that's already inside the gallery namespace (so the rewrite is idempotent
// if the middleware ever runs twice).
const PASS_THROUGH_PREFIXES = ["/_next/", "/api/", "/static/", "/g/"];
const PASS_THROUGH_EXACT = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml"]);

/**
 * Extract the single-label subdomain of `rawdrive.in` from a Host header.
 * Returns null when the request is NOT a gallery subdomain (apex, www,
 * reserved label, or a host outside `.rawdrive.in`).
 */
function extractGallerySubdomain(host: string | null): string | null {
  if (!host) return null;
  // Strip port — `wedding.rawdrive.in:3000` → `wedding.rawdrive.in`
  const lower = host.toLowerCase().split(":")[0];

  if (!lower.endsWith(`.${BASE_DOMAIN}`)) return null;
  if (lower === BASE_DOMAIN) return null;

  // Everything before the `.rawdrive.in` suffix
  const sub = lower.slice(0, -1 * (BASE_DOMAIN.length + 1));

  // Multi-label subdomain (e.g. `foo.bar.rawdrive.in`) — wildcard cert only
  // covers single-label, so these can't even establish TLS. Pass through to
  // avoid surprising behavior if someone forces an HTTP request.
  if (sub.includes(".")) return null;
  if (sub === "") return null;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;

  // Defensive — match RFC 1035 + the migration 120 CHECK constraint. Any
  // subdomain that wouldn't have been allowed into the DB shouldn't be
  // rewritten into a gallery path either.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) return null;
  if (sub.includes("--")) return null;

  return sub;
}

export function middleware(req: NextRequest) {
  const sub = extractGallerySubdomain(req.headers.get("host"));
  if (sub === null) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;
  // Don't double-rewrite or interfere with internal/API/static paths
  if (PASS_THROUGH_EXACT.has(pathname)) {
    return NextResponse.next();
  }
  for (const prefix of PASS_THROUGH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  // Rewrite — keep the original path appended so /people/[personId] etc.
  // continue to resolve against /g/[slug]/people/[personId]
  const targetPath = pathname === "/" ? `/g/${sub}` : `/g/${sub}${pathname}`;

  const rewritten = req.nextUrl.clone();
  rewritten.pathname = targetPath;
  rewritten.search = search; // preserve querystring (album, page, etc.)

  const res = NextResponse.rewrite(rewritten);
  // Surface the resolved gallery slug back to the app — server components
  // can read it from headers without parsing the request URL themselves.
  res.headers.set("x-gallery-subdomain", sub);
  return res;
}

// Matcher: run middleware on everything EXCEPT pre-rendered static assets.
// Next.js's middleware runs at the Edge — keeping the matcher narrow avoids
// rewriting every static-asset request unnecessarily. The body of the
// middleware has its own pass-through checks as defense-in-depth.
export const config = {
  matcher: [
    // Everything except _next/static, _next/image, favicon, robots, sitemap.
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
