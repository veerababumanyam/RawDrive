# RawDrive — User Acceptance Testing (UAT) Suite

**Product:** RawDrive
**Version under test:** v0.0.40 (M17 — Hardening Wave 5)
**Suite date:** 2026-04-11
**Owner:** QA Lead → signed off by Product + Engineering
**Source of truth:** `docs/TechnicalRequirements/*-Requirements.md` (per-persona FR / BR / AC catalogues)

---

## 1. Purpose

This suite verifies that every persona of RawDrive can complete their full real-world workflow end-to-end against a live, integrated build. It is organised by persona so that business testers and subject-matter experts can each own a document without reading the others.

UATs are not unit tests. Each scenario is a **user journey**: the tester plays the role, uses the real UI (or public API for guests and integrations), and confirms that the *observable outcome* matches the acceptance criteria. Pass/fail is recorded by a human, not a CI runner.

---

## 2. Suite Contents

| # | Persona | File | Test count (approx.) | Primary owner |
|---|---------|------|----------------------|---------------|
| 1 | Photographer / Studio Owner | [`01-photographer-uat.md`](01-photographer-uat.md) | 110+ | Head of Creator Experience |
| 2 | Admin (platform ops) | [`02-admin-uat.md`](02-admin-uat.md) | 85+ | Head of Operations |
| 3 | Super Admin (governance) | [`03-super-admin-uat.md`](03-super-admin-uat.md) | 75+ | Founder / CTO |
| 4 | State Dealer / Distributor | [`04-dealer-uat.md`](04-dealer-uat.md) | 65+ | Head of Revenue |
| 5 | Client / Family | [`05-client-uat.md`](05-client-uat.md) | 80+ | Customer Success Lead |
| 6 | Guest (unauthenticated) | [`06-guest-uat.md`](06-guest-uat.md) | 35+ | Growth / Marketing |

Total: **~450 acceptance scenarios** spanning UI, API, background pipelines, and 3rd-party integrations.

---

## 3. Test Environment

### 3.1 Required stack

| Component | Version / image | Notes |
|---|---|---|
| Backend (Go API) | `backend/cmd/api` built from tag under test | Chi router, JWT, pgvector |
| Frontend (Next.js 15) | `frontend` built from same tag, pnpm | Do **not** test against dev server for P0 scenarios |
| Postgres 16 + pgvector | `docker-compose.yml` service `postgres` | migrations run to head |
| Valkey 8 | `docker-compose.yml` service `valkey` | cache + rate limiting |
| NATS JetStream | `docker-compose.yml` service `nats` | background jobs |
| Mailpit | `docker-compose.yml` service `mailpit` | capture all outbound email |
| Playwright runner | `_cobolt-docker/` compose service | E2E / smoke regression only |
| Cloudflare R2 | staging bucket | **R2 is the sole storage backend**, no local disk |
| PhonePe | sandbox keys in `platform_settings` | payments + mandates |
| Razorpay | sandbox keys (fallback gateway) | payments + refunds |
| Google Calendar | OAuth sandbox app | 2-way sync |
| Gemini / Cloud Vision | sandbox keys | AI culling, faces, tagging |

`STORAGE_DRIVER=local` is a **fatal error**; if the backend boots with that value the test environment is invalid — stop and re-provision.

### 3.2 Bring-up

```bash
# from repo root
cp .env.cobolt.example .env.cobolt   # fill in sandbox credentials
docker compose up -d                 # postgres, valkey, nats, mailpit, playwright
go run ./backend/cmd/api              # or docker image under test
pnpm --dir frontend build && pnpm --dir frontend start
```

### 3.3 Seed state before each UAT cycle

Run `go run ./backend/seeds/...` to create the canonical test accounts listed in §4. The seed job is idempotent but truncates `galleries`, `assets`, `orders`, and `payouts` — expected behaviour for a clean cycle.

---

## 4. Canonical Test Accounts

All UATs reference these accounts by handle. They are created by the seeds package; do not hand-edit.

| Handle | Email | Role | Notes |
|---|---|---|---|
| `@super_admin` | `super@rawdrive.test` | super_admin | 2FA enforced, IP allowlist bypass in staging |
| `@admin_ops` | `ops@rawdrive.test` | admin | Day-to-day platform operations |
| `@admin_mod` | `mod@rawdrive.test` | admin | Moderation scope |
| `@dealer_tg` | `dealer.tg@rawdrive.test` | dealer | State = Telangana |
| `@dealer_mh` | `dealer.mh@rawdrive.test` | dealer | State = Maharashtra — used for cross-state isolation tests |
| `@pho_starter` | `pho.starter@rawdrive.test` | photographer | Plan: Starter |
| `@pho_pro` | `pho.pro@rawdrive.test` | photographer | Plan: Professional (default for most scenarios) |
| `@pho_business` | `pho.biz@rawdrive.test` | photographer | Plan: Business, has 2 team members |
| `@pho_trial` | `pho.trial@rawdrive.test` | photographer | Day 88 of 90 trial — used for expiry tests |
| `@pho_hold` | `pho.hold@rawdrive.test` | photographer | Billing-hold state — used for read-only tests |
| `@team_lead` | `team.lead@rawdrive.test` | team_member | Linked to @pho_business |
| `@client_wedding` | `client.wed@rawdrive.test` | client | Invited to Wedding gallery |
| `@client_unreg` | *n/a (link only)* | unregistered | Receives direct links, never logs in |

Passwords follow the convention `Uat-<handle>-2026!` where `<handle>` is the short name, e.g. `Uat-pho-pro-2026!`. Do not commit real passwords to git.

---

## 5. Test Data — Photo Fixtures (MANDATORY)

**All upload, gallery, proofing, AI, and download tests MUST use files from `tests/photos/`.** Never generate synthetic images, never use external URLs, never create placeholders. The filenames deliberately include mixed case and numeric suffixes — they also catch real-world filename bugs.

Canonical fixture set (17 files available today):

| Filename | Bytes (approx.) | Suggested use |
|---|---|---|
| `tests/photos/11.jpg` | ~2 MB | Default upload smoke for Starter plan limits |
| `tests/photos/12.jpg` | ~2 MB | Proofing "Must Print" sample |
| `tests/photos/13.jpg` | ~2 MB | Proofing "Maybe" sample |
| `tests/photos/14.jpg` | ~2 MB | AI scoring: face present |
| `tests/photos/15.jpg` | ~2 MB | AI scoring: landscape |
| `tests/photos/16.jpg` | ~2 MB | WebP derivative verification target |
| `tests/photos/17.jpg` | ~2 MB | Bulk upload set |
| `tests/photos/18.jpg` | ~2 MB | Bulk upload set |
| `tests/photos/19.jpg` | ~2 MB | Bulk upload set |
| `tests/photos/20.jpg` | ~2 MB | Cover photo for test gallery |
| `tests/photos/21.jpg` | ~2 MB | Sensitive photo lock test |
| `tests/photos/22.jpeg` | ~2 MB | `.jpeg` extension path check |
| `tests/photos/Image.jpeg` | ~2 MB | Mixed-case filename check |
| `tests/photos/reethu.jpg` | ~2 MB | Face group rename / merge tests |
| `tests/photos/veera.jpg` | ~2 MB | Face group primary |
| `tests/photos/veera3.jpg` | ~2 MB | Face group secondary — merge target |
| `tests/photos/vCard.jpeg` | ~2 MB | EXIF + alt filename form |

### 5.1 Test gallery builds

| Gallery alias | Photos used | Purpose |
|---|---|---|
| **Smoke Gallery** | `11.jpg`, `12.jpg`, `13.jpg` | Fast gallery used in most P0 tests |
| **Wedding Gallery** | all 17 | Full pipeline — AI, proofing, download, client experience |
| **Quota Gallery** | `11.jpg` x N (until quota hit) | Billing-hold / storage-limit tests |
| **Faces Gallery** | `reethu.jpg`, `veera.jpg`, `veera3.jpg`, `14.jpg` | AI face grouping, merge/split |
| **Locked Gallery** | `21.jpg` marked sensitive | Per-photo PIN lock tests |

**Filename rule:** any scenario that asserts "filename round-trips correctly" MUST use `vCard.jpeg` or `Image.jpeg` — the mixed case and the `.jpeg` extension catch storage key casing bugs.

---

## 6. Priority Classification

| Priority | Meaning | Release gate |
|---|---|---|
| **P0 — Blocker** | Business-critical path; failure blocks release. | 100 % must pass. |
| **P1 — Major** | Important to quality; degraded experience if broken. | ≥ 95 % pass; known defects logged and triaged. |
| **P2 — Minor** | Polish, edge cases, non-critical paths. | ≥ 85 % pass; tracked for next milestone. |

Every scenario in each persona doc is tagged with a priority. Release sign-off requires the P0 column to be 100 % green.

---

## 7. How to Execute a Persona UAT

1. **Set up** — follow §3 and §4. Confirm `STORAGE_DRIVER` ≠ `local`, mailpit reachable at `http://localhost:8025`, PhonePe sandbox responding.
2. **Open the persona doc** (e.g. `01-photographer-uat.md`). Work through scenarios in order.
3. **For each scenario:**
   a. Read preconditions, log in as the specified handle.
   b. Follow the steps literally. Do not improvise.
   c. Record **Actual Result**, **Pass/Fail**, and any defect IDs in the result table at the end of the doc (or a duplicate copy).
4. **On failure:** capture a screenshot, the browser console, and the relevant network request. File under `docs/uat/results/<cycle>/<scenario-id>/`.
5. **On P0 failure:** stop the cycle, notify Engineering, re-run after fix before continuing.
6. **On sign-off:** complete the sign-off section at the bottom of the persona doc with name, role, date, and build hash.

---

## 8. Integration Scenarios That Span Personas

Some flows touch multiple roles in sequence. When testing these, coordinate between the owners of each persona doc:

| Integration flow | Personas involved | Primary persona doc |
|---|---|---|
| Photographer publishes gallery → Client proofs it → Photographer closes proofing | Photographer + Client | Both (linked) |
| Dealer issues coupon → Photographer signs up with coupon → Dealer sees attributed signup | Dealer + Photographer | Dealer |
| Admin escalates margin change → Super Admin approves | Admin + Super Admin | Super Admin |
| Guest views public profile → Guest submits inquiry → Photographer receives lead | Guest + Photographer | Guest |
| Client places print order → PhonePe charges → Photographer sees fulfilment task | Client + Photographer | Client |

Scenarios marked **[cross-persona]** in a doc must be executed with the other persona's tester online and in sync.

---

## 9. Non-negotiable Rules for Testers

These repeat rules that live in `AGENTS.md`; they are *also* binding on UAT testers because violating them produces invalid test evidence.

1. **R2 is the only storage backend.** If a scenario appears to save to local disk, the build is invalid — stop.
2. **OTP is registration-only.** If any login scenario prompts for email OTP, that is a defect, not expected behaviour. (TOTP MFA at login is a different feature and *is* expected for enrolled users.)
3. **Upload lives inside a gallery**, never as a standalone sidebar item. If you see a top-level `/upload` link in navigation, file it as a defect.
4. **All rendered images in client/gallery views must be WebP derivatives.** Originals are download-only.
5. **Every icon-only button must be `GlassIconButton` with an accessible `label`** — no raw `<button>` with SVG.
6. **Use `tests/photos/` files.** No synthetic images, no external URLs, no placeholders.
7. **Playwright E2E runs in the Docker runner**, not directly on the Windows host.
8. **Never share credentials across persona handles**. Log out fully between persona switches or use separate browser profiles.

---

## 10. Sign-off

Each persona doc has its own sign-off block. The **suite-level** sign-off below is completed only when all six persona docs are green against the release target.

| Role | Name | Build hash | Date | Signature |
|---|---|---|---|---|
| QA Lead |  |  |  |  |
| Product Owner |  |  |  |  |
| Engineering Lead |  |  |  |  |
| CEO / Founder |  |  |  |  |

---

*End of UAT Suite README*
