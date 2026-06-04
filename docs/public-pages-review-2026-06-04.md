# Public Pages Review & Improvement Plan

**Date:** 2026-06-04 · **Scope:** All 30 public routes — landing, marketing (features, pricing, about, contact, dealership, studio, 6× solutions, 2× marketplaces), auth (login, MFA, register, activate, forgot/reset password), legal (terms, privacy, refund, legal), and client delivery (`/g/[slug]/*`, `/p/[slug]`, `/s/[shortcode]`, `/stream/[id]`).

**Review axes:** copy/conversion, UX/design-token compliance, SEO, accessibility, performance, code quality. Key findings spot-verified against source.

---

## Executive Summary

The public surface is in strong shape overall. The landing page is excellent (token-discipline, real claims only, single H1, reduced-motion handling, WebP + `next/image`). Client delivery pages pass all gallery performance laws (windowed grids, batched hydration, WebP derivatives, no N+1). SEO infrastructure (per-page metadata, JSON-LD, sitemap/robots/llms.txt, noindex on ephemeral links) is comprehensive.

The weakest areas: **forgot/reset-password pages bypass the design system**, a **malformed contact phone string appears on three surfaces**, **inconsistent password policy** (8 vs 12 chars), one **named-export violation**, and a **missing focus trap** in the public gallery lightbox. None are blockers; all are cheap to fix.

**Overall: A−.** ~12 high/medium items, mostly < 1 hour each.

---

## P0 — Fix Now (high impact, low effort)

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 0 | **Navbar dropdowns break the header** — hovering "Products & Solutions" / "Marketplaces" / "Company" spreads the nav items apart and renders the menu on top of/above the header instead of below it. Root cause: the unlayered `.surface-panel { position: relative }` rule in `globals.css` (Liquid Glass optical-layers block, ~line 722) outranks Tailwind v4's layered `absolute` utility, pulling the dropdown panel into the flex flow. Also affected the mobile menu and the dashboard avatar dropdown. | `app/globals.css` (glass positioning rule), consumed by `components/layout/Navbar.tsx:121,167,227,279` | **Fixed 2026-06-04:** wrapped the `position: relative; isolation: isolate` defaults in `@layer components` so explicit `absolute`/`fixed`/`sticky` utilities win again. Pseudo-layer glass effects unaffected (absolute also creates a positioned ancestor). Verify in browser across all 3 themes. |
| 1 | Malformed phone string `"contact:+91 928112993 ,+91 9010012299"` — awkward prefix, bad spacing, label lists two numbers but `href` dials one | `components/layout/Footer.tsx:35-36`, `app/contact/page.tsx:30-31` (+ tests asserting the broken string: `Footer.test.tsx:19`, `legal.test.tsx:29`) | Format as `+91 92811 2993 · +91 90100 12299`, drop the `contact:` prefix, render each number as its own `tel:` link. Update the three test assertions. |
| 2 | Forgot/reset-password inputs use raw inline classes (`rounded-md border border-border-subtle bg-surface px-3 py-2`) instead of `input-base` — loses focus-ring tokens and 44px touch target; buttons use inline `bg-accent` instead of `btn-primary`/GlassButton | `app/forgot-password/page.tsx:110,168,179`; `app/reset-password/page.tsx:60,74,87,100,127` | Replace with `input-base w-full` and semantic button classes, matching LoginForm/RegisterForm. This is the only token violation found across all public pages. |
| 3 | Password policy inconsistency: registration validates ≥8 chars, reset enforces `minLength={12}` | `components/auth/RegisterForm.tsx` (~line 162) vs `app/reset-password/page.tsx:84,97` | Pick one policy (recommend 12) and align both flows + backend validation. Show the requirement under the password label *before* submit, not only on error. |
| 4 | `DealerApplicationButton` uses a default export (project rule: named exports only) | `components/DealerApplicationButton.tsx:6` | Convert to named export; update import in `app/dealership/page.tsx`. |
| 5 | Error messages not programmatically tied to inputs on forgot/reset forms — `role="alert"` divs lack `id`; inputs lack `aria-invalid`/`aria-describedby` | `app/forgot-password/page.tsx:163`, `app/reset-password/page.tsx:55-103` | Add `id` to error elements, link via `aria-describedby`, set `aria-invalid` when errored. Also add `role="alert"` to the gallery password-gate error (`gallery-password-gate.tsx:110`). |

## P1 — This Sprint

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 6 | Public-gallery lightbox has `aria-modal="true"` but **no focus trap** — Tab escapes behind the modal | `public-gallery-grid.tsx:~1764` | Trap Tab/Shift+Tab within the modal, move focus in on open, restore on close (~1–2h). Also add `aria-owns`/`id` pairing on tile menus (`:1447`). |
| 7 | `/register` SEO contradiction: indexable metadata via `createPageMetadata("register")` but `sitemap: false` in `lib/seo.ts:93` | `app/register/page.tsx:5`, `lib/seo.ts:83-93` | Decide intent. Recommended: keep indexable **and** include in sitemap (it's a conversion page), or noindex it. Don't leave the mixed signal. |
| 8 | Contact page cards mislead on mobile — phone/location cards are `<Link>`s; location links to `/about` | `app/contact/page.tsx:59-76` | Use real `tel:` / `mailto:` anchors for comms; give location a maps link or make it non-interactive. |
| 9 | No cross-linking between the six `/solutions/*` pages — each dead-ends at `/register` or `/contact` | all `app/solutions/*/page.tsx` | Add 1–2 themed secondary CTAs per page (galleries → proofing, AI → galleries, CRM → scheduling) to keep visitors in the funnel. |
| 10 | `/about` has no CTA at all | `app/about/page.tsx` | Add "Explore features" / "Start free trial" at page end. |
| 11 | Marketing hero images are static `<img>` on `/stitch/*.png` — no srcset/lazy/WebP (landing page does this correctly; marketing pages don't) | `FeaturesContent`, `SolutionShowcasePage`, `MarketplaceShowcasePage` | Migrate to `next/image` with `sizes`; convert PNGs to WebP. |
| 12 | Profile-page JSON-LD injected via raw `JSON.stringify` without the escaping helper used on gallery pages | `app/p/[slug]/page.tsx:125` | Use `serializeJsonLd()` from `lib/seo.ts` (defensive `</script>` escaping). |

## P2 — Backlog / Polish

- **Pricing page:** FAQ accordion `max-h-40` risks clipping longer answers (`PricingContent.tsx:449`); ~150 LOC of `{false && ...}` dead sections (comparison table, storage boosters, streaming packs) — extract behind a flag or delete (`:337`).
- **Gallery prefetch:** IntersectionObserver `rootMargin: 800px` is aggressive on slow mobile networks — drop to ~400px or make connection-aware (`public-gallery-grid.tsx:1180`).
- **Legal/compliance copy:** name a DPO channel (`dpo@rawdrive.in`) on the privacy page (DPDP Act expects identifiable accountability); add a decision SLA to the refund policy ("decision within 3 business days"); make "Last updated" dates maintained or dynamic.
- **Activation resend copy:** "If this account is still unverified, we sent a fresh code…" is awkward — simplify while keeping the deliberate generic-feedback posture (`ActivateForm.tsx:127`).
- **People page grid:** hardcoded column counts may crop tiles at ~360px widths (`g/[slug]/people/[personId]/page.tsx:105`).
- **Rentals marketplace:** sample kit cards read as live inventory — add "Example kits; availability varies by city."
- **Naming:** consider "Partner Program" over "Dealership" (validate with users first).

## Growth Opportunities (new work, not fixes)

1. **Content/SEO engine:** no blog/resources section. 3–4 cornerstone guides ("wedding photography workflow", "studio software India", "AI culling guide") would capture long-tail traffic the solution pages can't.
2. **Case studies / social proof:** testimonials were deliberately removed (rightly — no fake quotes). Replace with 1–2 real studio case studies once customers permit; landing TrustRow is the natural slot.
3. **Landing free-plan teaser:** a short note near the hero CTA reduces signup hesitation. Free plan includes: 1 GB storage, 3 galleries, 5 client profiles, basic gallery delivery.
4. **India-specific copy depth:** the site says "weddings" generically, but Indian weddings are multi-day, multi-event productions — name them. On `/features` and `/solutions/galleries`, reference the full event arc explicitly: pre-wedding shoots, haldi, mehendi, sangeet, wedding ceremony, and reception — and show how galleries/albums map to it (one gallery per event day, sub-albums per ceremony, separate delivery timelines for teasers vs. final albums). Mention multi-shooter coverage (candid + traditional teams) since AI culling/dedup across shooters is a real differentiator. For trust, surface DPDP Act compliance prominently — a dedicated line on `/features` and the landing TrustRow ("DPDP-compliant client data handling, stored in India") — since competitors mostly lead with GDPR; pair it with the Mumbai-region data residency claim already on the site.
5. **Landing FAQ:** consider a short FAQ before FinalCta if conversion data shows hesitation (pricing page already has one).

---

## What's Already Done Well (keep doing this)

- **Token discipline:** zero Tailwind-primitive or arbitrary-value violations anywhere except the two password pages. All three themes render without forced overrides.
- **Gallery performance laws:** windowed 60-tile incremental rendering, batched `Promise.all` hydration, single asset-access-token mint, WebP derivative srcset ladders, thumbs-only filmstrips, originals download-only — all pass.
- **Honest marketing:** fake stats/testimonials deliberately removed; every visible claim is operationally verifiable.
- **SEO infra:** per-page metadata + canonical + en-IN hreflang, Organization/SoftwareApplication/Breadcrumb JSON-LD, AI-crawler-aware robots.txt, llms.txt, correct noindex on `/s/*`, `/stream/*`, single-photo shares.
- **Security UX:** enumeration-safe auth errors, OTP-vs-TOTP separation honored in UI, asset-membership checks on photo deep links, session/byte-token separation, no error leakage on expired/missing galleries.
- **Auth a11y:** main auth forms (login/register/activate/MFA) use `input-base`, live regions, proper autocomplete (`one-time-code`, `new-password`), resend countdowns.

## Suggested Sequence

1. **Week 1 (P0):** items 1–5 — roughly a day of work total, ship as one `fix(public-pages)` PR via `npm run ship`.
2. **Week 2 (P1):** focus trap + register SEO decision + contact/about/solutions conversion fixes; marketing `next/image` migration.
3. **Ongoing (P2 + growth):** legal copy upkeep, pricing dead-code cleanup, then the content/case-study program.
