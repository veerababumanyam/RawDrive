# Photographer / Studio Owner — User Acceptance Testing

**Persona:** Photographer / Studio Owner (primary paying user)
**Requirements source:** `docs/TechnicalRequirements/Photographer-Requirements.md` (FR-PHO-*, BR-PHO-*, AC-PHO-*)
**Primary handles under test:** `@pho_pro` (default), `@pho_starter`, `@pho_business`, `@pho_trial`, `@pho_hold`
**Build under test:** v0.0.40 (M17 Hardening Wave 5)
**Owner:** Head of Creator Experience
**Read first:** [`README.md`](README.md) — environment, seed accounts, photo fixtures, priority definitions

---

## Table of Contents

1. [Scope & exit criteria](#1-scope--exit-criteria)
2. [Pre-flight checks](#2-pre-flight-checks-run-once-per-cycle)
3. [Module A — Registration, OTP, activation](#module-a--registration-otp-activation-a01-a08)
4. [Module B — Onboarding funnel](#module-b--onboarding-funnel-b01-b10)
5. [Module C — Authentication & MFA](#module-c--authentication--mfa-c01-c09)
6. [Module D — Workspace shell & navigation](#module-d--workspace-shell--navigation-d01-d07)
7. [Module E — Galleries (create, cover, share, settings)](#module-e--galleries-e01-e18)
8. [Module F — Uploads, derivatives, storage](#module-f--uploads-derivatives-storage-f01-f12)
9. [Module G — Assets, search, face groups](#module-g--assets-search-face-groups-g01-g10)
10. [Module H — Albums & spread designer](#module-h--albums--spread-designer-h01-h07)
11. [Module I — CRM, contracts, invoicing](#module-i--crm-contracts-invoicing-i01-i12)
12. [Module J — Calendar & Google sync](#module-j--calendar--google-sync-j01-j08)
13. [Module K — Proofing workflow](#module-k--proofing-workflow-k01-k08)
14. [Module L — Public profile, freelancer, rentals](#module-l--public-profile-freelancer-rentals-l01-l09)
15. [Module M — Live streaming](#module-m--live-streaming-m01-m06)
16. [Module N — AI Hub](#module-n--ai-hub-n01-n08)
17. [Module O — Analytics](#module-o--analytics-o01-o05)
18. [Module P — Billing, plans, storage quota](#module-p--billing-plans-storage-quota-p01-p12)
19. [Module Q — Team management (Business+)](#module-q--team-management-business-q01-q06)
20. [Module R — Settings: branding, security, privacy](#module-r--settings-branding-security-privacy-r01-r09)
21. [Module S — Restricted actions (negative)](#module-s--restricted-actions-negative-s01-s08)
22. [Module T — Cross-persona flows](#module-t--cross-persona-flows-t01-t05)
23. [Regression gate](#regression-gate-run-every-cycle)
24. [Result log](#result-log)
25. [Sign-off](#sign-off)

---

## 1. Scope & exit criteria

### In scope
All photographer-facing features shipped through v0.0.40 (M1–M17 wave 5). This covers: onboarding, galleries, uploads, CRM, contracts, calendar, AI hub, albums, live streaming, public profile, billing, team, and settings.

### Out of scope (feature-gap registry)
- Order lifecycle state machine (capture, refund, fulfilment) — deferred, tracked in `project_m14_deferred_order_lifecycle` memory.
- i18n / client-gallery localisation — deferred milestone, no testing required for v0.0.40.
- Standalone `/upload` sidebar entry — **must not exist**; if seen, file as a defect per §22.

### Exit criteria
- **P0:** 100 % pass.
- **P1:** ≥ 95 % pass; failures logged with triage owner.
- **P2:** ≥ 85 % pass.
- Every P0 scenario has a captured screenshot or network trace in `docs/uat/results/<cycle>/`.
- Cross-persona scenarios in §22 executed with Client and Dealer testers on the line.

---

## 2. Pre-flight checks (run once per cycle)

| # | Check | Expected |
|---|---|---|
| PF-01 | `docker compose ps` | postgres, valkey, nats, mailpit all `Up (healthy)` |
| PF-02 | `curl -sf http://localhost:8080/api/v1/health` | `{"status":"ok"}` with dependency block showing R2 reachable |
| PF-03 | Backend log scan for `STORAGE_DRIVER=local` | **Must be absent.** If present, environment is invalid — stop. |
| PF-04 | Frontend `http://localhost:3000` loads landing page | RawDrive landing, not a dev error page |
| PF-05 | Mailpit `http://localhost:8025` reachable | Empty inbox ready to receive |
| PF-06 | Run `go run ./backend/seeds/...` | All @handles in README §4 exist, no errors |
| PF-07 | R2 sandbox bucket reachable via admin settings ping | Green status |
| PF-08 | PhonePe sandbox `/v1/status` reachable | 200 OK |

If any pre-flight fails, halt and repair before running scenarios.

---

## Module A — Registration, OTP, activation (A01–A08)

| ID | P | Title |
|---|---|---|
| A01 | P0 | New photographer self-registration issues OTP email |
| A02 | P0 | OTP verification activates account and lands on `/onboarding/state` |
| A03 | P1 | Expired OTP (>10 min) shows "code expired — resend" and new OTP works |
| A04 | P1 | OTP cooldown: rapid resend (<30s) shows cooldown message |
| A05 | P0 | Duplicate email registration is rejected with actionable message |
| A06 | P1 | Weak password (< policy) blocked at form-level before submit |
| A07 | P1 | Consent checkboxes must all be ticked before submit enabled |
| A08 | P0 | Registration is the **only** code path that uses email OTP — login must not |

### A01 — New photographer self-registration issues OTP email
- **Priority:** P0
- **Requirement refs:** FR-PHO-ONB-001, AC-PHO-001, `project_auth_model`
- **Preconditions:** logged out, mailpit empty.
- **Test data:** email `uat.new.pho+<cycle>@rawdrive.test`, name `Test Photographer`.
- **Steps:**
  1. Navigate to `/register`.
  2. Enter name, email, password `Uat-new-pho-2026!`, tick all consents, submit.
  3. Open mailpit `http://localhost:8025`.
- **Expected result:** UI lands on `/activate` page with "we sent a code to …" masked-email confirmation. Mailpit shows exactly one email with a 6-digit OTP, subject begins with "Activate your RawDrive account".
- **Pass criteria:** OTP email received within 30 s; masked email matches entered email.

### A02 — OTP verification activates account
- **Priority:** P0
- **Refs:** FR-PHO-ONB-002
- **Preconditions:** A01 complete, OTP captured from mailpit.
- **Steps:**
  1. On `/activate`, enter the 6-digit OTP.
  2. Submit.
- **Expected:** redirected to `/onboarding/state`; backend log shows `email_verified=true`; `users.email_verified_at` set.
- **Pass:** land on state picker with progress indicator "Step 1 of 5".

### A03 — Expired OTP flow
- **Priority:** P1. **Steps:** wait 11 minutes after A01; attempt A02. **Expected:** "Code expired — Resend". Click Resend → new OTP arrives; previous code now rejected with "code is invalid or already used".

### A04 — OTP resend cooldown
- **Priority:** P1. Trigger Resend twice in under 30 s. **Expected:** second attempt shows "Please wait X seconds" and no new mailpit email. No server error.

### A05 — Duplicate email
- **Priority:** P0. Register again with `@pho_pro`'s email. **Expected:** form error "This email is already registered — try logging in". No OTP sent.

### A06 — Weak password block
- **Priority:** P1. Enter `password`. **Expected:** client-side validation blocks submit, server never called. Accessible error tied to the field via `aria-describedby`.

### A07 — Consents mandatory
- **Priority:** P1. Untick one consent. **Expected:** submit button disabled; tooltip explains which consent is missing.

### A08 — Login is password-only (critical boundary)
- **Priority:** P0
- **Refs:** `feedback_auth_model`, AGENTS.md §Auth Model
- **Steps:** Log out of `@pho_pro`. Go to `/login`. Enter correct email and password.
- **Expected:** Authenticated and redirected to `/dashboard` **without** any OTP challenge screen. If the UI ever shows an email-OTP prompt on `/login`, that is a P0 defect.
- **Note:** TOTP MFA *is* acceptable here and covered in Module C.

---

## Module B — Onboarding funnel (B01–B10)

Flow: state → plan → coupon → payment → consents → welcome.

| ID | P | Title |
|---|---|---|
| B01 | P0 | Mandatory state selection — cannot skip |
| B02 | P1 | State list includes all 28 states + 8 UTs, searchable |
| B03 | P0 | Plan picker shows Starter/Pro/Business with entitlements |
| B04 | P1 | Optional coupon field accepts dealer coupon (`@dealer_tg`'s) |
| B05 | P1 | Invalid coupon shows inline error, does not block funnel |
| B06 | P0 | PhonePe sandbox payment completes and mandate created |
| B07 | P0 | Mid-funnel exit + re-login resumes at last incomplete step |
| B08 | P1 | All consents logged to audit trail on completion |
| B09 | P0 | Completed onboarding lands on `/dashboard` welcome variant |
| B10 | P1 | Direct navigation to `/dashboard` before onboarding complete → redirect to next step |

### B01 — State selection is mandatory
- **Priority:** P0. **Refs:** FR-PHO-ONB-001, AC-PHO-001.
- **Steps:** register via A01+A02. Attempt to navigate to `/onboarding/plan` directly or to `/dashboard`.
- **Expected:** redirected back to `/onboarding/state` every time. Back button does not expose Skip.
- **Pass:** no workspace access until a state is chosen.

### B06 — PhonePe mandate completion
- **Priority:** P0. **Refs:** FR-PHO-BIL-001.
- **Preconditions:** PhonePe sandbox configured in `platform_settings` (verified in PF-07/PF-08).
- **Test data:** Plan = Professional, no coupon.
- **Steps:** choose Professional → Continue → Pay on PhonePe sandbox → use sandbox test card / UPI → return to RawDrive.
- **Expected:** success page, `subscriptions.status=active`, `mandates.state=active`, webhook received, audit entry `payment.mandate.created`.
- **Pass:** after return, `/dashboard` accessible and plan badge shows "Professional".

### B07 — Mid-funnel resume
- **Priority:** P0. **Refs:** FR-PHO-ONB-002.
- **Steps:** start onboarding, complete state + plan, close browser before payment. Log back in.
- **Expected:** login lands on `/onboarding/payment`, not dashboard, not state picker.

*(B02–B05, B08–B10 follow the same table format — see tester execution template in §24.)*

---

## Module C — Authentication & MFA (C01–C09)

| ID | P | Title | Ref |
|---|---|---|---|
| C01 | P0 | Password login for active account → dashboard | AGENTS.md |
| C02 | P0 | Wrong password 5× triggers rate limit / lockout | — |
| C03 | P0 | Unverified account blocked with 403 "account not activated" | — |
| C04 | P1 | Forgot password emails reset link; link consumed on use | — |
| C05 | P0 | Enrolling TOTP: `/auth/mfa/enroll` → QR → verify-enrollment returns recovery codes **shown once** | AGENTS.md Auth Model |
| C06 | P0 | Enrolled user: `/auth/login` returns 401 `mfa_required` with short-lived token | — |
| C07 | P0 | `/auth/verify-totp` completes login; JWT has `mfa_verified: true` | — |
| C08 | P1 | Refresh rotation preserves `mfa_verified` via `refresh_sessions.mfa_verified` | — |
| C09 | P1 | Recovery code consumed on use; cannot be reused | — |

### C05 — Enrol TOTP, recovery codes shown once
- **Priority:** P0.
- **Steps:** as `@pho_pro` (no MFA yet): Settings → Security → Enable 2FA. Scan QR in Authenticator. Enter first code.
- **Expected:** enrolment verified; ten recovery codes shown in a modal with "These will not be shown again — download or copy". Closing the modal and re-opening the page must not reveal them.
- **Pass:** recovery codes are bcrypt-hashed in `user_mfa_recovery_codes` (verify via admin query or staging DB snapshot).

### C06 / C07 — Login step-up
- Log out. Log in with password. **Expected:** response is HTTP 401 `{ mfa_required: true, mfa_token: <jwt>, challenge: "totp" }`; UI lands on `/login/mfa` and does not issue access tokens. Enter current Authenticator code → `/auth/verify-totp` called with `mfa_token` → issuance of access + refresh tokens carrying `mfa_verified: true`.

---

## Module D — Workspace shell & navigation (D01–D07)

| ID | P | Title |
|---|---|---|
| D01 | P0 | Dashboard renders all KPI cards within 3 s on first load |
| D02 | P0 | Sidebar order and groupings match Photographer Requirements §2.1 |
| D03 | P0 | **No standalone Upload item** in sidebar (upload lives inside galleries) |
| D04 | P1 | Storage indicator shows current / quota with correct colour (green < 80 %, amber 80–94 %, red ≥ 95 %) |
| D05 | P1 | Quick-nav `Home` / `Projects` shortcuts route correctly (AC-PHO-003B) |
| D06 | P1 | Header search finds galleries and clients in ≤ 500 ms for the seeded dataset |
| D07 | P1 | Responsive: at ≤ 768 px viewport, sidebar collapses to bottom nav |

### D03 — No standalone upload in sidebar
- **Priority:** P0. **Refs:** `feedback_upload_in_gallery`.
- **Steps:** inspect sidebar as `@pho_pro`. Search for link text "Upload".
- **Expected:** no sidebar item labelled Upload. Upload only appears inside `/galleries/[id]` detail view.
- **Pass:** zero matches in sidebar DOM.

---

## Module E — Galleries (E01–E18)

| ID | P | Title |
|---|---|---|
| E01 | P0 | Create gallery: title, client, event date, privacy mode |
| E02 | P0 | Gallery list shows status badges (Draft / Shared / Expired / Protected / PWA) |
| E03 | P0 | Cover designer opens 3-column editor with all 30 templates |
| E04 | P1 | Change cover template → live preview updates desktop and mobile variants |
| E05 | P1 | Set focal point by click → preview crops reflect it |
| E06 | P0 | Privacy → Password protect; password stored hashed; client experience validated in cross-persona T01 |
| E07 | P0 | Privacy → Expiry date set; post-expiry client view shows expired placeholder |
| E08 | P1 | Privacy → PIN-lock individual photos; locked placeholder appears in "View as Client" |
| E09 | P0 | Share link generates unique slug; QR code downloadable as PNG |
| E10 | P1 | Revoke share link → old link returns 404/410 for clients |
| E11 | P0 | FaceID toggle visible only on Professional+ plans (gated for `@pho_starter`) |
| E12 | P0 | FaceID enable requires consent confirmation dialog |
| E13 | P1 | "View as Client" opens preview frame and respects all current settings |
| E14 | P1 | Gallery creation blocked at `gallery_limit` → upgrade prompt, not an error |
| E15 | P1 | Sub-gallery / album creation inside a gallery |
| E16 | P1 | Bulk select + delete (soft delete via `deleted_at`) |
| E17 | P1 | WhatsApp share button opens pre-filled message with gallery link |
| E18 | P1 | Share analytics show link clicks, unique viewers, device breakdown |

### E01 — Create gallery
- **Priority:** P0. **Refs:** FR-PHO-GAL-001, AC-PHO-004.
- **Login:** `@pho_pro`.
- **Test data:** title = `UAT Smoke Gallery`, client = pick `@client_wedding` from CRM, event date = today, privacy = Draft.
- **Steps:** Galleries → New → fill form → Save.
- **Expected:** gallery detail opens, URL `/galleries/<id>`, status badge "Draft", zero photos count, upload zone visible inside the gallery (per D03).
- **Pass:** `galleries` row created with `owner_user_id = @pho_pro.id` and `status = 'draft'`.

### E03 — Cover designer all 30 templates
- **Priority:** P0. **Refs:** FR-PHO-GAL-003, FR-PHO-GAL-004, AC-PHO-005.
- **Steps:** open Smoke Gallery → Cover → browse template library.
- **Expected:** exactly 30 named templates as listed in FR-PHO-GAL-004 (Center, Left, Novel, Vintage, Frame, Stripe, Divider, Journal, Stamp, Outline, Classic, None, Split, Label, Border, Album, Cliff, Cedar, Breeze, Aero, Surf, Cosmos, Reef, Bondi, West, Oakwood, Edge, Anchor, Joy, Love).
- **Pass:** count = 30; every card renders a thumbnail; selecting each updates live preview.

### E09 — Share link + QR
- **Priority:** P0.
- **Steps:** Smoke Gallery → Share → Generate link → copy URL + Download QR.
- **Expected:** slug is URL-safe; QR resolves to the same URL when scanned or decoded; `share_links` row has `token`, `status='active'`, audit entry `gallery.share.create`.

### E11 — FaceID plan gating
- **Priority:** P0. **Refs:** FR-PHO-GAL-005, AC-PHO-007.
- **Steps:** as `@pho_starter`, open any gallery, find FaceID toggle. Log out. As `@pho_pro`, open same gallery.
- **Expected:** Starter sees lock icon + "Upgrade to Professional to enable FaceID". Pro sees the toggle enabled.

---

## Module F — Uploads, derivatives, storage (F01–F12)

| ID | P | Title |
|---|---|---|
| F01 | P0 | Drag-drop upload of `11.jpg` to Smoke Gallery succeeds |
| F02 | P0 | WebP derivatives generated: `thumb_sm`, `thumb_md`, `thumb_lg`, `display_webp` |
| F03 | P0 | EXIF metadata extracted and visible in asset detail |
| F04 | P0 | Bulk upload of all 17 `tests/photos/` files completes |
| F05 | P0 | Resumable upload: kill browser mid-upload, reopen → resume from last chunk |
| F06 | P1 | Filename round-trip: `vCard.jpeg` and `Image.jpeg` stored and served with exact case |
| F07 | P0 | Upload blocked at storage quota → upgrade modal, not error toast |
| F08 | P0 | Processing status screen shows pipeline progress per file |
| F09 | P1 | Watermark rules enforced on derivatives when enabled |
| F10 | P1 | Client-side abuse screening blocks clearly unsafe test image (per F-016 / M16) |
| F11 | P1 | Upload fails gracefully on network drop → user can retry without duplicates |
| F12 | P0 | **No file ever written to local disk** — verify R2 object shows up |

### F01 — Single upload smoke
- **Priority:** P0. **Refs:** FR-PHO-UPL-001, §AGENTS upload in gallery.
- **Steps:** Smoke Gallery → drop `tests/photos/11.jpg` on upload zone → wait for pipeline.
- **Expected:**
  - Upload progress bar completes.
  - `assets` row created with `original_url` pointing to R2.
  - Derivatives row(s) for `thumb_sm_webp`, `thumb_md_webp`, `thumb_lg_webp`, `display_webp`.
  - Gallery thumbnail renders a WebP variant (check Network tab: `Content-Type: image/webp`).
- **Pass:** all four derivatives present within 30 s; gallery thumbnail count == 1.

### F04 — Bulk 17-photo upload
- **Priority:** P0. **Test data:** all files in `tests/photos/` (17 items).
- **Steps:** Wedding Gallery → drop all 17 files at once.
- **Expected:** queue UI shows 17 items, each runs through pipeline; final count = 17; no failures; `vCard.jpeg`, `Image.jpeg`, and `22.jpeg` (note `.jpeg` extension and mixed case) all land correctly.

### F05 — Resumable upload
- **Priority:** P0. **Refs:** FR-PHO-UPL-002, AC-PHO-010.
- **Steps:** start uploading all 17 files. When roughly half are uploaded, hard-close the browser tab. Re-open, navigate back to the gallery.
- **Expected:** upload zone offers "Resume 8 interrupted uploads"; clicking Resume completes without re-uploading finished files. Final count = 17; chunked_upload session row restored from DB.

### F07 — Storage quota block
- **Priority:** P0. **Login:** `@pho_starter` (small quota). **Preconditions:** quota nearly full (seed can pre-fill).
- **Steps:** upload one more photo that would exceed quota.
- **Expected:** upload blocked with modal "Storage full — upgrade to continue". No partial upload on R2. No file on local disk.

### F12 — R2-only storage verification
- **Priority:** P0. **Refs:** AGENTS.md §No Local Storage.
- **Steps:** after F01, SSH / exec into backend container: `ls -la /tmp /var /data 2>/dev/null | grep -E '\.(jpe?g|webp)$'`.
- **Expected:** zero matches. Check R2 bucket via admin settings ping: object for `11.jpg` listed by timestamp.

---

## Module G — Assets, search, face groups (G01–G10)

| ID | P | Title |
|---|---|---|
| G01 | P0 | Asset library grid paginates (scroll loads next batch) |
| G02 | P1 | Filter by date, tag, face group, AI score, collection |
| G03 | P1 | Semantic search "bride smiling" returns relevant photos from Wedding Gallery |
| G04 | P1 | Asset detail shows EXIF + AI analysis + tags |
| G05 | P1 | Add/remove tags persists across reload |
| G06 | P0 | Face groups show per-gallery clusters (NOT cross-gallery) |
| G07 | P1 | Rename a face group (e.g. "veera") — label persists |
| G08 | P1 | Merge two groups (veera + veera3) — combined cluster retains all source faces |
| G09 | P1 | Split a group — extracted face forms new group |
| G10 | P1 | Gallery-level AI disable prevents new assets from being processed |

### G03 — Semantic search smoke
- **Priority:** P1. **Refs:** FR-PHO-AST-001, AC-PHO-020.
- **Preconditions:** Wedding Gallery populated (F04) and AI pipeline has completed embedding generation (check `assets.embedding_status='ready'`).
- **Steps:** AI Hub → Search → query "bride smiling at sunset".
- **Expected:** at least one relevant match from the 17 fixtures; ranked by similarity; clicking a result opens the asset in the lightbox.

### G06 — Face groups are per-gallery (privacy rule)
- **Priority:** P0. **Refs:** BR-PHO-AI-001/003, AC-PHO-021.
- **Steps:** create two galleries, both containing `veera.jpg`. Open Faces Gallery → AI → Faces. Open other gallery → AI → Faces.
- **Expected:** each gallery has its own cluster for veera; no UI element exposes a cross-gallery identity; `face_embeddings` rows have `gallery_id` scoping enforced.
- **Pass:** confirm via API query that `GET /api/v1/ai/faces?gallery_id=X` never returns embeddings with a different `gallery_id`.

---

## Module H — Albums & spread designer (H01–H07)

Professional+ only.

| ID | P | Title |
|---|---|---|
| H01 | P0 | Create album with lab preset selection |
| H02 | P1 | Spread designer: drag photo onto layout slot |
| H03 | P1 | AI layout suggestion button produces a valid layout |
| H04 | P1 | Safe-zone / bleed overlay toggle shows guides |
| H05 | P1 | Version history lists every saved version |
| H06 | P0 | Print preflight flags low-DPI or off-bleed warnings |
| H07 | P0 | Starter plan has album feature locked with upgrade CTA |

---

## Module I — CRM, contracts, invoicing (I01–I12)

| ID | P | Title |
|---|---|---|
| I01 | P0 | Create client — name, phone, email, event type |
| I02 | P1 | Client profile aggregates linked galleries, messages, deal stage |
| I03 | P1 | Pipeline kanban drag between Inquiry → Lead → Proposal → Booked → Delivered |
| I04 | P0 | Client limit enforcement (blocked at `client_limit`, shows upgrade) |
| I05 | P1 | Import contacts from CSV (smoke 5 rows) |
| I06 | P1 | Create quotation PDF with line items, GST, totals |
| I07 | P1 | Create contract from template, e-sign by client |
| I08 | P1 | Invoice generation with GST breakdown (IGST vs CGST/SGST per state) |
| I09 | P1 | Inquiry inbox receives leads from `/u/{slug}` |
| I10 | P1 | Link gallery to client auto-fills client communications |
| I11 | P1 | Deal value aggregates shown on dashboard KPI |
| I12 | P1 | Client deletion soft-deletes and hides from pipeline |

---

## Module J — Calendar & Google sync (J01–J08)

| ID | P | Title |
|---|---|---|
| J01 | P0 | Create shoot event with client, location, time, notes |
| J02 | P1 | Define services with duration + travel buffer |
| J03 | P1 | Week-view schedule respects services + buffers |
| J04 | P0 | Google OAuth2 sync: connect account, consent, tokens stored encrypted |
| J05 | P0 | Google "Busy" events automatically hide slots in RawDrive booking widget |
| J06 | P1 | RawDrive bookings write into connected Google Calendar |
| J07 | P1 | Disconnect Google → tokens purged, busy lookup disabled |
| J08 | P1 | Timezone: event times render in photographer's timezone and in client timezone for proofing view |

### J04/J05 — 2-way Google sync
- **Priority:** P0. **Refs:** FR-PHO-CAL-001, FR-PHO-CAL-005.
- **Preconditions:** sandbox Google OAuth app configured in `platform_settings`.
- **Steps:** Calendar → Settings → Google Sync → connect. In Google Calendar sandbox, create a "Busy" block 14:00–16:00 tomorrow. In RawDrive `/u/<pho_pro_slug>/book`, view tomorrow's slots.
- **Expected:** 14:00–16:00 not offered as a bookable slot.
- **Pass:** verify via `oauth_tokens` row that refresh token is encrypted at rest (KEK = `PLATFORM_SETTINGS_KEK`).

---

## Module K — Proofing workflow (K01–K08)

| ID | P | Title |
|---|---|---|
| K01 | P0 | Create proofing session with labelled categories |
| K02 | P0 | Publish proofing link to client — notification sent |
| K03 | P0 | [cross-persona] Client submits selections — photographer sees them in real time |
| K04 | P1 | Comment on photo; threaded reply from client |
| K05 | P1 | Close proofing session — client submissions become read-only |
| K06 | P1 | Export selection as CSV |
| K07 | P1 | Proofing dashboard shows selection count per category |
| K08 | P1 | Proofing closure triggers "Approved" notification to photographer |

### K03 — Real-time client selections
- **Priority:** P0. **Refs:** FR-PHO-GAL-007; partner Client scenario L-Client-K03.
- **Requires:** second tester or second browser profile for `@client_wedding`.
- **Steps:** photographer opens proofing dashboard for Wedding Gallery. Client (separate session) opens the proofing link and marks `12.jpg` "Must Print" and `13.jpg` "Maybe".
- **Expected:** photographer's dashboard updates within ~2 s without manual refresh (NATS event broker). Counter increments correctly.

---

## Module L — Public profile, freelancer, rentals (L01–L09)

| ID | P | Title |
|---|---|---|
| L01 | P0 | Edit public profile — bio, services, featured galleries |
| L02 | P0 | `/u/{slug}` renders publicly with branding (see Guest UAT G01) |
| L03 | P1 | WhatsApp CTA opens pre-filled message |
| L04 | P1 | vCard download contains correct name, phone, email, website |
| L05 | P1 | QR code downloadable PNG, scannable to `/u/{slug}` |
| L06 | P1 | Freelancer profile toggle on, headline, specialties, availability |
| L07 | P1 | Airbnb-style availability calendar — block/unblock dates |
| L08 | P1 | Camera rental listing create — item, location, pricing, deposit |
| L09 | P1 | Booking/rental inquiries show up in CRM Inquiry inbox |

---

## Module M — Live streaming (M01–M06)

| ID | P | Title |
|---|---|---|
| M01 | P0 | Event setup — name, date, access control |
| M02 | P0 | RTMPS/SRT ingest details displayed with copy buttons |
| M03 | P1 | Purchase streaming credits via PhonePe sandbox |
| M04 | P1 | Stream goes live; viewer counter increments when test client opens player |
| M05 | P1 | Stream health alert on ingest drop — toast notification |
| M06 | P1 | Credit balance decrements as event runs |

---

## Module N — AI Hub (N01–N08)

| ID | P | Title |
|---|---|---|
| N01 | P0 | AI dashboard lists recent jobs with status |
| N02 | P1 | Auto-culling: side-by-side AI suggestion vs override |
| N03 | P1 | Culling confidence slider changes included set |
| N04 | P1 | Aesthetic scoring dashboard shows distribution |
| N05 | P1 | Duplicate detection flags exact/near-duplicates in the 17-photo set |
| N06 | P1 | Gallery-level AI disable — new uploads skip pipeline |
| N07 | P1 | AI usage meter increments per job |
| N08 | P1 | AI jobs complete notification appears in activity feed |

---

## Module O — Analytics (O01–O05)

| ID | P | Title |
|---|---|---|
| O01 | P0 | Gallery analytics: views, downloads, favorites, engagement |
| O02 | P1 | Share analytics: link clicks, unique viewers, device breakdown |
| O03 | P1 | Workspace analytics roll up to dashboard KPIs |
| O04 | P1 | Date range presets work: Today, 7d, 30d, Quarter, Custom |
| O05 | P1 | CSV export contains only data the photographer owns |

---

## Module P — Billing, plans, storage quota (P01–P12)

| ID | P | Title |
|---|---|---|
| P01 | P0 | Current plan, usage, next renewal date visible on `/billing` |
| P02 | P0 | Upgrade Starter → Professional applies immediately with proration |
| P03 | P0 | Downgrade Business → Professional with excess usage → scheduled for next renewal |
| P04 | P0 | Invoice history lists PhonePe transactions with download PDF |
| P05 | P1 | Trial countdown visible from day 1 on dashboard (`@pho_trial`) |
| P06 | P0 | Trial reminders at 30 / 7 / 1 day before expiry (verify via mailpit) |
| P07 | P0 | Expired trial enters read-only recovery mode (same guardrails as billing hold) |
| P08 | P0 | Billing hold: login allowed, uploads/creates blocked, recovery UI prominent (`@pho_hold`) |
| P09 | P1 | Storage quota breakdown: originals / derivatives / album exports / other |
| P10 | P1 | Quota bar colour thresholds: green < 80 %, amber 80–94 %, red ≥ 95 % |
| P11 | P1 | Renewal failure → notification with critical priority |
| P12 | P1 | Proration reflected correctly in next invoice |

### P08 — Billing hold guardrails
- **Priority:** P0. **Refs:** BR-PHO-BIL-001/002/003, AC-PHO-016.
- **Login:** `@pho_hold`.
- **Expected:** can log in and reach a banner "Your account is on billing hold — update payment to restore". Upload zone in a gallery is visually disabled with tooltip. Create gallery blocked. Existing galleries viewable. Billing page accessible.

---

## Module Q — Team management (Business+) (Q01–Q06)

Login `@pho_business`.

| ID | P | Title |
|---|---|---|
| Q01 | P0 | Invite team member — email sent with join link |
| Q02 | P1 | Role & granular permissions selectable on invite |
| Q03 | P1 | Team member accepts invite and lands in owner's workspace |
| Q04 | P1 | Team member sees only features their role permits |
| Q05 | P1 | Revoke team member → access lost immediately |
| Q06 | P1 | Team invite blocked at `team_member_limit` → upgrade prompt |

---

## Module R — Settings: branding, security, privacy (R01–R09)

| ID | P | Title |
|---|---|---|
| R01 | P1 | Upload branding logo — appears on public profile and gallery shells |
| R02 | P1 | Brand colour / accent changes applied to client gallery theme |
| R03 | P1 | Custom domain (Professional+) validated via DNS check |
| R04 | P1 | Notification preferences respect channels (in-app / email / push) per event |
| R05 | P0 | Security page: active sessions visible, can revoke any |
| R06 | P0 | Session timeout behaves per configured policy |
| R07 | P1 | Privacy: gallery-level AI disable toggle persists |
| R08 | P1 | Privacy: gallery default download policy configurable |
| R09 | P1 | Account deletion path hidden behind confirmation + 2FA |

---

## Module S — Restricted actions (negative) (S01–S08)

Photographers must never cross into admin / dealer / super-admin scope.

| ID | P | Denied action | Enforcement expected |
|---|---|---|---|
| S01 | P0 | Navigate to `/admin/dashboard` | Redirect to `/dashboard` with no data leak in page source |
| S02 | P0 | Navigate to `/superadmin/users` | Same |
| S03 | P0 | Navigate to `/dealer/dashboard` | Same |
| S04 | P0 | Inspect other photographer's workspace via guessed `/galleries/<id>` belonging to `@pho_starter` | 403 or 404; no data in network response |
| S05 | P0 | Modify platform pricing — URL probe to `/api/v1/superadmin/pricing/*` | API 403 |
| S06 | P0 | Approve payout batch — URL probe | API 403 |
| S07 | P0 | Access dealer analytics | API 403 |
| S08 | P0 | Create admin or dealer account | No UI; API 403 |

All eight are **P0** because any leak is a compliance failure.

---

## Module T — Cross-persona flows (T01–T05)

Each requires at least two testers online.

### T01 — Photographer → Client: publish → proof → close
- **Priority:** P0.
- **Participants:** Photographer tester + Client tester.
- **Steps:**
  1. Photographer creates Wedding Gallery, uploads 17 photos, adds cover, enables proofing with categories `Must Print / Maybe / Album`, generates share link with password.
  2. Photographer sends link via WhatsApp share button (simulated; record that mailpit email also goes out when client has CRM record).
  3. Client opens the link (see Client UAT C-K-01).
  4. Client enters password, browses, marks 5 photos Must Print, 3 Maybe.
  5. Client submits selections.
  6. Photographer sees selections in dashboard within 2 s.
  7. Photographer closes proofing.
  8. Client refreshes — selection UI is now read-only with "Selections submitted" confirmation.
- **Expected:** photographer notification fires on submit; close flips status; no further client edits possible; audit trail records `proofing.submit` and `proofing.close`.

### T02 — Dealer coupon → photographer signup → dealer attribution
- **Priority:** P0. Coordinated with Dealer UAT D-C-03.

### T03 — Client payment → photographer fulfilment
- **Priority:** P0. Coordinated with Client UAT.

### T04 — Admin escalates to Super Admin
- **Priority:** P1. Coordinated with Admin + Super Admin UATs.

### T05 — Guest inquiry → photographer CRM
- **Priority:** P1. Coordinated with Guest UAT.

---

## Regression gate (run every cycle)

Before signing off any release, re-run the following minimum set *even if only an unrelated area changed* — they are the highest-value smoke scenarios:

- A08 (login password-only)
- D03 (no standalone upload)
- E03 (30 cover templates)
- F01, F04, F05, F07, F12 (upload pipeline + R2 only + quota)
- G06 (per-gallery face isolation)
- K03 (proofing real-time cross-persona)
- P08 (billing hold)
- All of Module S (negative access)

---

## Result log

Complete one row per scenario executed. Attach evidence paths for every P0 failure.

| Scenario ID | Tester | Build hash | Date | Result (P/F/Blocked) | Defect ID | Evidence path |
|---|---|---|---|---|---|---|
| A01 |  |  |  |  |  |  |
| A02 |  |  |  |  |  |  |
| … |  |  |  |  |  |  |
| T05 |  |  |  |  |  |  |

(Clone the table per cycle; do not overwrite history.)

---

## Sign-off

| Role | Name | Build hash | Date | Signature |
|---|---|---|---|---|
| Photographer UAT Lead |  |  |  |  |
| Product Owner (Creator) |  |  |  |  |
| Engineering Lead (Backend) |  |  |  |  |
| Engineering Lead (Frontend) |  |  |  |  |
| QA Lead |  |  |  |  |

---

*End of Photographer UAT*
