// route-template.ts — PERF-RUM: collapse a concrete pathname into its Next.js
// route TEMPLATE so Core Web Vitals samples are labelled by route without
// exploding Prometheus cardinality and without leaking PII (ids, slugs, tokens)
// into a metric label.
//
// usePathname() returns the concrete path (e.g. "/galleries/abc-123-def"); the
// RUM histogram must instead be labelled by the template ("/galleries/[id]").
// We do that with an ordered list of patterns mirroring the dynamic segments in
// frontend/src/app. Each rule matches a concrete path and yields its template.
// The first match wins, so more specific routes are listed before their
// prefixes. Anything that doesn't match is returned cleaned (query/fragment
// stripped) so a never-before-seen route still reports under a stable, PII-free
// label rather than being dropped.

type RouteRule = {
  // RegExp matched against the path (no query string / fragment).
  readonly match: RegExp;
  // The route template emitted when match succeeds.
  readonly template: string;
};

// Ordered most-specific-first. Patterns are anchored and use [^/]+ for a single
// dynamic segment. Route groups like (dashboard) are NOT part of the URL path,
// so they never appear here.
const ROUTE_RULES: readonly RouteRule[] = [
  // Public gallery sub-routes (most specific first).
  {
    match: /^\/g\/[^/]+\/people\/[^/]+$/,
    template: "/g/[slug]/people/[personId]",
  },
  { match: /^\/g\/[^/]+\/photo\/[^/]+$/, template: "/g/[slug]/photo/[assetId]" },
  { match: /^\/g\/[^/]+\/people$/, template: "/g/[slug]/people" },
  { match: /^\/g\/[^/]+\/photo-search$/, template: "/g/[slug]/photo-search" },
  { match: /^\/g\/[^/]+$/, template: "/g/[slug]" },

  // Studio profile + short links + portfolio.
  { match: /^\/p\/[^/]+$/, template: "/p/[slug]" },
  { match: /^\/s\/[^/]+$/, template: "/s/[shortcode]" },
  { match: /^\/stream\/[^/]+$/, template: "/stream/[id]" },

  // Dashboard dynamic detail routes.
  { match: /^\/galleries\/[^/]+$/, template: "/galleries/[id]" },
  { match: /^\/crm\/contacts\/[^/]+$/, template: "/crm/contacts/[id]" },
  { match: /^\/crm\/projects\/[^/]+$/, template: "/crm/projects/[id]" },
  {
    match: /^\/marketplace\/freelancers\/[^/]+$/,
    template: "/marketplace/freelancers/[id]",
  },
  { match: /^\/marketplace\/gear\/[^/]+$/, template: "/marketplace/gear/[id]" },
  { match: /^\/streams\/[^/]+$/, template: "/streams/[id]" },
];

// Conservative allow-list of characters the backend accepts in a route label:
// path chars, [bracket] template syntax, dashes/underscores/dots. We strip the
// query string and fragment here so a tokenised URL can never become a label.
const SAFE_LABEL_SEGMENT = /[^a-zA-Z0-9/[\]\-_.]/g;

/**
 * routeTemplateFromPathname collapses a concrete pathname to its Next.js route
 * template. Query strings and fragments are dropped. Returns "/" for an empty
 * or root path.
 */
export function routeTemplateFromPathname(pathname: string | null | undefined): string {
  if (!pathname) {
    return "/";
  }

  // Drop query string / fragment defensively (usePathname omits them, but a
  // caller might pass a full URL).
  let path = pathname.split("?")[0]?.split("#")[0] ?? "/";

  // Normalise a trailing slash (except the root).
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  if (path === "") {
    return "/";
  }

  for (const rule of ROUTE_RULES) {
    if (rule.match.test(path)) {
      return rule.template;
    }
  }

  // Unknown static route: return it cleaned so it still reports under a stable,
  // PII-free label. The character scrub guarantees the backend's route
  // validation accepts it.
  const cleaned = path.replace(SAFE_LABEL_SEGMENT, "");
  return cleaned === "" ? "/" : cleaned;
}
