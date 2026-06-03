# Public-page SEO/GEO pass — branch `seo/public-pages-geo-2026-06`

Date: 2026-06-02 · Base: `be172bde` · Scope: public marketing surface only (no app/private routes, no concurrent gallery work).

## Applied & verified (build ✓ · eslint ✓ · 12/12 tests ✓ · rendered-HTML ✓ · JSON-LD 22/22 valid)

### 1. AI + search crawler policy (the headline fix)
`frontend/src/lib/seo.ts` + `frontend/src/app/robots.ts`
- Split the old single `AI_SEARCH_CRAWLERS` allow-list into:
  - **`AI_ALLOW_CRAWLERS`** — OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, **Bingbot**, **Applebot**, DuckAssistBot (search/answer + user bots → we stay citable in AI answers + classic search).
  - **`AI_DISALLOW_CRAWLERS`** — GPTBot, ClaudeBot, **Google-Extended**, **Applebot-Extended**, CCBot, Bytespider, meta-externalagent, Amazonbot, cohere-ai (training crawlers + training opt-out tokens → `Disallow: /`).
- `AI_SEARCH_CRAWLERS` kept as a deprecated back-compat alias for the allow set.
- **Why it mattered:** the old config *allowed* GPTBot/ClaudeBot (training) and put `Google-Extended` in the allow group, which opts the site **into** Gemini training. Blocking a training bot does NOT remove AI-search citation — only blocking a search bot would.
- `robots.ts` now emits 3 groups (`*`, allow-bots, training-disallow). Verified live at `/robots.txt`.

### 2. Metadata quality — all ~20 registry entries (`seo.ts` PUBLIC_PAGES)
- Fixed 4 `RawDrive | RawDrive` title duplications: register, dealership, about, contact.
- Lengthened 5 thin titles: about, legal, privacy, terms, refund.
- Trimmed the over-length `features` description (166 → ≤160).

### 3. hreflang (`en-IN` + `x-default`)
- Added `alternates.languages` to `createPageMetadata` → every public page now emits `<link rel="alternate" hrefLang="en-IN">` + `x-default` (self-referencing; primes future hi/te/ta/kn locales). Verified live.

### 4. Reusable structured-data builders + tests
- `buildBreadcrumbJsonLd(trail)` and `buildFaqJsonLd(items)` added to `seo.ts`.
- `seo.test.ts`: +96 lines — crawler-policy assertions (allow/disallow membership, disjoint, no training bot in allow, alias safety, robots groups) + builder assertions.

### 5. BreadcrumbList schema on all 6 solutions + 2 marketplaces
- Wired through the shared `SolutionShowcasePage` + `MarketplaceShowcasePage` (one edit each); pages pass `path` (+ `breadcrumbName` for marketplaces). Renders `BreadcrumbList` JSON-LD in server HTML. Verified live + validator-clean.

## Deliberately deferred (need assets / content / a product decision)
- **Per-page OG + WhatsApp-safe images.** `DEFAULT_OG_IMAGE` is still `/landing/hero-couple.webp` — WhatsApp (India's main share channel) will not render WebP, and every page shares one generic card. Fix = `opengraph-image.tsx` per route via `next/og` emitting **PNG/JPG ≤250 KB, 1200×630** + switch the default to a JPG. (~19 thin files + a shared renderer.)
- **FAQ blocks + FAQPage schema** on solutions/pricing — needs real, accurate Q&A copy authored (no fabrication).
- **`/studio`** public studio landing — currently inherits the generic global title for every studio (duplicate-title risk) and has no `ProfessionalService`/`LocalBusiness` schema despite carrying address/city. Real remaining finding; deserves per-studio `generateMetadata` + local schema (or an explicit noindex), which is a product call about whether studio microsites should be an indexed surface.
- **`Organization.sameAs`** social links — add to `buildSiteJsonLd` once real LinkedIn/Instagram/YouTube URLs are provided (entity grounding for AI).
- **IndexNow** — host a key file in `public/` + ping on publish → fast Bing/Copilot/ChatGPT-hybrid freshness (Google ignores IndexNow).

## Notes
- The auditor's 4 HIGH "share route no noindex" + several MED "no metadata" flags are **false positives**: `/g/[slug]/layout.tsx` already sets `createNoIndexMetadata` (children inherit), and the auth pages use `createNoIndexMetadata`. (Auditor is a source heuristic; it doesn't traverse parent layouts.)
- Not committed (left as working changes in this worktree per "commit only when asked").
