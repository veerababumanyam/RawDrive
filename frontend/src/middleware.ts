import { NextResponse, type NextRequest } from "next/server";

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
 *   photoworks-a1b2c3d4.rawdrive.in/                  → /g/wedding-veera?ws=photoworks-a1b2c3d4
 *                                                       (when path is `/`, root subdomain hits a future studio
 *                                                       landing page — for now passes through as-is)
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
const PASS_THROUGH_EXACT = new Set(["/favicon.ico", "/robots.txt", "/sitemap.xml"]);

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

export function middleware(req: NextRequest) {
  const biz = parseBusinessSubdomain(req.headers.get("host"));
  if (biz === null) {
    return NextResponse.next();
  }

  const { pathname, search } = req.nextUrl;
  if (PASS_THROUGH_EXACT.has(pathname)) {
    return NextResponse.next();
  }
  for (const prefix of PASS_THROUGH_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  // Root of the business subdomain — `<biz>-<code>.rawdrive.in/` — has no
  // gallery slug in the path. Could eventually surface a studio landing
  // page (list of published galleries); for now, let it fall through so
  // Next.js renders a 404 rather than rewriting to /g/ which would 404
  // with a less helpful message.
  if (pathname === "/" || pathname === "") {
    return NextResponse.next();
  }

  // Path is `/wedding-veera` or `/wedding-veera/photo/123` etc. The first
  // segment is the gallery slug; everything else is sub-route the existing
  // /g/[slug] App Router segment handles.
  // Rewrite: /<gallery-slug>[/...rest] → /g/<gallery-slug>[/...rest]
  // Preserve original search, then APPEND ws= so the public gallery
  // server-side fetch can forward it to the backend.
  const targetPath = `/g${pathname}`;

  const rewritten = req.nextUrl.clone();
  rewritten.pathname = targetPath;
  // Merge `ws=<sub>` into existing search params (existing `album=`, `page=`, etc.
  // are preserved). Using URLSearchParams keeps the ordering deterministic.
  const merged = new URLSearchParams(search);
  merged.set("ws", biz.fullSubdomain);
  rewritten.search = "?" + merged.toString();

  const res = NextResponse.rewrite(rewritten);
  // Also surface via response headers so server components can read the
  // subdomain via `headers()` if they prefer that over the query string.
  res.headers.set("x-workspace-subdomain", biz.fullSubdomain);
  res.headers.set("x-workspace-profile-slug", biz.profileSlug);
  res.headers.set("x-workspace-unique-code", biz.uniqueCode);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
