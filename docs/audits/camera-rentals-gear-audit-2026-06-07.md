# Camera Rentals (Gear Marketplace) — End-to-End Audit, Connection Map & Data Model

- **Date:** 2026-06-07
- **Scope:** The **gear / camera-rentals marketplace (M5)** end-to-end — database & data
  model, backend handlers/repos/services, API contract, async/money flows, and the
  three frontend surfaces — **plus its logical connections** to the **business profile**
  (`workspaces`), the **photographer profile** (`photographer_profiles`), and every
  adjacent system a rental marketplace should touch (calendar, messaging, CRM,
  payments/escrow/payout, dealer program, KYC, moderation/disputes, notifications,
  reviews, public/SEO).
- **Companion docs:** `docs/audits/freelancer-marketplace-audit-2026-06-07.md` (the
  sibling M5 sub-domain) and `docs/superpowers/specs/2026-06-07-freelancer-profile-linkage-design.md`
  (the approved profile-linkage pattern this audit reuses for gear).
- **Type:** Read-only documentation audit (no live boot). Every claim cites `file:line`
  and the highest-severity / most structural findings were re-verified directly.

---

## 1. Executive summary

The camera-rentals feature is **further along than culling but is a disconnected
island**. Listings, bookings, an overlap check, owner/renter authorization, and a
working "request → approve/decline → return → complete" path all exist in Go and have
tests. But the feature is **architecturally isolated**: a one-line verification proves
that `gear_handler.go`, `gear_repo.go`, and `marketplace_service.go` contain **zero
references** to `photographer_profiles`, the business/workspace profile, `invoice`,
`payment`, `escrow`, `payout`, `dealer`, `contact`, `lead`, or `crm`.

Your instinct is correct and then some. Camera rentals **should** connect to the
business profile and the photographer profile — and today it connects to **neither**.
It re-types the owner's city, shows **no owner identity/trust** to the renter, and
carries money fields (`total_paisa`, `deposit_paisa`) that **never move** — no charge,
no deposit hold, no payout, no refund. Beyond the two profiles you named, a rental
marketplace logically wires into **eight more systems that all exist in this codebase
and are all unwired to gear**: calendar/availability, messaging threads, CRM
leads/deals, payments/payouts, the dealer commission program, KYC, dispute/moderation,
and notifications. The gear table even pre-declares an `availability_calendar` JSONB and
a `disputed` status + `return_photos` + `dispute_reason` — scaffolding for features that
were never built.

The fix is not new invention — it's **linkage**. The approved freelancer→profile
linkage design (single source of truth on `photographer_profiles`, derive by join,
opt-in toggle, thin link row) maps almost 1:1 onto gear and should be applied here.

### Severity snapshot

| # | Layer | Finding | Severity |
|---|-------|---------|----------|
| G-1 | DB/Backend | **Gear is unlinked to either profile.** No FK/join to `photographer_profiles` or `workspaces` business identity; owner is a bare `user_id`. Renter sees no name/rating/verified/business. | **High** |
| G-2 | Money | **Money fields are inert.** `total_paisa`/`deposit_paisa` are stored but never charged, held, released, refunded, or paid out; frontend hardcodes `deposit_paisa: 0`. | **High** |
| G-3 | DB/Backend | **M5 RLS is inert** (keys on `app.current_user_id`, never set; app runs as table owner, no `FORCE`). Gear policies never evaluate; authz survives only via explicit handler checks. | **High (systemic)** |
| G-4 | Backend | **No booking state machine.** `UpdateBookingStatus` validates the target status against an enum whitelist but **not** the transition from the current state — `declined → approved`, `completed → pending` are all accepted. | **High** |
| G-5 | Backend | **Availability is non-atomic & narrow.** The overlap check and the `is_available` flip are separate statements (race window); `availability_calendar` JSONB is never populated; no cross-check against the **events calendar** → a photographer can double-book a shoot and a rental. | **Med-High** |
| G-6 | Frontend | **Three surfaces, two are dead stubs.** `camera-rentals` (canonical, design-compliant) vs `gear` + `my-gear` (orphaned duplicates; `gear/page.tsx` violates the design-system test). | **Med** |
| G-7 | Frontend | **No owner identity on the listing detail**; **city re-typed** on create/edit (never pre-filled from a profile); booking shows no real conflict feedback. | **Med** |
| G-8 | Connections | **Unwired to 8 adjacent systems that exist:** calendar, messaging, CRM, payments/payouts, dealer program, KYC, dispute/moderation, notifications. | **Med** |
| G-9 | Backend | **No gear reviews/ratings** (freelancers have `freelancer_reviews`; gear has nothing) → no trust signal loop. | **Med** |
| G-10 | Backend | **No input bounds** on `price_paisa`/`total_paisa`/`deposit_paisa` (negative/unbounded accepted); no notifications; no plan/role gating; no SEO surface. | **Low** |

---

## 2. What exists today (verified)

**Schema** (`000015_create_m5_gear_tables.up.sql`): `gear_listings` (`user_id`,
`workspace_id`, `state_id`→`states`, `listing_type` rental|sale, `title`, `category`,
`brand`, `model`, `condition`, `price_paisa`, `description`, `images`, `city`,
`is_published`, `is_available`, `availability_calendar` JSONB) and `gear_bookings`
(`gear_listing_id`, `renter_id`, `owner_id`, `start_date`, `end_date`, `total_paisa`,
`deposit_paisa`, `status` pending|approved|declined|active|returned|disputed|completed,
`owner_message`, `renter_message`, `return_photos`, `dispute_reason`).

**API** (`routes_m5.go`, `gear_handler.go`):
- Public: `GET /api/v1/marketplace/gear` (`ListGear`), `GET …/gear/{id}` (`GetGear`).
- Auth: `POST …/gear` (`CreateGearListing`), `PUT …/gear/{id}` (`UpdateGearListing`),
  `DELETE …/gear/{id}` (`DeleteGearListing`), `GET /api/v1/gear/mine` (`GetMyGear`).
- Bookings: `POST …/gear/{id}/bookings` (`CreateBooking`), `PUT …/gear/bookings/{bookingId}`
  (`UpdateBookingStatus`).

**What works:** ownership is enforced explicitly in every gear handler (so the inert RLS
doesn't produce an IDOR *here* — unlike the freelancer `UpdateInquiry` case); a
booking-overlap check exists (`gear_repo.go:319-332`, wired at `routes_m5.go:62-65`,
returns 409); category/condition/status/date enums are validated; content is screened
into the moderation queue on create (`gear_handler.go:162-188`).

---

## 3. The core thesis — linkage to the two profiles (your ask)

### 3.1 Business profile (the studio's legal/commercial identity)
Business identity lives **on the `workspaces` row** (no separate table): `name`,
`gstin`, `state_code`, address lines, `city`, `postal_code`, `phone`, `email`,
`website`, `logo_url`, `brand_name`, banking (`bank_*`), invoicing (`invoice_terms`,
`invoice_footer`, `upi_id`, `pan_number`), `plan_tier` (migrations 005/068/073/044).
Edited at `settings/business`.

**Gap:** a gear rental is a **commercial transaction** that should invoice under the
studio's legal name + GSTIN and (for B2B) carry tax identity. Gear listings carry
`workspace_id` but **never read any of these business fields** — no legal name on the
listing, no GSTIN on any (non-existent) invoice, no banking for payout.

### 3.2 Photographer profile (the public trust identity)
`photographer_profiles` (migration 163, ~99 cols) already holds everything a rental
listing needs to establish trust: `display_name`, `avatar_cropped_url`,
`average_rating`, `status` (draft/published = a "verified profile exists" signal),
`primary_city`/`state`/`covered_cities[]`, `years_experience`, `total_weddings_shot`,
`primary_phone`/`whatsapp_number`, plus a public `url_slug` (`/p/{slug}`). Notably it
**already resolves the business identity at read time** via
`applyWorkspaceBusinessProfile` (`photographer_profile_repo.go:453-496`), which injects
`workspaces.brand_name`/`gstin`/address into the profile response — so the profile is
the natural single junction of *both* identities.

**Gap:** verified by grep — **no gear query references `photographer_profiles`**. The
listing detail page renders title/brand/condition/price/city and **no owner block at
all** (`gear/[id]/page.tsx`): no name, avatar, rating, verified badge, or link to
`/p/{slug}`. The marketplace hub copy promises "rent … from other photographers near
you," but the renter cannot see *which* photographer, their reputation, or their
location-as-identity. For a ₹2–5L camera body this is the single biggest trust defect.

### 3.3 The duplication / re-entry problem (same as freelancers)
Just like `freelancer_listings`, `gear_listings` re-enters `city` and `state_id` that
already exist (more canonically) on the owner's profile/workspace, and they drift
independently. The create/edit form (`gear/new`, `gear/[id]/edit`) makes the user
**re-type city** with a generic `"Berlin"` placeholder, never pre-filling from
`primary_city`/business `city`. The approved freelancer-linkage spec already solved this
shape; §6 below applies it to gear.

---

## 4. "Did I miss any?" — the full connection map

You named two (business + photographer profile). A rental marketplace logically
connects to **ten** systems. All ten exist in this codebase; **gear is wired to none of
them** beyond bare `user_id`/`workspace_id` FKs. Present vs. missing:

| # | System | Exists in repo? | Wired to gear? | What's missing |
|---|--------|-----------------|----------------|----------------|
| 1 | **Photographer profile** | ✅ `photographer_profiles` (163) | ❌ | Owner identity/rating/verified/city/slug on listing |
| 2 | **Business profile** | ✅ `workspaces` business fields | ❌ | Legal name + GSTIN for invoicing; banking for payout |
| 3 | **Calendar / availability** | ✅ `events`, `autoBlockFreelancerDate` (`calendar_handler.go:93-114`) | ❌ | Booking never creates/blocks a calendar event; `availability_calendar` JSONB never populated; no shoot-vs-rental conflict check |
| 4 | **Messaging** | ✅ full channels/threads/SSE (`messaging_handler.go`) | ❌ | Booking negotiation is two single-shot text columns (`owner_message`/`renter_message`), not a thread/channel |
| 5 | **CRM** | ✅ `leads`/`contacts`/`deals`/`follow_ups` (021) | ❌ | Renter never captured as a lead/contact; rental never a deal; no revenue rollup |
| 6 | **Payments / escrow** | ✅ `invoices`/`payments` (`payment_handler.go`) | ❌ | No invoice on booking; deposit never held/released; FE hardcodes `deposit_paisa:0` |
| 7 | **Payouts / dealer program** | ✅ `dealers`/`payouts`/`margin_ratios` (026/028) | ❌ | No payout for completed rentals; gear not a `product_type`; no dealer attribution/commission |
| 8 | **KYC / verification** | ✅ `kyc_documents` (047) | ❌ | KYC is **dealer-scoped only**; high-value gear owners/renters are unverified |
| 9 | **Moderation / disputes** | ✅ moderation queue supports `gear` content (017/030); `disputed` status + `return_photos` + `dispute_reason` columns | ⚠️ listing-create screening only | **No dispute handler at all** — disputed bookings dead-end; deposit can't be held; no resolution workflow |
| 10 | **Notifications / email** | ✅ dispatcher with a `bookings` category; email templates infra | ❌ | Zero emails/notifications on request/approve/decline/return/dispute/complete — the whole lifecycle is silent |
| — | **Reviews / ratings** | ✅ `freelancer_reviews` (014) | ❌ (no gear equivalent) | No `gear_reviews`; no trust feedback loop; nothing feeds owner rating |
| — | **Public / SEO** | ✅ public gallery + profile SEO (`url_slug`, `meta_*`) | ⚠️ public GET routes only | No canonical URLs, no JSON-LD rental schema, no public owner page link |

**Orphaned scaffolding already in the schema** (built-for, never-wired): `gear_listings.availability_calendar`, `gear_bookings.{disputed status, return_photos, dispute_reason}`. These are explicit "TODO in DDL" signals.

---

## 5. Layer-by-layer findings

### 5.1 Backend service / repo (`gear_handler.go`, `gear_repo.go`, `marketplace_service.go`)
- **F-5.1.1 (High)** No state-machine on `UpdateBookingStatus`: target status checked against `{approved,declined,active,returned,disputed,completed}` but not against the current status → illegal transitions accepted; `is_available` can be flipped from any state.
- **F-5.1.2 (Med-High)** Availability is two statements, not one transaction: overlap-check on create, then a separate `UPDATE gear_listings SET is_available` on approve whose error is logged and swallowed (200 still returned, F-068 test documents the swallow). Concurrent approvals/bookings have a race window. `availability_calendar` JSONB is never read or written — `is_available` is a single coarse boolean.
- **F-5.1.3 (High)** No profile/business join (grep-verified): listing read returns gear fields + bare `user_id`; no owner hydrate.
- **F-5.1.4 (Med)** No reviews/ratings for gear; `CreateFreelancerReview` exists but no gear analogue.
- **F-5.1.5 (Low)** No bounds on `price_paisa`/`total_paisa`/`deposit_paisa` (negative/huge accepted); no length caps on text; no plan/role gating on listing.
- **F-5.1.6 (Low)** No notifications/email on any booking transition (grep: zero `email`/`notify` in gear files).

### 5.2 Money / payments (verified isolated)
- **F-5.2.1 (High)** `total_paisa`/`deposit_paisa` are accepted from the client, stored, and never reconciled with any payment. No invoice generated, no charge, no deposit escrow hold/release, no refund on decline, no owner payout. Frontend booking sends `deposit_paisa: 0` and the UI copy admits "RawDrive sends the booking request with a zero deposit and lets the owner confirm that manually" (`gear/[id]/book/page.tsx:106,294`). **The rental is a free, unsecured reservation.**

### 5.3 Database / data-model
- **F-5.3.1 (High)** Identity gap (no `profile_id`); duplicated geo (`city` text + `state_id`); no `meta_*`/`url_slug` for SEO; no `gear_reviews`; no money-state columns (`payment_status`, `invoice_id`, deposit hold/release).
- **F-5.3.2 (High, systemic)** Gear RLS policies key on `current_setting('app.current_user_id')` which the middleware never sets, and the app connects as the table owner without `FORCE ROW LEVEL SECURITY` → policies are dead weight (same root cause as the freelancer audit's F-D1). Indexes themselves are reasonable (`idx_gear_listings_state_type` partial on published; `idx_gear_bookings_dates` partial on active statuses).
- **Strength** FK hygiene: `gear_bookings.gear_listing_id ON DELETE CASCADE`; listing FKs to users/workspaces cascade.

### 5.4 Frontend (three surfaces)
- **F-5.4.1 (Med)** `camera-rentals/page.tsx` is the canonical, design-system-compliant hub (tabs: Gear Rental / My Gear) and the only sidebar entry. `gear/page.tsx` and `my-gear/page.tsx` are **orphaned duplicates**; `gear/page.tsx` **fails** the `camera-rentals-design-system.test.ts` contract (uses forbidden `rounded-2xl`/`bg-surface-raised`/`animate-pulse`/`*-feedback-error` inline classes). The marketplace hub confusingly links both `camera-rentals` and `gear`.
- **F-5.4.2 (Med)** Listing detail shows **no owner block**; create/edit **re-types city** (never pre-filled from profile/business); booking has **no real conflict feedback** (only checks the single `is_available` boolean), no deposit/payment step.
- **F-5.4.3 (Low)** A11y: a ~28px delete touch target in `my-gear`, date inputs missing `aria-label`, "Back" buttons unlabeled.
- **F-5.4.4 (Low)** Settings ↔ marketplace are unlinked: neither `settings/business` nor `settings/profile` mentions gear or offers a "list your gear / manage rentals" entry, even though both hold the city the listing form makes you re-type.

---

## 6. Target data model (recommended)

Apply the **approved freelancer→profile linkage pattern** to gear, then add the money,
review, and connection columns. All additive; column drops happen in a follow-up slice
after dual-read (per AGENTS.md append-only migration law; assign `NNN` against
`origin/main` at implementation time).

### 6.1 Profile becomes the source of truth for owner identity + geo
```sql
-- photographer_profiles: canonical geo (shared with the freelancer-linkage spec) + rental opt-in
ALTER TABLE photographer_profiles
  ADD COLUMN IF NOT EXISTS state_id            INTEGER REFERENCES states(id),
  ADD COLUMN IF NOT EXISTS rents_gear          BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_photographer_profiles_rents_gear
  ON photographer_profiles (state_id) WHERE rents_gear = true;
```

### 6.2 Gear listing links to the profile; stops re-typing identity/geo
```sql
ALTER TABLE gear_listings
  ADD COLUMN IF NOT EXISTS profile_id     UUID REFERENCES photographer_profiles(profile_id) ON DELETE SET NULL,
  -- SEO / discovery (mirror photographer_profiles)
  ADD COLUMN IF NOT EXISTS url_slug       VARCHAR(120) UNIQUE,
  ADD COLUMN IF NOT EXISTS meta_title     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS meta_description VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_gear_listings_profile ON gear_listings (profile_id);
-- Read path JOINs photographer_profiles for: display_name, avatar_cropped_url,
-- average_rating, status(verified), primary_city/state/state_id, url_slug(/p/{slug}),
-- and (via applyWorkspaceBusinessProfile) the workspace legal name + GSTIN for invoices.
-- `city`/`state_id` on gear_listings become derived/legacy (dropped in a follow-up slice).
```

### 6.3 Make money real (escrow + payout + invoice link)
```sql
ALTER TABLE gear_bookings
  ADD COLUMN IF NOT EXISTS invoice_id     UUID REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid','authorized','paid','deposit_held','refunded','partially_refunded','disputed_hold')),
  ADD COLUMN IF NOT EXISTS deposit_released_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS channel_id     UUID REFERENCES channels(id),   -- messaging thread
  ADD COLUMN IF NOT EXISTS deal_id        UUID REFERENCES deals(id);      -- CRM linkage
```

### 6.4 Gear reviews (trust loop, mirrors freelancer_reviews — gated on a completed booking)
```sql
CREATE TABLE gear_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES gear_bookings(id) ON DELETE CASCADE,
  listing_id   UUID NOT NULL REFERENCES gear_listings(id) ON DELETE CASCADE,
  reviewer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, reviewer_id)          -- one review per completed booking (NOT nullable/FK-less — avoids the freelancer F-D2 fake-review bug)
);
CREATE INDEX idx_gear_reviews_listing ON gear_reviews (listing_id);
```

### 6.5 Connection map (present FK = solid; recommended = dashed)
```
                         ┌────────────────────┐
                         │  photographer_      │  display_name, avatar, average_rating,
        ┌────profile_id──│  profiles (163)     │  status(verified), state_id, url_slug
        ┊ (NEW)          └─────────┬──────────┘
        ┊                          │ workspace_id (resolves business identity at read)
   ┌────▼─────────┐                ▼
   │ gear_listings│──user_id────► users        workspaces ──gstin/brand_name/bank_*──► invoices
   │  (000015)    │──workspace_id─► workspaces                                            ▲
   └────┬─────────┘                                                                       ┊ invoice_id (NEW)
        │ gear_listing_id                                                                 ┊
   ┌────▼─────────┐  renter_id/owner_id ► users                                           ┊
   │ gear_bookings│┄┄invoice_id┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘
   │  (000015)    │┄┄channel_id┄┄► channels (messaging)      ┄┄payouts (028, dealer)
   │              │┄┄deal_id┄┄┄┄► deals (CRM 021)            ┄┄events (calendar block)
   └────┬─────────┘                                          ┄┄moderation_items('gear', dispute)
        │ booking_id (NEW)
   ┌────▼─────────┐
   │ gear_reviews │  (NEW)  → feeds photographer_profiles.average_rating
   └──────────────┘
   Solid = existing FK.  ┄┄ / NEW = recommended linkage (currently absent).
```

---

## 7. Remediation roadmap (flag-gated, one-unit-per-PR per AGENTS.md; track on Project #2)

**Phase 0 — Safety & correctness (do first)**
1. Booking **state machine** (legal transitions only) + make approve/return atomic in one tx. *(F-5.1.1/2)*
2. Input bounds on price/total/deposit; validate `top`-style params. *(F-5.1.5)*
3. Decide RLS posture for M5 (set `app.current_user_id` + `FORCE`, or formally retire RLS and rely on handler checks) — shared fix with the freelancer audit. *(G-3)*

**Phase 1 — Linkage to the two profiles (your ask)**
4. Schema §6.1–6.2 (additive): `profile_id` + profile geo/opt-in; backfill from `(user_id, workspace_id)`.
5. Backend read: JOIN `photographer_profiles` (+ workspace business identity) → owner block (name, avatar, rating, verified, city, `/p/{slug}`, legal name/GSTIN).
6. Frontend: render the owner block on listing detail; **pre-fill city from profile**; remove the create/edit city re-type; follow-up migration drops `gear_listings.city`/`state_id`.
7. Settings: add "Manage gear rentals" entry from `settings/profile` & `settings/business`; a `rents_gear` opt-in on the profile editor.

**Phase 2 — Make money real**
8. Schema §6.3; generate an invoice on booking; hold the security deposit (escrow); release on `completed`/refund on `declined`; owner payout (route through the dealer `margin_ratios`/`payouts` rails where applicable). *(G-2, conn #6/#7)*

**Phase 3 — Wire the connections**
9. Calendar: booking creates/blocks an event; cross-check shoot vs rental; populate `availability_calendar`. *(conn #3)*
10. Messaging: auto-create a renter↔owner channel per booking (`channel_id`); retire the two single-shot message columns. *(conn #4)*
11. CRM: capture renter as contact + rental as deal; roll revenue into `contacts.total_revenue_paisa`. *(conn #5)*
12. Notifications: emails/SSE on every booking transition via the `bookings` category. *(conn #10)*
13. Disputes: real handler for `disputed` (escalate to moderation, hold deposit, resolve, release). *(conn #9)*

**Phase 4 — Trust & discovery**
14. `gear_reviews` (§6.4) gated on a completed booking; feed owner rating.
15. KYC gate for high-value rentals (extend KYC beyond dealers or add a user-level verification). *(conn #8)*
16. SEO: canonical gear URLs + JSON-LD rental schema; public owner link. *(public/SEO)*

**Phase 5 — Consolidation**
17. Delete the dead `gear/page.tsx` + `my-gear/page.tsx` surfaces; keep `camera-rentals` as the single hub; fix the design-test violations and a11y. *(G-6/G-7)*

---

## 8. Evidence appendix (primary citations)

- **Isolation (grep, zero hits):** `gear_handler.go` / `gear_repo.go` / `marketplace_service.go` contain no `photographer_profile|workspace_profile|profile_id|invoice|payment|escrow|payout|dealer|contact|lead|crm`.
- **Schema:** `backend/internal/database/migrations/000015_create_m5_gear_tables.up.sql` (listings/bookings, RLS on `app.current_user_id`).
- **Handlers/routes:** `backend/internal/handler/gear_handler.go:43-410`; `backend/internal/handler/routes_m5.go:33-125` (public vs auth, conflict-check wiring `:62-65`).
- **Repo:** `backend/internal/repository/gear_repo.go:319-332` (overlap check), `:307-312` (status update).
- **Money (inert):** `frontend/src/app/(dashboard)/marketplace/gear/[id]/book/page.tsx:106,294` (`deposit_paisa:0` + admission copy); no `invoice/payment` link in any gear file.
- **Profiles:** `photographer_profiles` migration `163`; business identity on `workspaces` (`005/068/073/044`); read-time business merge `backend/internal/repository/photographer_profile_repo.go:453-496`.
- **Adjacent systems:** dealer/payout `026/028`, coupons `027`, sub-dealers `116`, KYC `047` (`dealer_id`-scoped), CRM `021`, moderation `000017/030` (support `gear` content), calendar `calendar_handler.go:93-114` (freelancer auto-block, no gear), messaging `messaging_handler.go`.
- **Frontend surfaces/design test:** `frontend/src/app/(dashboard)/marketplace/{camera-rentals,gear,my-gear,gear/new,gear/[id],gear/[id]/edit,gear/[id]/book}/page.tsx`; `…/camera-rentals/__tests__/camera-rentals-design-system.test.ts`.
- **Companion:** `docs/audits/freelancer-marketplace-audit-2026-06-07.md`; `docs/superpowers/specs/2026-06-07-freelancer-profile-linkage-design.md`.

---

*Prepared as a read-only audit. No source files were modified and the application was not
booted. All `file:line` references were verified against the working tree at the time of
writing (branch `main`). Sub-domain detail was gathered by parallel sub-audits;
high-severity and structural findings (profile/business isolation, inert money, missing
state machine) were re-verified directly.*
