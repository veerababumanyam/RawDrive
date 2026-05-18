---
mode: feature
status: draft-pending-decisions
parentPRD: _cobolt-output/latest/planning/prd.md
parentArchitecture: _cobolt-output/latest/planning/architecture.md
derivedFrom: _cobolt-output/latest/analysis/upload-credits-20260420T160855Z/
draftedAt: 2026-04-20
draftedBy: Claude Opus 4.7 (from /cobolt-analyse handoff)
targetMilestone: M41
reuses:
  - upload/credit.Service Reserve/Consume/Refund (M40 / PR #37-39)
  - upload_purchases + upload_ledger_entries + upload_credit_balance_rollup (migrations 097-101)
  - streaming/credit.Service.Purchase (M31) as the reference implementation to mirror
  - streaming/recharge/handler.go (PhonePe + Razorpay webhook pattern, M32)
  - streaming GST invoicing + invoice_numberer (M32)
  - admin workspace platform-role middleware (M7.5)
complianceScopeDisclosure: |
  Same baseline as M40: append-only ledger with idempotency keys (prevents
  double-debit on webhook retries), GST invoicing per M32 pattern, no new PII
  collected beyond the payment provider's transaction IDs. Webhook signature
  verification (PhonePe X-VERIFY, Razorpay X-Razorpay-Signature) reuses the
  streaming implementations unchanged.
---

# Feature PRD — Upload Credit Top-up

**Version:** 1.0 DRAFT (decision document) | **Date:** 2026-04-20 | **Type:** Additive feature
**Project:** RawDrive | **License:** PROPRIETARY

## Status

This is a **decision document**, not a built-pipeline PRD. It closes the gap the M40 Upload Credit Meter left open: M40 shipped the **spend + read** sides (Reserve/Consume/Refund/Balance), but there is **no app-layer path to add credits**. Analysis `upload-credits-20260420T160855Z` confirmed the only current path is direct SQL INSERT into `upload_ledger_entries`. This PRD turns that dev-only path into a product capability.

Once decisions are locked, `/cobolt-plan feature` can promote this into the canonical `feature-prd.md` for the assigned milestone (probably M41) and drive the full pipeline (architecture delta → epics → stories → build handoff).

---

## 1. Problem

Workspaces that have exhausted their M40 upload credits have **no way to add more** except asking a DBA to run a SQL INSERT. The M40 schema and entry-type enum already declare the data shape (`purchase`, `grant_monthly`, `grant_admin`, `unlimited_passthrough`) and a `upload_purchases` table with webhook-idempotent UNIQUE constraint exists — but no Go service method, no HTTP handler, no scheduled worker, and no admin UI writes to any of it. The sibling streaming feature (M31 F-014) has all of this wired — **this PRD's job is to bring upload credits to parity**.

Concretely, five independent surfaces are missing:

| Gap | Finding from analysis | Today's workaround |
|---|---|---|
| Pay-as-you-go top-up | FEAT-UCR-001 + FEAT-UCR-002 | Manual SQL |
| Plan-tier monthly allowance | FEAT-UCR-004 | Manual SQL |
| Admin one-shot grant | FEAT-UCR-003 | Manual SQL |
| UAT test fixtures | FEAT-UCR-005 | Manual SQL in `uat_accounts.sql` |
| Enterprise unlimited bypass | ENH-UCR-001 | Not possible (unreachable code path) |

## 2. Goal

Every workspace has a supported, self-serve or automated path to acquire upload credits, matching the operational model we already run for streaming credits. After this feature ships:

- Photographer workspaces can purchase a top-up bundle via PhonePe or Razorpay and see credits in their balance pill within seconds (idempotent on webhook retry).
- Monthly plan allowances are automatically credited on the billing anniversary for `standard` and `professional` plan tiers.
- `super_admin` / `admin` platform roles can grant upload credits to any workspace from the admin UI with an audit trail.
- Enterprise workspaces post a single `unlimited_passthrough` ledger entry per upload instead of consuming credits.
- UAT test accounts ship with a seeded credit balance so end-to-end upload flows work out of the box.

**Success metric**: zero workspaces block on "insufficient credits" that could be resolved by self-serve top-up; admin manual-SQL incidents for upload credits drop to zero in the month after launch.

## 3. Non-Goals

- Changing the underlying ledger schema or the `reserve → consume/refund` spend lifecycle. M40 shipped those and they stay untouched.
- Cross-product credit transfers (e.g. swapping streaming minutes for upload credits). Separate product call.
- A bespoke billing provider — we reuse M32's PhonePe + Razorpay flow verbatim.
- Retroactive credits for pre-launch uploads.
- Redesigning the frontend recharge modal — reuse the streaming recharge UX with copy changes.

## 4. Product Decisions (REQUIRED BEFORE PIPELINE CONTINUES)

These five decisions drive schema sizing, pricing, and scope. Drafted defaults below reuse M31 streaming conventions so implementation stays mechanical. Stakeholder sign-off needed before `/cobolt-plan feature` runs.

### Decision 1 — Package taxonomy + pricing

Mirror streaming's three-tier package model but scaled to upload-credit economics (1 upload = 1 credit per M40 PRD Decision 1).

| Tier | Price (INR) | Credits | ₹/credit | Notes |
|---|---|---|---|---|
| Starter | 499 | 500 | 1.00 | Casual photographer, low volume |
| Pro | 1 499 | 2 000 | 0.75 | Weekly shooter, 20% volume discount |
| Studio | 4 999 | 8 000 | 0.625 | Multi-shooter studios, ~40% volume discount |

Stored in a new `upload_packages` table + `upload_rate_cards` for historical pricing, exactly mirroring `streaming_packages` + `streaming_rate_cards` (M31 migration 084).

**Open question**: is there appetite for an unlimited monthly add-on for standard/pro plans (e.g. ₹2 999/mo "heavy shooter") vs only credit-bundle packages? Streaming punted on this; upload could too.

### Decision 2 — Plan-tier monthly allowance

| Plan tier | Monthly free credits | Overage behavior |
|---|---|---|
| Standard | 200 | Reserve fails with 400 INSUFFICIENT_CREDITS until top-up |
| Professional | 1 000 | Same |
| Enterprise | unlimited_passthrough | Every Reserve writes an `unlimited_passthrough` entry (no balance check) |

The monthly allowance posts as `entry_type='grant_monthly'` on the billing-anniversary day via a scheduled worker. Allowance **does not roll over** — any unspent monthly credits expire at next cycle (matches streaming).

**Dependency**: Enterprise routing requires plan-tier plumbing through `TenantContext` middleware (ENH-UCR-001). Either via a JWT claim bump or a per-request workspace lookup.

### Decision 3 — Admin grant UX

Add a "Grant upload credits" action to the existing admin workspace detail page (`/admin/workspaces/{id}`) next to the streaming grant action. Posts `entry_type='grant_admin'` with the admin's user_id as `created_by` and a required `reason` field.

Audit trail via `platform_audit_log` (existing M7.5 table) — no new audit surface.

### Decision 4 — Invoice format + GST

Reuse M32's GST invoice numbering and template unchanged. Upload-credit purchases generate a standard tax invoice with the same `RD-INV-{fy}-{seq}` numbering. Price components: base + 18% GST, same as streaming. Invoice stored as existing S3-backed asset.

### Decision 5 — Refund behavior for unconsumed credits

If a user requests a refund within 7 days of purchase AND the credits from that purchase are fully unspent, allow a refund (posts `entry_type='refund'` tied to `purchase_id`). After 7 days or once any credits are consumed, refunds are denied. This matches streaming's "fresh purchases refundable" posture — it has not been contested in 6 months of operation.

---

## 5. Functional Requirements

### FR-UCRT-01 — Upload package catalogue

New `upload_packages` table (mirror of `streaming_packages`): `id`, `code` (starter/pro/studio), `credits`, `display_name`, `active`. Seeded by a new migration with the three tiers from Decision 1.

New `upload_rate_cards` table tracks historical pricing (effective-from timestamped) so past purchases preserve their rate for invoicing.

**Acceptance**: `GET /api/v1/uploads/packages` returns the three seeded tiers sorted by credits ascending.

### FR-UCRT-02 — Upload package purchase

New `credit.Service.Purchase(ctx, PurchaseInput) (*LedgerEntry, error)`:

- Inputs: `workspace_id`, `package_id`, `idempotency_key`, `provider`, `provider_txn_id`, `purchased_by`.
- Resolves active rate card at now(), computes credits + paise, inserts into `upload_purchases` + posts `entry_type='purchase'` ledger entry in one tx.
- Idempotent via the `UNIQUE(workspace_id, idempotency_key)` constraint already on `upload_purchases`. Re-entry returns the existing purchase unchanged.
- Mirrors `streaming/credit.Service.Purchase` line-for-line — the package comment in `upload/credit/credit.go:1-6` already promises this parity.

**Acceptance**: integration test in `credit_integration_test.go` (tagged) posts two Purchases with the same idempotency_key and asserts exactly one row in `upload_purchases`, exactly one `purchase` entry in `upload_ledger_entries`, and the balance only increments once.

### FR-UCRT-03 — Admin one-shot grant

`credit.Service.GrantAdmin(ctx, GrantAdminInput) (*LedgerEntry, error)`:

- Inputs: `workspace_id`, `credits`, `idempotency_key`, `reason`, `granted_by` (admin user id).
- Posts `entry_type='grant_admin'` with the admin as `created_by` and the reason in the `reason` column.
- Requires `platform_role IN ('super_admin','admin')` via `RequirePlatformRole` middleware (existing).

New handler: `POST /api/v1/admin/workspaces/{id}/upload-credits/grant` with body `{ credits, reason, idempotency_key }`.

**Acceptance**: 401 when unauthenticated, 403 when caller is `photographer`, 200 with the ledger entry when caller is admin. `platform_audit_log` has one new row per successful grant.

### FR-UCRT-04 — Monthly plan-tier allowance

`credit.Service.GrantMonthly(ctx, GrantMonthlyInput) (*LedgerEntry, error)`:

- Inputs: `workspace_id`, `billing_anniversary_date`, `idempotency_key`.
- Looks up `workspaces.plan_tier`, maps to the allowance from Decision 2, posts `entry_type='grant_monthly'`.
- Idempotency key is deterministic: `monthly:{workspace_id}:{YYYY-MM}` — same month grants are no-ops.

New scheduled worker in `backend/internal/worker/`: `UploadMonthlyGrantWorker`. Runs daily at 02:00 UTC (off-hours for the Indian user base), iterates every non-enterprise workspace whose billing anniversary falls on today's date, calls `GrantMonthly`. Enterprise workspaces are skipped because they use `unlimited_passthrough` at Reserve time.

**Acceptance**: run the worker twice on the same day; only the first run inserts a ledger row. Workspace with `plan_tier='standard'` sees +200 credits after first run, no change after second.

### FR-UCRT-05 — PhonePe webhook for upload purchases

New handler `POST /api/v1/webhooks/phonepe/uploads` in a new `backend/internal/upload/recharge/` package (mirrors `streaming/recharge`). X-VERIFY signature validation reuses `streaming/recharge/phonepe.go` unchanged (extract to a shared helper).

Webhook payload body → `PurchaseInput` with provider='phonepe' → calls `credit.Service.Purchase`.

**Acceptance**: replay test fixtures from `streaming/recharge/provider_test.go` adapted for upload semantics; duplicate webhook POST returns 200 and does not double-credit.

### FR-UCRT-06 — Razorpay webhook for upload purchases

`POST /api/v1/webhooks/razorpay/uploads` — same pattern as FR-UCRT-05 using Razorpay's `X-Razorpay-Signature` HMAC validator.

### FR-UCRT-07 — Plan-tier resolution in TenantContext

`middleware.TenantContext` is extended to resolve `workspaces.plan_tier` for the authenticated workspace and stash it on request context via a new `PlanTierFromContext(ctx)` helper.

Performance: one extra SELECT on the authenticated workspace row per request, cached for the request lifetime. Adds ~0.5 ms to p50 request latency (measured target).

**Acceptance**: unit test asserts `PlanTierFromContext` returns `enterprise` for an enterprise workspace; existing workspace middleware tests stay green.

### FR-UCRT-08 — Enterprise unlimited gate wiring

With plan-tier on the request context, restore `PlanCode` + `EnterpriseUnlimited` on `gate.ReserveRequest` (removed in M40 PR #37 with intent to restore when this feature landed). `CreateSession` reads plan tier, sets `EnterpriseUnlimited = planTier == "enterprise"`, passes through to the gate → credit service.

Enterprise Reserves post `entry_type='unlimited_passthrough'` with `amount_credits=0` — audit trail without balance impact.

**Acceptance**: a Reserve on an enterprise workspace with balance=0 succeeds (standard+professional with balance=0 still returns 400 INSUFFICIENT_CREDITS).

### FR-UCRT-09 — UAT seed fixtures with credits

Extend `backend/internal/database/seeds/uat_accounts.sql` (from PR #40) to grant upload credits to every `pho_*` workspace: 500 credits each via `grant_admin` entries. Idempotent on re-run (uses fixed `idempotency_key`).

**Acceptance**: after running `uat_accounts.sql` twice, each `pho_*` workspace has exactly 500 credits and exactly one `grant_admin` ledger entry.

### FR-UCRT-10 — Frontend recharge modal

Add an "Upload credits" tab to the existing streaming recharge modal component (shared component at `frontend/src/components/recharge/RechargeModal.tsx`). Tab shows the three upload packages from FR-UCRT-01, initiates purchase via existing PhonePe/Razorpay flow with `product='uploads'`.

Reuses:
- `useCreditBalance` hook pattern — already in PR #32
- Recharge modal layout from streaming
- Post-purchase balance refresh via polling on `/api/v1/uploads/balance`

**Acceptance**: Playwright test navigates to "out of credits" state, opens recharge modal, picks Starter pack, completes the mocked PhonePe flow, asserts new balance reflects in the pill within 5 seconds.

### FR-UCRT-11 — Refund within grace window

Existing `credit.Service.Refund` stays unchanged for reservation refunds (already shipped in M40). New path: `credit.Service.RefundPurchase(ctx, RefundPurchaseInput)` — accepts a `purchase_id`, checks `created_at >= now() - 7 days` AND sum of `consume`/`reserve` entries referencing credits from this purchase is zero, posts `entry_type='refund'` for the full purchase amount.

New handler: `POST /api/v1/uploads/purchases/{id}/refund` scoped to the purchase's workspace owner.

**Acceptance**: integration test — purchase → refund within 7 days succeeds; purchase → consume one credit → refund fails with 422 CREDITS_PARTIALLY_CONSUMED; purchase → wait 8 days (simulated clock) → refund fails with 422 REFUND_WINDOW_EXPIRED.

## 6. Non-Functional Requirements

### NFR-UCRT-P1 — Latency budget
- Purchase handler p95 < 500 ms (dominated by DB inserts + provider callback validation).
- Admin grant p95 < 300 ms.
- Balance read unchanged — already covered by M40 PERF-002 rollup.
- Monthly-grant worker tolerates 24h late execution without data loss (idempotent per month).

### NFR-UCRT-R1 — Idempotency (non-negotiable)
Every entry point MUST be idempotent on `idempotency_key`:
- Purchase webhooks: provider's transaction ID as key. Retried webhook is a no-op.
- Admin grant: caller-supplied key, required field.
- Monthly grant: deterministic `monthly:{workspace}:{YYYY-MM}` key.
- Refund: deterministic `refund-purchase:{purchase_id}` key.

Enforced at the DB layer by the existing `idx_upload_ledger_workspace_idem_key` partial unique index (migration 098) plus `upload_purchases_workspace_idem_key` UNIQUE (migration 097).

### NFR-UCRT-R2 — Concurrent correctness
Reuses M40's `FOR UPDATE` pattern on `upload_credit_balance_rollup` (shipped in PR #39). No new concurrency primitive needed — the rollup row-level lock already serialises concurrent Reserves, and purchases / grants are additive so there's no balance-race risk.

### NFR-UCRT-S1 — Security
- Webhook signature validation **must** run before any DB write. Invalid signature → 401, no ledger write.
- Admin grant: `RequirePlatformRole('super_admin','admin')` middleware. Non-admins get 403 before the handler body.
- Refund: caller must be the workspace owner (existing `RequireOwner` middleware).
- Provider transaction IDs stored in plaintext (not PII under our classification); no new KEK rotation needed.

### NFR-UCRT-O1 — Observability
- `platform_audit_log` entries for every admin grant (actor, target, amount, reason).
- Structured log lines for every ledger write (already covered by M40 credit service).
- Metrics: purchase count + amount per provider per day; monthly-grant worker run duration + rows-affected; refund approval rate (wins/total requests).
- Dashboard: extend the existing streaming credits dashboard with parallel "Upload credits" panels. No new Grafana board.

### NFR-UCRT-C1 — Compliance
- GST invoicing reuses M32's flow unchanged. Every `upload_purchases` row with `status='confirmed'` generates an invoice.
- Ledger append-only guarantee (M40 migration 098 design note) extends to all new entry types.

## 7. Architecture Delta

### Schema
- **New migration (102)**: `upload_packages` + `upload_rate_cards` tables (mirrors 084 for streaming), seed the three tiers.
- **No changes to 097-101**: every new ledger write uses the existing `upload_ledger_entries` schema; the trigger from migration 101 automatically maintains `upload_credit_balance_rollup` for all new entry types.

### Service layer
- Extend `backend/internal/upload/credit/credit.go` with `Purchase`, `GrantAdmin`, `GrantMonthly`, `RefundPurchase` methods. Follow the existing idempotency-first-then-tx pattern.
- Lift shared webhook validation (X-VERIFY, X-Razorpay-Signature) out of `streaming/recharge` into `internal/payments/webhook-signature` if not already shared.

### Handlers
- New package `backend/internal/upload/recharge/` — port `streaming/recharge/handler.go` verbatim with `product='uploads'` routing.
- Extend `backend/internal/upload/handlers/` with `admin_grant_handler.go` + `purchase_refund_handler.go` + `package_catalogue_handler.go`.

### Workers
- New `UploadMonthlyGrantWorker` in `backend/internal/worker/`. Registers via the existing `workerRegistry` in `cmd/api/main.go`.

### Middleware
- `TenantContext` additive: extra workspace-plan-tier lookup + context stash. No breaking change to existing callers.

### Frontend
- Extend `RechargeModal` with an "Upload credits" tab.
- New admin page action on `/admin/workspaces/{id}` for credit grant.
- Reuse `useUploadCreditBalance` hook from M40 for balance refresh.

### Seeds
- `uat_accounts.sql` gains 16 `grant_admin` rows (one per `pho_*` UAT workspace).

## 8. Rollout Strategy

Plan for 3-4 waves of ~1 sprint each. Exact milestone assignment is for the planning skill to decide; proposed here as waves 1-4 of M41.

### Wave 1 — Service layer + admin grant + UAT seeds (~1 week)
FR-UCRT-01, FR-UCRT-03, FR-UCRT-09. Unblocks UAT immediately and gives ops the grant capability. No payment integration yet — purchases still manual until Wave 2.

### Wave 2 — Payment webhooks + monthly grants (~2 weeks)
FR-UCRT-02, FR-UCRT-04, FR-UCRT-05, FR-UCRT-06. The real revenue path. Ships behind a feature flag `upload_credits_paid_topup` for phased rollout.

### Wave 3 — Enterprise unlimited + plan-tier middleware (~1 week)
FR-UCRT-07, FR-UCRT-08. Decoupled from Wave 2 because it touches shared TenantContext — landing it alone lets us measure any auth-path latency regression before combining.

### Wave 4 — Frontend recharge UX + refund flow (~2 weeks)
FR-UCRT-10, FR-UCRT-11. Flip the `upload_credits_paid_topup` flag on for the first cohort of workspaces after Waves 2 + 3 have bedded in.

## 9. Risks

| Risk | Mitigation |
|---|---|
| PhonePe / Razorpay outage during purchase — user's card charged, ledger never updated | Webhook-first flow: the ledger write happens on webhook delivery, not at checkout. Providers retry webhooks for 48h. Dashboard + alert on `upload_purchases.status='pending'` older than 6h. |
| Monthly worker runs twice on the same day | Deterministic monthly idempotency key — second run's INSERT fails on unique index and the row is skipped. Telemetry catches zero-rows runs. |
| Admin grants abused for internal-only workspaces | `platform_audit_log` captures every grant. Monthly review by finance. Hard cap of 100 000 credits per admin grant (application-layer validation). |
| Enterprise unlimited_passthrough floods the ledger | Expected behaviour — entry `amount_credits=0` so rollup math is unchanged. Table growth is still one row per upload, matching the reserve pattern. Pre-existing M40 PERF-002 rollup keeps read latency flat. |
| Plan-tier middleware adds latency on every request | Measurement gate before rollout: p50 regression < 2 ms, p95 regression < 5 ms. If exceeded, cache workspace plan_tier in Valkey with 5-min TTL. |

## 10. Open Questions (BLOCKS PIPELINE UNTIL ANSWERED)

1. **Pricing** — are the Starter/Pro/Studio tiers in Decision 1 acceptable to finance / product? If not, revise the seed migration.
2. **Monthly allowance** — does Decision 2's 200 / 1 000 / unlimited split align with plan-tier value props?
3. **Enterprise unlimited** — is "every upload writes a passthrough entry" acceptable for high-volume enterprise workspaces (potential 100k entries/day), or do we want to short-circuit without any ledger write?
4. **Refund window** — is 7 days the right grace period? Streaming uses 7 days uncontested; worth a second sign-off here.
5. **Admin grant cap** — is 100 000 credits / grant the right guardrail, or different for super_admin vs admin?

## 11. References

- Analysis packet: `_cobolt-output/latest/analysis/upload-credits-20260420T160855Z/`
- Parent M40 PRD: `_cobolt-output/latest/planning/feature-prd.md` (status: shipped)
- M40 PERF-002 design: `docs/decisions/M40-PERF-002-credit-balance-rollup.md`
- Sibling streaming implementation: `backend/internal/streaming/credit/` + `backend/internal/streaming/recharge/`
- Upload credit service (current): `backend/internal/upload/credit/credit.go`
- Migrations: 097 (purchases), 098 (ledger), 099 (view), 100 (session FK), 101 (rollup)

## 12. Answers for Questions

1. Pricing — Starter / Pro / Studio tiers

Decision: KEEP as-is (Approved)

Your current structure is actually well-balanced:

Clear volume discount ladder
Easy to understand (₹/credit reduces predictably)
Matches buyer psychology (entry → growth → scale)
Minor refinement (optional but smart):
Rename “Studio” → “Scale” or “Business”
“Studio” is niche (photographers only)
“Scale” works across all segments (future-proof)

👉 Final:

Starter — ₹499 → 500 credits
Pro — ₹1499 → 2000 credits
Scale — ₹4999 → 8000 credits

📌 Why this works:

Entry price is low → reduces friction
Pro gives strong perceived value
Scale drives revenue (bulk buyers)

Verdict: ✅ No change required (just naming tweak optional)

2. Monthly allowance — 200 / 1000 / unlimited

Decision: KEEP but add one correction

Your current structure is logically correct, but slightly aggressive at lower tier.

Recommended tweak:
Standard → 300 (instead of 200)
Professional → 1000 (keep)
Enterprise → unlimited (keep)
Why:
200 feels restrictive → early churn risk
300 gives:
Better onboarding experience
Fewer “blocked uploads” early

📊 Product logic:

Free credits = engagement driver
Not revenue driver

Verdict:

Standard: 300 ✅
Professional: 1000 ✅
Enterprise: Unlimited ✅
3. Enterprise unlimited — ledger writes or skip?

Decision: DO NOT write per-upload ledger entries at scale

👉 Current proposal:

Write unlimited_passthrough entry per upload

👉 Problem:

At 100k uploads/day → 36M rows/year per customer
Ledger becomes:
Expensive
Hard to query
Useless for finance (0-value entries)
Recommended architecture (important change):

Hybrid approach:

❌ No per-upload ledger writes
✅ Instead:

Maintain daily aggregate record

workspace_id | date | uploads_count
Optional:
Sample logging (1 in 1000 uploads)
Or session-level aggregation
When to still write ledger?
Only for:
Purchases
Refunds
Admin grants

NOT for unlimited usage.

Why this is correct:
Ledger = financial system
Usage = analytics system

Mixing both → long-term pain.

Verdict:

❌ Remove per-upload passthrough ledger writes
✅ Replace with aggregated usage tracking
4. Refund window — 7 days

Decision: KEEP 7 days (Approved)

This is already validated in your system:

Matches streaming (consistency ✅)
Industry standard for digital credits
Low abuse risk due to:
“Unused only” constraint
Optional improvement (nice-to-have):

Add:

Auto-refund eligibility check API

UI message:

“Refund available for 7 days if unused”

Why not change?
Shorter → bad UX
Longer → abuse risk

Verdict: ✅ 7 days is correct

5. Admin grant cap — 100,000 credits

Decision: SPLIT by role (important improvement)

Current:

Flat 100k cap

Problem:

Too restrictive for super_admin
Too loose for admin misuse
Recommended:
Role	Max per grant
admin	50,000
super_admin	500,000 (or no cap with audit)
Additional guardrails (important):
Require reason (already there ✅)
Add:
Daily cap per admin (e.g., 100k/day)
Alert if:

3 grants/hour by same admin

Why:
Prevents misuse
Still allows operational flexibility
Finance stays comfortable

Verdict:

admin → 50k
super_admin → 500k or uncapped + audit