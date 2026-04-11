# Guest (Unauthenticated Visitor) — User Acceptance Testing

**Persona:** Guest — anyone arriving at RawDrive without an account
**Requirements source:** `docs/TechnicalRequirements/Client-Requirements.md` §2 (Sub-types, Entry experiences) + PRD §§23 (Public Profiles), 15 (Public Galleries), 20–21 (Freelancer & Rental marketplaces), 26 (Live streaming), landing page plan
**Primary handle:** *none — guests are anonymous by definition*
**Build under test:** v0.0.40 (M17 Hardening Wave 5)
**Owner:** Head of Growth / Marketing
**Read first:** [`README.md`](README.md)

---

## 1. Why a Guest UAT matters

Guests are the top of the funnel — prospective photographers researching the product, prospective clients following a share link, search-engine crawlers indexing content, and opportunistic visitors discovering a public gallery. Every single acceptance scenario below is a **first impression**: if it fails, the user may never return, and there is no "second chance via support" because they are anonymous.

Three concerns define this doc:

1. **Conversion paths must work without auth** — landing → pricing → register, share link → gallery, inquiry form → photographer lead.
2. **SEO and discoverability** — public pages must carry the right metadata so crawlers can index them and rich-previews render correctly in WhatsApp / iMessage / Twitter.
3. **Security posture** — no PII leak, no authentication bypass, no rate-limit holes in public forms.

---

## 2. Pre-flight

Standard environment. No seeded "guest account" — testing is done in an incognito / private window with cleared cookies between scenarios.

Verify before starting:
- `@pho_pro` has a public profile published at `/u/<slug>`.
- Wedding Gallery (Photographer UAT F04) is share-enabled and password-protected.
- Public Gallery (Photographer UAT E09) also exists with no password — used for public-slug tests.
- At least one freelancer listing and one rental listing are published.
- Landing page, pricing page, features page all built and served.

---

## Table of modules

| Module | Area | Scenarios |
|---|---|---|
| [A](#module-a--landing--marketing-pages) | Landing & marketing pages | A01–A09 |
| [B](#module-b--public-profile-uslug) | Public profile `/u/{slug}` | B01–B09 |
| [C](#module-c--public-gallery-gslug) | Public gallery `/g/{slug}` and password flow | C01–C07 |
| [D](#module-d--inquiry-submission--lead-capture) | Inquiry submission & lead capture | D01–D06 |
| [E](#module-e--booking-without-account) | Booking without account | E01–E05 |
| [F](#module-f--freelancer--rental-marketplaces) | Freelancer & rental marketplaces | F01–F07 |
| [G](#module-g--live-stream-public-access) | Live stream public access | G01–G05 |
| [H](#module-h--seo--social-rich-previews) | SEO & social rich previews | H01–H08 |
| [I](#module-i--registration-entry-points) | Registration entry points | I01–I05 |
| [J](#module-j--accessibility--performance) | Accessibility & performance | J01–J07 |
| [K](#module-k--security--privacy-posture) | Security & privacy posture | K01–K10 |
| [L](#module-l--cross-persona-flows) | Cross-persona flows | L01–L03 |

---

## Module A — Landing & marketing pages

| ID | P | Title |
|---|---|---|
| A01 | P0 | Landing page `/` loads within 2 s on desktop broadband |
| A02 | P0 | Landing page LCP < 2.5 s on 4G (Lighthouse mobile profile) |
| A03 | P0 | Primary CTA ("Start free trial" / equivalent) routes to `/register` |
| A04 | P1 | Features page `/features` lists feature blocks with visuals |
| A05 | P1 | Pricing page `/pricing` shows current plan catalogue with billing toggle (monthly / annual) |
| A06 | P1 | Solutions pages (`/solutions/galleries`, `/solutions/crm-contracts`, etc.) all load without 404 |
| A07 | P1 | Marketing nav: About, Contact, Privacy, Terms, Refund all reachable |
| A08 | P1 | Dealership page `/dealership` renders for prospective dealers |
| A09 | P1 | Theme: landing respects `design-tokens.json` active theme (no hardcoded colours) |

---

## Module B — Public profile `/u/{slug}`

| ID | P | Title | Ref |
|---|---|---|---|
| B01 | P0 | `/u/{slug}` renders within 3 s with photographer branding | FR-CLI-ENT-010, AC-CLI-022 |
| B02 | P0 | Bio, services, featured galleries, booking CTA, WhatsApp CTA visible |
| B03 | P0 | No guest authentication prompts on the profile page |
| B04 | P1 | WhatsApp CTA opens pre-filled message | AC-CLI-023 |
| B05 | P1 | vCard download contains name, phone, email, website with exact values | AC-CLI-024, FR-CLI-ENT-011 |
| B06 | P1 | QR code downloadable PNG, scannable back to the same profile URL |
| B07 | P0 | Invalid slug `/u/does-not-exist` returns a branded 404, not a stack trace |
| B08 | P1 | Profile respects photographer's custom domain when configured |
| B09 | P1 | "Published" vs "Unpublished" profile — unpublished returns 404 to guests |

### B05 — vCard integrity
- **Steps:** open `/u/<pho_pro_slug>` → click "Save contact" → download vCard.
- **Expected:** `.vcf` file opens in the OS contact app with exact name, phone, email, website. No `X-RAWDRIVE-INTERNAL-*` leakage fields.

---

## Module C — Public gallery `/g/{slug}` and password flow

| ID | P | Title |
|---|---|---|
| C01 | P0 | Public gallery with no password loads directly into the grid |
| C02 | P0 | Password-protected gallery lands on `/g/{slug}/password` with branding |
| C03 | P0 | Wrong password: shake + error, no data leaked in DOM or network |
| C04 | P0 | Correct password proceeds to the gallery |
| C05 | P0 | Password screen does not reveal whether the slug exists for an unknown slug (C01/C02 look identical) |
| C06 | P0 | Expired gallery shows expiry message and photographer contact |
| C07 | P0 | Revoked share link returns friendly error with no data |

---

## Module D — Inquiry submission & lead capture

| ID | P | Title | Ref |
|---|---|---|---|
| D01 | P0 | Inquiry form on `/u/{slug}/inquiry` accepts name, email, phone, event type, preferred dates, message | FR-CLI-PUB-001 |
| D02 | P0 | Submission → success confirmation + inquiry lands in photographer's CRM within 15 s |
| D03 | P0 | Rate limit on anonymous submissions (≥ 5/min blocked with 429) |
| D04 | P0 | Server-side input sanitisation — malicious payload is neutralised, no stored XSS in CRM |
| D05 | P1 | Client-side validation for email / phone format before submit |
| D06 | P1 | Consent checkboxes required (DPDPA granular opt-ins) | Security §2.2 |

### D04 — XSS input probe
- **Steps:** submit an inquiry with `name = <img src=x onerror=alert(1)>` and `message = javascript:alert(1)`.
- **Expected:** inquiry is stored with escaped strings; Photographer's CRM renders the text literally (no alert). No 500 in server logs.
- **Pass:** automated a11y scan (or manual review) shows `<` and `>` are HTML-encoded in the rendered CRM card.

### D03 — Anonymous rate limit
- **Steps:** submit 6 inquiries from the same IP within 30 s using a small loop or repeated clicks.
- **Expected:** the first 5 succeed (or fewer if per-minute rate is lower), the 6th returns 429 with a helpful "too many requests" message. No CAPTCHA is required but rate limiting must be enforced by server, not by client.

---

## Module E — Booking without account

| ID | P | Title | Ref |
|---|---|---|---|
| E01 | P0 | Scheduler `/u/{slug}/book` lets guest pick a service, date, and slot | FR-CLI-PUB-003 |
| E02 | P0 | Google "Busy" events correctly hide slots | Photographer UAT J05 |
| E03 | P1 | Timezone switcher: guest vs photographer timezone | FR-CLI-PUB-004 |
| E04 | P0 | Payment required for booking → Razorpay or PhonePe sandbox charge → booking confirmation | Razorpay doc |
| E05 | P1 | Booking confirmation email sent to the guest-entered email address |

---

## Module F — Freelancer & rental marketplaces

| ID | P | Title |
|---|---|---|
| F01 | P1 | `/marketplaces/freelancer` lists published freelancer profiles |
| F02 | P1 | Freelancer detail page shows availability calendar |
| F03 | P1 | `/marketplaces/rentals` lists published rental items |
| F04 | P1 | Rental detail shows price, deposit, availability, conditions |
| F05 | P1 | Guest can request booking (leads to inquiry form) |
| F06 | P1 | Filters work: location, price range, category |
| F07 | P1 | Pagination or infinite scroll stable with 50+ listings |

---

## Module G — Live stream public access

| ID | P | Title |
|---|---|---|
| G01 | P0 | Public stream URL `/stream/{eventId}` plays within 2 s when stream is live |
| G02 | P1 | Stream offline / not started → friendly placeholder, no 500 |
| G03 | P1 | Chat: guest can read, sending requires a basic identity (name) |
| G04 | P1 | Viewer count increments |
| G05 | P1 | Adaptive bitrate downscales on slow network |

---

## Module H — SEO & social rich previews

| ID | P | Title | Ref |
|---|---|---|---|
| H01 | P0 | `<title>`, `<meta name="description">` present and populated on all public pages |
| H02 | P0 | OpenGraph tags: `og:title`, `og:description`, `og:image`, `og:url` populated on `/u/{slug}` and `/g/{slug}` | §3.2 PWA doc |
| H03 | P0 | Twitter Card tags present (`twitter:card=summary_large_image`) |
| H04 | P0 | WhatsApp preview of a deep-linked photo shows the actual photo, not a generic placeholder |
| H05 | P1 | `robots.txt` served; public pages crawlable; private slugs disallowed |
| H06 | P1 | XML sitemap lists public profiles and featured galleries |
| H07 | P1 | Structured data (JSON-LD) for photographer profile (`Person` / `LocalBusiness`) |
| H08 | P1 | `<html lang>` set correctly for the locale |

### H04 — Deep link preview
- **Steps:** copy a photo-deeplink URL (e.g., `/g/{slug}/photo/<id>`) into a WhatsApp chat and send.
- **Expected:** preview card shows that exact photo, gallery title, photographer name. If the gallery is password-protected, preview shows a generic placeholder — not a revealing thumbnail.

---

## Module I — Registration entry points

| ID | P | Title |
|---|---|---|
| I01 | P0 | Landing CTA → `/register` works |
| I02 | P0 | Pricing plan CTA → `/register?plan=<name>` pre-selects plan in onboarding |
| I03 | P1 | Dealer application CTA on `/dealership` routes to dealer application form |
| I04 | P1 | Contact form on `/contact` submits and confirms |
| I05 | P1 | Cookie banner respects DPDPA (granular consent, deny-by-default marketing) |

---

## Module J — Accessibility & performance

| ID | P | Target |
|---|---|---|
| J01 | P0 | Landing Lighthouse mobile score: Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95 |
| J02 | P0 | Public profile Lighthouse mobile: LCP < 2.5 s, CLS = 0 |
| J03 | P0 | Public gallery: LCP < 1.2 s (strict client target) |
| J04 | P0 | Keyboard navigation: can reach primary CTAs without a mouse |
| J05 | P1 | Screen reader announces sections meaningfully |
| J06 | P1 | Touch targets ≥ 44 px on mobile public pages |
| J07 | P1 | Image lazy-loading enabled on marketplaces and galleries |

---

## Module K — Security & privacy posture

All P0. Guests are adversarial by default — security is first-class.

| ID | Check | Expected |
|---|---|---|
| K01 | `GET /api/v1/admin/*` from incognito | 401 / 403, no data |
| K02 | `GET /api/v1/dealer/*` from incognito | 401 / 403 |
| K03 | `GET /api/v1/galleries/<uuid>` (private) from incognito | 401 / 403 |
| K04 | Password-protected gallery photos list API unauthenticated | 401 / 403 |
| K05 | Password brute-force: 50 attempts on `/g/{slug}/password` | Rate-limited with 429, no account-lockout reveal |
| K06 | SQL injection in slug path (`/u/' OR 1=1--`) | Branded 404, no DB error |
| K07 | Inquiry form replayed without CSRF token (where applicable) | 403 |
| K08 | HTTPS redirect on any HTTP public URL | 301 to HTTPS |
| K09 | Security headers present: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, reasonable `Content-Security-Policy` |
| K10 | Public profile page does NOT expose photographer's private email, phone, or billing data beyond what they published |

### K05 — Brute force rate limit
- **Steps:** script 50 password attempts at `/g/<wedding-slug>/password` with wrong passwords from a single IP.
- **Expected:** after the configured threshold (document the exact number here during UAT), requests return 429 with `Retry-After`. Server logs show the event. Legitimate password entry from a different IP still works.

---

## Module L — Cross-persona flows

### L01 — [cross-persona] Guest inquiry → Photographer CRM lead → Photographer replies
- Participants: Guest tester + Photographer tester.
- **Steps:**
  1. Guest submits inquiry on `/u/<pho_pro_slug>/inquiry` with event = Wedding, date = next month, message = "looking for a candid-style wedding photographer in Hyderabad".
  2. Photographer opens CRM → Inquiries inbox → sees new lead within 15 s.
  3. Photographer moves lead to "Lead" column in pipeline kanban.
  4. Photographer replies via internal message → guest receives email response.
- **Expected:** full chain works end-to-end; audit log contains `lead.created`, `lead.pipeline_moved`, `message.sent`.

### L02 — [cross-persona] Guest registers via dealer coupon
See Dealer UAT N01 — exact same flow, tested from the Guest side confirms the coupon field and attribution. Requires a valid `@dealer_tg` coupon code shared publicly.

### L03 — [cross-persona] Guest views live stream shared by photographer
- Participants: Guest + Photographer testers.
- Photographer sets a stream to "public access" (no invitation required). Guest opens `/stream/<id>` → stream plays → chats as anonymous visitor.

---

## Regression gate

Every cycle, from an incognito / clean profile:
- A01, A02 (landing load + LCP)
- B01, B07 (public profile + 404 posture)
- C03, C05 (password gallery security)
- D03, D04 (inquiry rate limit + XSS)
- H02, H04 (OG + WhatsApp preview)
- K01–K10 (security posture)
- J01, J03 (performance Core Web Vitals)

---

## Result log

| Scenario ID | Tester | Device / Network | Build hash | Date | Result | Defect ID | Evidence |
|---|---|---|---|---|---|---|---|
| A01 |  |  |  |  |  |  |  |
| … |  |  |  |  |  |  |  |
| L03 |  |  |  |  |  |  |  |

---

## Sign-off

| Role | Name | Build hash | Date | Signature |
|---|---|---|---|---|
| Guest UAT Lead |  |  |  |  |
| Head of Growth / Marketing |  |  |  |  |
| SEO / Content Lead |  |  |  |  |
| Security Lead |  |  |  |  |
| QA Lead |  |  |  |  |

---

*End of Guest UAT*
