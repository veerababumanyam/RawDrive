# F-014 Live Streaming — M34 + M35 Pending Work

**Captured:** 2026-04-14
**Reason:** M34 build loop stalled at Round 4 (frontend) due to phantom execution (sub-agent claimed 48 passing tests + files written, zero files persisted to disk). Decision: document all remaining F-014 work, reset planning + milestone state, re-plan as a brownfield scope-of-work.
**Upstream source:** `_cobolt-output/latest/planning/milestones-v2.md`, `_cobolt-output/latest/planning/feature-dossiers/FEAT-014.md`, `_cobolt-output/latest/build/M34/round-proofs/*`, `cobolt-state.json` (build.blockerNote).

## What already shipped (do NOT re-do)

Backend is solid through R3 and on disk / in git:

- **M31 (v0.0.58)** schema foundation, credit ledger, rate-card CRUD + super-admin UI + client profile streams.
- **M32 (v0.0.59)** PhonePe + Razorpay recharge, GST invoicing, refund.
- **M33 (v0.0.60–0.0.61)** Cloudflare Stream integration layer + post-ship audit fixes.
- **M34 backend R1–R3 (not yet tagged)** on disk, tests green:
  - `backend/internal/streaming/shortlink/handler.go` (302/404/410/429 per-IP rate-limited redirect + hit logging)
  - `backend/internal/streaming/handlers/analytics_handler.go` (owner-scoped stream + workspace metrics)
  - `backend/internal/streaming/handlers/admin_ledger_handler.go` (super-admin CSV export, audit-logged)
  - `backend/internal/streaming/routing_test.go` (feature-flag gate contract)
  - `backend/internal/streaming/analytics/`, `preflight/`, `featureflag/` packages
  - Migrations 089 + 090 (shortlinks, preflight sessions)
- **R3 carry-forward (must be picked up in re-plan):**
  - CF1 — wire `featureflag.StreamingCommercialFlag.Gate` into `cmd/api/main.go` around `F-014 /streaming/balance`. Today proven at unit level only.
  - CF2 — confirm `admin_audit` table (or reuse existing audit_log with filters_json) for `ServeCSV` INSERT.
  - CF3 — replace `?owner=` query param ownership in nil-db analytics path with auth-middleware-resolved ownership.

## M34 — pending (frontend + capstone)

Source: `milestones-v2.md` M34 exit criteria + `M34-task-manifest.json` waves 2–4 + `M34-test-plan.json` round 4.

### Frontend foundation (must exist before components)
- `frontend/src/lib/auth/permissions.ts` — `hasStreamPermission(role, action)` truth table (4 actions × 4 roles).
- Extend `frontend/src/lib/api/streaming.ts` to cover StreamConsolePayload, `getStream`, `revealIngest` (403 typed with `canRevealAt`), `getBalance`.
- `frontend/src/lib/hooks/useStreamingPackages.ts` — TanStack 5 min cache hook.

### Dashboard shell + console
- `frontend/src/components/streaming/CreditBalancePill.tsx` — 60 s poll, low-balance token color, pause on hidden tab.
- `frontend/src/components/streaming/RechargeModal.tsx` — PhonePe/Razorpay radio, `location.assign(hostedCheckoutUrl)`, no secrets in DOM.
- `frontend/src/components/streaming/InviteQR.tsx` — SVG QR of `/s/{code}?src=qr` + GlassIconButton copy.
- `frontend/src/components/streaming/IngestReveal.tsx` — hidden pre T-30, countdown, reveal enables clipboard + `onRevealed`.
- `frontend/src/components/streaming/IngestHealth.tsx` — 5 s poll bitrate/fps/connected, disconnected color.
- `frontend/src/components/streaming/ViewerCountWidget.tsx` — current/peak/unique, 5 s update.
- `frontend/src/components/streaming/ModeratorPanel.tsx` — slow-mode POST, delete confirm, hidden without `canModerate`.
- `frontend/src/components/streaming/WaitingRoomPreview.tsx` — read-only mirror of public viewer waiting room.
- `frontend/src/components/streaming/DepletionBanner.tsx` — threshold classes (≥5 hidden, 1–5 yellow, 0.5–1 orange, <0.5 red+30s countdown), recharge cancels, `onGraceExpired` fires once at 0.
- `frontend/src/components/streaming/DesktopPreflightPanel.tsx` — bandwidth test, OBS profile, test broadcast.
- `frontend/src/components/streaming/AnalyticsPanel.tsx` — per-stream metrics panel (replay views/conversion source/etc).

### Pages
- `frontend/src/app/(dashboard)/streams/new/page.tsx` — zod: `start >= now + 15 min`, pin required when `accessPolicy=pin`, timezone default to `Intl`. (File exists at 170 LOC; needs test + reconciliation against spec.)
- `frontend/src/app/(dashboard)/streams/[id]/page.tsx` — currently a 6-line stub; must become Overview / Setup / Live / Replay / Audit sections assembling all console components above.
- `frontend/src/app/superadmin/streaming/ledger/page.tsx` — super-admin ledger with CSV export button hitting admin_ledger_handler.

### Tests (vitest) — one per file above
All 22 `M34-R4-T001…T022` test IDs in `M34-test-plan.json`. Dashboard E2E requires Playwright storageState auth injection.

### M34 backend loose ends (from R3 carry-forward)
- Route wiring in `backend/cmd/api/main.go` behind feature flag.
- `admin_audit` table migration OR documented reuse of `audit_log.filters_json`.
- Auth-middleware ownership for analytics (replace `?owner=` shim).

## M35 — pending (everything; not started)

Source: `milestones-v2.md` M35 exit criteria, epics E107 + E108.

### Public viewer
- `frontend/src/app/stream/[id]/page.tsx` — SSE-driven transitions: countdown → waiting room → live → replay, no full page refresh.
- Real-time chat + reactions with client-AND-server-side enforcement of slow-mode / moderation / ban / timeout.
- Viewer count widget updates within 5 s.
- Replay state respects access expiry; expiry banner.
- `frontend/src/app/s/[shortcode]/page.tsx` — short-link resolver with conversion attribution (reads backend shortlink handler already shipped in M34 R3).

### Analytics
- Per-stream analytics dashboard: peak / unique / avg watch time / chat rate / reactions / replay views / conversion source.
- Workspace analytics widget: monthly streams, credits consumed, top performers.

### Governance + data retention
- Chat retention purge job — 90 d post end.
- Viewer session retention — 30 d post expiry.
- Replay retention per plan tier.

### Migration cleanup
- Drop deprecated `streams.pin_code` column.
- Remove misspelled env var (exact name to be confirmed during re-plan — carry-forward from M33 audit).
- Remove streaming packs from `frontend/src/lib/tokens.ts`.
- Fix `backend/internal/handlers/calendar_handler_test.go:10` compile failure.

### Release readiness
- Backend unit + integration (CF mocked) + RLS security + payment webhook + Docker Playwright E2E — full suite green.
- Feature flag `streaming.commercial_v1` configurable end-to-end.
- Rollback plan documented.

## Non-obvious constraints to re-plan against

- **No local storage** — R2 only. No hardcoded credentials.
- **Auth model** — email-OTP is registration-only; login is password (+ TOTP MFA step-up for enrolled users).
- **Upload UX** — nested inside gallery; not a standalone route.
- **JWT context** — handlers MUST call `middleware.JWTClaimsFromContext`; never define a local context-key type.
- **Icons** — all icon buttons use `GlassIconButton` + SF Symbols registry, no raw `<button>` + inline `<svg>`.
- **Design tokens** — read `design-tokens.json` first; no Tailwind primitives, no arbitrary values.
- **Test photos** — `tests/photos/` only (17 real JPEGs with spaces/parentheses in filenames).
- **Playwright** — runs inside Docker service, not Windows host. Dashboard tests need storageState / addInitScript auth injection.
- **Next.js 15 breaking changes** — read `frontend/node_modules/next/dist/docs/` before writing; training-data Next.js is stale.

## Re-plan inputs

Point `cobolt-plan` (brownfield, --auto) at this file plus:

- `docs/TechnicalRequirements/` (live TRDs)
- `_cobolt-output/latest/planning/feature-dossiers/FEAT-014.md` (feature dossier, reusable)
- `frontend/AGENTS.md`, `AGENTS.md` (project rules)
- Current codebase (R1–R3 backend is already in main; treat as existing surface)

## Scope NOT in this document

- M31, M32, M33 shipped work (in git, versioned).
- Non-F-014 milestones.
- Anything outside `RawDriveCobolt` project root.
