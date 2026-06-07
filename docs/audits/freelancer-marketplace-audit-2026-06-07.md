# Freelancer Marketplace — End-to-End Audit & Recommendations

- **Date:** 2026-06-07
- **Scope:** Full vertical slice of the **freelancer marketplace (M5)** — database &
  data model, backend handlers/services/repos, API contract, and frontend UI —
  across **listings, availability, hire requests, reviews, and inquiries**.
- **Out of scope:** **gear rentals** (`gear_*`, migration `000015`), **messaging**,
  and **moderation** — adjacent M5 sub-domains that warrant separate passes. The
  calendar (`events.availability` auto-block) and CRM links are referenced where
  they cross this boundary (see `calendar-audit-2026-06-07.md`,
  `crm-audit-2026-06-07.md`).
- **Type:** Read-only documentation audit (no live boot). Findings cite `file:line`.
  Backend/frontend gathered by parallel sub-audits; high-severity items re-verified.

---

## 1. Executive Summary

The freelancer marketplace has **the most complete backend of the three audited
domains and the least-connected frontend**, plus a **systemic authorization
weakness**: every row-level-security policy in M5 is **inert**, and one handler
trusts it — producing a real IDOR.

Five themes dominate:

1. **RLS is dead, and one handler relies on it.** All four M5 tables gate on
   `current_setting('app.current_user_id')`, which the middleware **never sets**;
   the app connects as the table-owner role with no `FORCE ROW LEVEL SECURITY`, so
   the policies are never evaluated. Authorization survives only via explicit
   handler `WHERE`/`if` checks — **except `UpdateInquiry`, which says "ownership
   verified via RLS" and therefore verifies nothing** (F-B6, IDOR).
2. **The whole hire lifecycle is backend-only.** `POST /hire`, `GET /hire-requests`,
   `PATCH /hire-requests/{id}/status`, and `POST /reviews` are fully implemented and
   tested in Go — and have **zero frontend**. Users can only send a free-text
   *inquiry*; they cannot actually hire, accept/decline, complete, or review
   (F-FE1). Two parallel contact mechanisms exist; only the weaker one is wired.
3. **Availability is decorative.** Hiring never checks or updates availability; the
   conflict check is gear-only; the marketplace's own `AutoBlockListingDate` is an
   explicit stub. `booked_dates` is fed **only** by a *different* module — the
   calendar's `autoBlockFreelancerDate` raw SQL (`calendar_handler.go:98`) — so the
   same concept has two divergent implementations and a freelancer can be hired for
   the same date N times (F-B3).
4. **Review integrity is broken.** Reviews are not gated on a completed hire, and
   `UNIQUE(booking_id, reviewer_id)` with a **nullable, FK-less** `booking_id` lets
   any user post **unlimited** reviews of any freelancer — directly driving public
   `rating_avg` (F-D2/F-B4).
5. **Read + create UI, with dead/duplicate pages.** No listing *editor* (the `/edit`
   route only creates), an **orphaned duplicate** `my-profile` page, availability
   logic copy-pasted 3×, and broad design-token/component-law violations (F-FE).

As with calendar/CRM, the notification, webhook, and event infrastructure already
exist and are **not** wired to hire/review/inquiry.

### Severity snapshot

| # | Layer | Finding | Severity |
|---|-------|---------|----------|
| F-D1 | DB/Backend | M5 RLS keys on `app.current_user_id` (never set); app runs as table owner, no `FORCE` → **RLS entirely inert** | **High (systemic)** |
| F-B6 | Backend | `UpdateInquiry` trusts the dead RLS (`// ownership verified via RLS`) → **IDOR**: any user edits any inquiry's status/reply | **High** |
| F-D2/F-B4 | DB/Backend | Reviews not gated on a hire + nullable FK-less `booking_id` → **unlimited duplicate / fake reviews** inflate ratings | **High** |
| F-B3 | Backend | Hire never checks/updates availability; conflict check is gear-only; auto-block is a stub → freelancer double-booking | **High** |
| F-B1 | Backend/API | **No DELETE/unpublish route** for a freelancer listing (repo method exists, unrouted) | **High** |
| F-FE1 | Frontend | Entire **hire lifecycle + review submission has no UI**; backend fully built & untapped | **High** |
| F-FE2 | Frontend | `/edit` is **create-only** — no real listing editor (can't edit title/rate/specializations after creation) | **High** |
| F-FE3 | Frontend | `marketplace/my-profile/page.tsx` is an **orphaned dead duplicate** (unreachable, raw-button-built) | **High** |
| F-B5 | Backend | `rating_avg`/`review_count` recompute is **non-transactional** (INSERT + UPDATE on pool) → drift under concurrency | **Med/High** |
| F-B7 | Backend | Hire status update is **non-atomic TOCTOU** (`SET status WHERE id`, no `AND status=expected`) → state-machine bypass | **Medium** |
| F-B8 | Backend | No notifications/emails/events/CRM-deal on hire/inquiry/review (infra exists) | **Medium** |
| F-A1 | API | Marketplace **absent from `docs/api/openapi.yaml`** (0 paths) | **Medium** |
| F-B2 | Backend | Destructive PUT (no partial update) blanks fields; `state_id` frozen after create | **Medium** |
| F-B9 | Backend | Weak validation: negative rate, free-text specializations, self-inquiry, bad enum → 500 | **Medium** |
| F-B10 | Backend | Pagination half-built (repo cursor exists; handlers cap 50, ignore params) | **Medium** |
| F-FE4 | Frontend | No rate-range filter, no pagination, sort hardcoded; availability logic duplicated 3× | **Medium** |
| F-FE5 | Frontend | `replyToInquiry` sends only `reply_message`, never `status` → can't accept/decline inquiry from client | **Medium** |
| F-B11 | Backend | Public availability endpoint lacks the `is_published` 404 guard → leaks unpublished freelancers' dates | **Medium** |
| F-D3 | DB | Polymorphic `marketplace_inquiries.listing_id` & `freelancer_reviews.booking_id` have **no FK** → orphans | **Low/Med** |
| F-B12 | Backend | No escrow/payment, KYC/verification, or search ranking; `compensation_paisa` recorded but never collected | **Strategic** |
| F-FE6 | Frontend | Design-law violations (raw `<button>`, arbitrary `min-h-[120px]`, inline color styles); `getFreelancer` no `res.ok` check | **Low** |

---

## 2. Database & Data Model

Tables (migration `000014_create_m5_marketplace_tables.up.sql`):
**`freelancer_listings`, `freelancer_reviews`, `marketplace_inquiries`,
`hire_requests`**. Indexing is good (GIN on `specializations`, partial published
index on `state_id, city`, per-participant indexes on inquiries/hire requests).

### F-D1 — RLS is inert across all of M5 *(High — systemic)*
Every policy keys on `current_setting('app.current_user_id', true)::uuid`
(`000014:33,37,62,88-89,118-119`). But:
- The middleware **never sets `app.current_user_id`** — it sets only
  `app.workspace_id`/`app.current_workspace_id` (`middleware/db_context.go:32-33`).
- The app pool connects as the **table-owner / migration role**, and **no migration
  applies `FORCE ROW LEVEL SECURITY`** to any M5 table. Postgres exempts table
  owners from RLS unless `FORCE` is set.

So the policies are **never evaluated** — which is also why the `''::uuid` cast on
the unset GUC never errors. This matches the project's known RLS-execution gap
(ADR-0001). **Net: M5 has no database-level isolation; safety rests entirely on
app-layer checks** — fine where those checks exist, catastrophic where they don't
(see F-B6). Fix: either wire `app.current_user_id` + `FORCE` + the NOBYPASSRLS
`rawdrive_app` login role, or delete the policies and the misleading comments so no
future handler trusts them.

### F-D2 — Review uniqueness is bypassable *(High)*
`freelancer_reviews` (`000014:40-49`): `booking_id UUID` is **nullable with no FK**,
and the only guard is `UNIQUE(booking_id, reviewer_id)`. Postgres treats NULLs as
distinct in a unique index, so a reviewer who omits `booking_id` (the common path)
can insert **unlimited** reviews of the same listing. Even a supplied `booking_id`
is never validated (no FK, no "belongs to a completed hire between these users"
check), so random UUIDs defeat the constraint at will. Combined with F-B4 (no
hire-gating) this means **any user can arbitrarily inflate/deflate any freelancer's
public rating**. Fix: FK `booking_id → hire_requests(id)`, require a `completed`
hire between reviewer and listing, and make uniqueness `(listing_id, reviewer_id)`
or `(booking_id)` non-null.

### F-D3 — Polymorphic soft links, no FK *(Low/Medium)*
`marketplace_inquiries.listing_id` (`000014:68`) is polymorphic across
freelancer/gear with **no FK**; `freelancer_reviews.booking_id` is FK-less.
Deleting a listing/booking orphans these rows silently. Consider per-type FK columns
or an enforced check.

### FK delete behavior
`hire_requests` FKs are all `ON DELETE CASCADE` (`000014:95-97`) — deleting a user
cascades their hire requests on both sides (aggressive but internally consistent).
`freelancer_listings.workspace_id` is indexed but **unused by RLS** (marketplace is
user/public-scoped) — clarify whether `workspace_id` carries any authorization
meaning here or is vestigial.

---

## 3. Backend

Files: `marketplace_handler.go`, `hire_request_handler.go`,
`repository/freelancer_repo.go`, `service/marketplace_service.go`; routes
`routes_m5.go`.

### Authorization
- **F-B6 — `UpdateInquiry` IDOR *(High)*.** `marketplace_handler.go:542-575` reads
  `userID` then `_ = userID // ownership verified via RLS`. RLS is inert (F-D1), and
  the repo writes (`freelancer_repo.go:285-298`) are **id-only, no participant
  filter** — so any authenticated user can `PUT /marketplace/inquiries/{id}` to
  change another conversation's `status` or inject a `reply_message`. Contrast the
  message endpoints, which correctly check `FromUserID/ToUserID`
  (`marketplace_handler.go:477,510`).
- **Positive:** listing write-ownership (`marketplace_handler.go:182`), availability
  write-ownership (`:284`), and hire-status authz (requester may only `cancel`;
  freelancer drives the rest, `hire_request_handler.go:144-159`) are all correctly
  enforced at the handler.

### Listings & availability
- **F-B1 — No DELETE/unpublish route *(High)*.** `FreelancerRepo.Delete` exists and
  is ownership-scoped (`freelancer_repo.go:115-125`) but is **never routed**
  (`routes_m5.go:79-83`) — unlike gear, which has `r.Delete` (`:87`). A freelancer
  can never delete a listing; unpublish requires a full destructive PUT.
- **F-B3 — Availability is non-functional at hire time *(High)*.** `SubmitHireRequest`
  (`marketplace_service.go:75-113`) performs **no availability/conflict check**;
  accepting/confirming (`UpdateHireStatus`, `:140-159`) never appends to
  `booked_dates`. `CheckBookingConflict` (`:240-255`) is **gear-only**. The
  marketplace `AutoBlockListingDate` is an explicit stub (`marketplace_handler.go:
  328-341`), and the owner availability PUT only writes `blocked_dates`, never
  `booked_dates`. **The only writer of `booked_dates` is a different module** — the
  calendar's `autoBlockFreelancerDate` raw SQL (`calendar_handler.go:98-113`). Two
  divergent implementations of one concept; neither is consulted when hiring →
  unlimited same-date double-booking.
- **F-B2 — Destructive PUT *(Medium)*.** `UpdateFreelancerListing`
  (`marketplace_handler.go:192-197`) overwrites all editable fields unconditionally
  with no empty-title guard (unlike create); `state_id` is omitted from the update
  SQL (`freelancer_repo.go:102-110`) so it's frozen at creation.
- **F-B11 — Unpublished availability leak *(Medium)*.** `GetFreelancerAvailability`
  (public, `routes_m5.go:40`) omits the `is_published` 404 guard that `GetFreelancer`
  has — anyone with a listing UUID reads an unpublished freelancer's dates/notes.

### Hire requests & reviews
- **F-B4 — Reviews ungated *(High)*.** `CreateFreelancerReview`
  (`marketplace_service.go:199-229`) checks rating range and self-review but **never
  verifies the reviewer completed (or had) a hire** — see F-D2.
- **F-B5 — Rating recompute not transactional *(Med/High)*.** `CreateReview`
  (`freelancer_repo.go:466-484`) does INSERT then a full re-aggregation UPDATE as
  **two separate pool `Exec`s** — concurrent inserts interleave (stale average), or
  the INSERT commits while the UPDATE fails → permanent `rating_avg`/`review_count`
  drift. Use one transaction or a trigger.
- **F-B7 — Hire status TOCTOU *(Medium)*.** Authz reads `current` via `GetHireRequest`
  (`hire_request_handler.go:139`); the service re-reads and writes
  (`marketplace_service.go:147,154`) with no tx/lock, and the SQL is unconditional
  `SET status WHERE id` (`freelancer_repo.go:406-410`) — no `AND status=expected`.
  Concurrent accept+cancel both pass their checks; the validated transition is
  violated. Add an optimistic guard.
- **Positive:** the hire state machine (`marketplace_service.go:117-125`) matches the
  DB CHECK and rejects invalid transitions (409); self-review and self-hire are
  blocked.

### Integration & quality
- **F-B8 — No side effects *(Medium)*.** Hire create/accept/complete, inquiry create,
  and review create fire **no** notification/email/webhook/NATS event and create no
  CRM deal/contact/calendar event. `M5Dependencies.Events` is wired only to
  messaging. The dispatcher + webhook infra already exist.
- **F-B9 — Validation gaps *(Medium)*.** Negative `daily_rate_paisa`/
  `compensation_paisa` accepted; `specializations` free-form; `inquiry_type`/`status`
  passed raw → DB CHECK 500s instead of 400; self-inquiry allowed; no message length
  caps; no rate limiting on inquiry/hire creation.
- **F-B10 — Pagination half-built *(Medium)*.** `FreelancerFilter.Cursor` exists
  (`freelancer_repo.go:165-168`) but `ListFreelancers` never reads it
  (`marketplace_handler.go:49-86`) → hard cap 50, no paging; hire/inquiry/review
  lists have none; `ListReviews` is unbounded (`freelancer_repo.go:486-489`).
- **F-B12 — No escrow/KYC/ranking *(Strategic)*.** `compensation_paisa` is recorded
  but never collected/held; no identity/business verification gates who can publish
  or be hired; "ranking" is plain `ORDER BY` with no relevance/full-text.

---

## 4. API Contract

### F-A1 — Marketplace undocumented in OpenAPI *(Medium)*
`docs/api/openapi.yaml` has **0** freelancer/marketplace/hire paths — the surface
lives only in `routes_m5.go`, undocumented and unguarded by the `openapi` CI gate
(same gap as calendar and CRM).

### Surface summary
Public: `GET /marketplace/freelancers`, `/{id}`, `/{id}/availability`. Authed:
listing create/update, availability update, my-listing, inquiries
create/list/update, inquiry messages, `POST /{id}/hire`, `GET /hire-requests`,
`PATCH /hire-requests/{id}/status`, `POST /{id}/reviews`. **Missing:** listing
DELETE (repo exists, unrouted), review pagination, a documented error contract.

---

## 5. Frontend

Pages under `app/(dashboard)/marketplace/*`; client `lib/api/marketplace.ts`;
marketing `app/marketplaces/freelancer/page.tsx`.

### Capability matrix (7 user actions)
browse+filter **YES** · view+availability **YES** · **send hire request NO** ·
**accept/decline/complete hire NO** · **leave review NO** · create/unpublish own
listing **PARTIAL** (create + publish toggle only) · set availability **YES**.

### F-FE1 — Hire lifecycle + reviews have no UI *(High)*
The backend `POST /hire`, `GET /hire-requests`, `PATCH …/status`, `POST …/reviews`
are fully built and tested (`hire_request_handler_test.go`), but a grep for
`hire-requests|/hire|/reviews|createReview` returns **zero** frontend matches.
`marketplace.ts` has **no helpers** for any of them. Users get only a free-text
*inquiry* (`freelancers/[id]/page.tsx:362`); the structured hire/accept/review flows
are dead code. There is **no freelancer-side hire inbox** at all.

### F-FE2 — `/edit` is create-only *(High)*
`freelancers/edit/page.tsx` (component `FreelancerProfileEditorPage`) only calls
`createFreelancerListing` (`:50`) — it never loads an existing listing or calls
`updateFreelancerListing`. `updateFreelancerListing` is only ever used to flip
`is_published` (`freelancers/page.tsx:107-114`). **There is no way to edit
title/rate/specializations/city/description after creation.**

### F-FE3 — Orphaned duplicate page *(High)*
`marketplace/my-profile/page.tsx` is a near-byte-identical third copy of the
my-profile tab logic, **unreachable** (nothing links to `/marketplace/my-profile`;
sidebar/hub point at `/marketplace/freelancers`), and built entirely from raw
`<div>`/`<button>` against the component law. Delete or wire+refactor.

### F-FE4 / F-FE5 — Interaction gaps *(Medium)*
- No rate-range filter UI though the client/back support `min/max_rate_paisa`
  (`marketplace.ts:72-73`); sort hardcoded `"rating"` (`freelancers/page.tsx:473`);
  **no pagination** (renders full array).
- Availability get/update have **no typed helper** — three pages hand-roll raw
  `fetch` to `.../availability` (logic duplicated 3×).
- `replyToInquiry` sends only `reply_message`, never `status`
  (`marketplace.ts:160`) → the accept/decline-inquiry transition is unreachable from
  the client.

### F-FE6 — Robustness & design-law *(Low)*
`getFreelancer` doesn't check `res.ok` (`marketplace.ts:100`); `listFreelancers`
swallows errors to `[]` (`:95`) so the browse error state is dead. Raw `<button>`
for actions (`freelancers/[id]/page.tsx:294,319,351,362,385,392`;
`edit/page.tsx:164,192,199`), arbitrary `min-h-[120px]` (`marketplace/page.tsx:20,
33,46`), and inline color styles (`edit/page.tsx:88-93`) violate the
GlassIconButton/token laws.

*(Marketing `marketplaces/freelancer/page.tsx` uses hardcoded sample cards by design
— SEO landing, no API. No action beyond noting it.)*

*(No N+1 per-row fetches; browse uses a single list call with id links.)*

---

## 6. Cross-Cutting: Two of Everything

- **Two contact mechanisms:** free-text **inquiries** (wired) vs structured **hire
  requests** (backend-only). The product funnel the schema implies (inquire → hire →
  complete → review) is broken in the middle because only inquiries reach the UI.
- **Two availability writers:** the calendar's real `autoBlockFreelancerDate`
  (`calendar_handler.go:98`) vs the marketplace's stub `AutoBlockListingDate` — and
  hiring consults neither.
- **Two review realities:** public, immutable ratings (`freelancer_reviews_public_
  read USING (true)`) driven by an **ungated, spoofable** write path — the worst
  combination for trust.
- **Notification/webhook/event infra** exists and is unused by hire/inquiry/review.

---

## 7. Prioritized End-to-End Roadmap

Dependency-ordered, independently-shippable, flag-gated slices (one unit per PR),
per repo law.

**P0 — Security & integrity (first):**
1. **F-B6** Fix the `UpdateInquiry` IDOR: enforce participant check in handler/repo
   `WHERE (from_user_id=$ OR to_user_id=$)`.
2. **F-D1** Decide RLS posture for M5: either wire `app.current_user_id` + `FORCE` +
   `rawdrive_app` role, or remove the dead policies/comments (do not leave handlers
   trusting them). Pair with calendar/CRM RLS work.
3. **F-D2/F-B4** Gate reviews on a `completed` hire + add `booking_id` FK + fix
   uniqueness → stop rating manipulation.
4. **F-B11** Add `is_published` guard to the public availability endpoint.

**P1 — Make hiring real (the headline gap):**
5. **F-B3** Availability/conflict check on hire; on accept/confirm append the date to
   `booked_dates`; unify the two auto-block implementations.
6. **F-B5/F-B7** Transactional rating recompute + optimistic hire-status guard
   (`AND status=expected`).
7. **F-FE1** Build the hire flow UI (hire button on detail + freelancer-side inbox
   calling `GET /hire-requests` + `PATCH …/status`) and review submission; add the
   missing `marketplace.ts` helpers.
8. **F-B8** Notifications/events on hire/inquiry/review (existing dispatcher +
   webhooks); optionally create a CRM deal on hire-completed.

**P2 — CRUD completeness & docs:**
9. **F-B1 + F-FE2** Route `DELETE`/unpublish; build a real listing editor (load +
   `updateFreelancerListing` for all fields).
10. **F-FE3** Delete or wire the orphaned `my-profile` page.
11. **F-A1** Document marketplace in `openapi.yaml` + contract tests.
12. **F-B2/F-B9** Partial-update PUT + validation (`400` not `500`); editable
    `state_id`.

**P3 — Scale & trust:**
13. **F-B10/F-FE4** Real pagination + rate/sort filters; typed availability helper
    (dedupe 3×).
14. **F-B12** Escrow/payment on `compensation_paisa`; KYC/verification gating;
    search ranking. **F-D3** real FKs for polymorphic links. **F-FE6** token/
    component-law cleanup + robust client error handling.

### Quick wins (high value / low effort)
F-B6 (one participant check — closes an IDOR), F-B11 (one guard), F-B4 gating, and
F-FE2 (wire the existing `updateFreelancerListing`) are cheap and high-impact.

---

## 8. Evidence Index

| Layer | Path |
|------|------|
| Schema | `migrations/000014_create_m5_marketplace_tables.up.sql` (listings `:5`, reviews `:40`, inquiries `:65`, hire_requests `:93`) |
| RLS (inert) | `000014:33,37,62,88,118`; setter omits user id `middleware/db_context.go:32-33`; ADR-0001 |
| Review uniqueness | `000014:44-48` |
| Routes | `handler/routes_m5.go:37-105` (no listing DELETE; hire/review routes `:101-105`) |
| Listings/availability | `handler/marketplace_handler.go` (`:182,:192,:244,:284,:328`); `repository/freelancer_repo.go` (`:102,:115,:165`) |
| Hire/reviews | `handler/hire_request_handler.go` (`:139,:144`); `service/marketplace_service.go` (`:75,:117,:140,:199,:240`); `repository/freelancer_repo.go:406,466` |
| Inquiry IDOR | `handler/marketplace_handler.go:542-575`; `repository/freelancer_repo.go:285-298` |
| Cross-module auto-block | `handler/calendar_handler.go:98-113` (real) vs `marketplace_handler.go:328-341` (stub) |
| Integration infra (unused) | `service/notification_delivery.go`; `handler/notification_dispatcher.go`; webhooks migration `042`; `M5Dependencies.Events` `routes_m5.go:22` |
| API contract | `docs/api/openapi.yaml` (no marketplace paths) |
| Frontend | `app/(dashboard)/marketplace/*` (page/freelancers/[id]/edit/my-profile); `lib/api/marketplace.ts`; marketing `app/marketplaces/freelancer/page.tsx` |

---

*Audit is documentation-only; no code was changed and no services were booted. Gear
rentals, messaging, and moderation are intentionally excluded — recommend separate
audits. To action, create the relevant GitHub Project #2 items and ship each slice
via `npm run ship` behind a feature flag.*
