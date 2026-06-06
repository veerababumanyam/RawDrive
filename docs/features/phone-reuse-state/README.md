# Feature: Phone-reuse state machine + payment-before-workspace onboarding

**Slug:** `phone-reuse-state` · **Mode:** epic (6 slices) · **Flag:** `phone_reuse_enforcement`
(off until the final slice) · **Base:** `origin/main` (the in-flight billing changeset on
`fix/allow-wasm-webp-encoder-in-csp` is deliberately NOT a dependency).

## Business rule

> **One FREE account per (normalized) phone. Any additional account on that phone is allowed
> only if it pays — and a paid account that lapses does not silently become a second free
> account.**

Today's `users_phone_key` is both **too strict** (blocks a legitimate paid second account on a
phone that already has a free account) and **too weak** (no normalization → `9876543210`,
`+91 98765 43210`, `098765 43210` are distinct rows, so "one account per phone" is already
trivially bypassed by reformatting).

## State machine — `users.phone_reuse_state`

| State | Meaning |
|---|---|
| `free` | The phone's single free slot. |
| `paid_pending` | 2nd+ account on an already-used phone; **no workspace/quota until paid.** |
| `paid_active` | A `paid_pending` that completed payment — paid workspace + active subscription. |
| `paid_expired` | Was `paid_active`, subscription lapsed/cancelled; must renew or use a different phone. **Never falls back to free.** |

## Architecture decisions

- **D1 — Normalization.** Single Go `phone.Normalize()` (India-first: bare 10-digit → `91…`;
  explicit `+cc` preserved; strips spaces/dashes/parens/leading-0). Used at register,
  profile-update, onboarding, **and** the backfill — one source of truth, exhaustively tested.
- **D2 — Schema.** `phone_normalized VARCHAR(20)`; `phone_reuse_state VARCHAR(20) NOT NULL
  DEFAULT 'free' CHECK (...)` (VARCHAR+CHECK, matching `subscriptions.status`, not a PG enum);
  `paid_phone_verified_at TIMESTAMPTZ NULL`.
- **D3 — Constraint swap.** Drop `users_phone_key`; add partial unique index
  `ON users(phone_normalized) WHERE phone_reuse_state='free'` — DB enforces exactly one free
  account per normalized phone; the service routes the rest to `paid_pending`.
- **D4 — `req.Plan` is intent, never proof.** It only decides routing (used phone + paid intent
  → `paid_pending`; used phone + free intent → blocked). A paid tier is granted **only** after
  Razorpay HMAC / PhonePe status-API verification.
- **D5 — Pre-workspace payment path.** On-main settlement assumes a workspace exists. For
  `paid_pending` we add a signup order keyed by `user_id` + a settlement variant that *creates*
  the workspace with the paid tier, inserts the active subscription, flips → `paid_active`, sets
  `paid_phone_verified_at`, and refreshes the JWT (tier is not in the JWT).
- **D6 — `paid_expired` guard.** The in-flight billing-lifecycle worker is not on `main`, so the
  guard is enforced at access time: a paid-reuse account with no active subscription flips to
  `paid_expired` and is blocked from free-tier use.

## ⚠️ Backfill collision risk (the underestimated one)

The DB only ever blocked *byte-identical* phones, so adding `phone_normalized` uniqueness can
surface **pre-existing collisions** (two real accounts that signed up with differently-formatted
versions of one number). **Resolution (user-chosen): auto-resolve** — the earliest-created
account on a normalized phone keeps `free`; newer colliding free accounts are set to
`paid_expired` (outside the partial-unique predicate, so the index is creatable, and those users
get the same "renew/pay or change phone" path as a lapsed paid account). The backfill emits a
report of every collision group it touched.

## Slice DAG

1. **Normalization foundation** — `phone.Normalize` + migration 171 (`phone_normalized` + lookup
   index) + write-through. *No behavior change.* ✅
2. **State column + backfill + collision report** — migration 172 (`phone_reuse_state`,
   `paid_phone_verified_at`) + `cmd/backfill-phone-reuse-state` (authoritative Go backfill of
   both columns + auto-resolve collisions + report).
3. **Constraint swap + registration routing** — migration 173 (drop `users_phone_key` → partial
   unique index) + `featureflag.phone_reuse_enforcement` + register service routing.
4. **Payment-before-workspace onboarding** — signup order + settlement-creates-workspace + JWT
   refresh + frontend duplicate-phone→pay UX.
5. **`paid_expired` downgrade guard** — access-time enforcement.
6. **Flag-on + cleanup** — enable enforcement, retire the raw-phone 409 path, user guide.

See `../../decisions/ADR-phone-reuse-state.md` for the full rationale + STRIDE/compliance pass.

## Build status (this epic)

| Slice | State | Runtime-verified? |
|---|---|---|
| 1 normalization foundation | ✅ built + unit/build green | ✅ (pure logic) |
| 2 state column + backfill | ✅ built + unit/build green | ⚠️ backfill SQL needs a DB run (`--dry-run` first) |
| 3 constraint swap + routing | ✅ built + unit/build/vet green | ⚠️ migration 173 + index need a DB apply |
| 4 payment-before-workspace | ✅ **core** built (`signuppay` service + `PgStore` + Razorpay verifier + migration 174, all unit-tested) | ❌ HTTP handler + routes + tx Provisioner + JWT refresh + frontend = **runtime-UAT follow-up** |
| 5 paid_expired guard | ✅ built + unit green | ⚠️ access-time path needs a DB run |
| 6 flag-on + frontend | ✅ flag seed + signup-UX copy | ❌ frontend paid-signup funnel UI = runtime-UAT follow-up |

### Slice 4 — what is built vs. what needs runtime UAT

**Built + unit-tested (this session):**
- `internal/service/signuppay` — the orchestration core: `CreateOrder` (only `paid_pending`, paid tier required) and `Settle` (verify-BEFORE-provision, idempotent, paid_pending-only). 7 orchestration tests + 5 Razorpay-verifier tests.
- `signuppay.PgStore` over `signup_payment_orders` (migration 174).
- `signuppay.RazorpayVerifier` — HMAC-SHA256, constant-time, unit-tested. PhonePe verification deliberately returns an explicit error (needs the status-API client).

**Runtime-UAT follow-up (NOT runtime-verified — no booted stack / payment sandbox here):**
1. HTTP handler + routes: `POST /api/v1/signup/payment/order` (create) and `POST /api/v1/signup/payment/verify` (settle), mounted in `cmd/api/main.go`, JWT-protected for the `paid_pending` user.
2. A concrete `signuppay.Provisioner` composing `workspace.Service.CreateWithBootstrap` (paid tier + quota) + active-subscription INSERT + `users.phone_reuse_state -> paid_active` + `paid_phone_verified_at` + `signup_payment_orders` mark-paid, with idempotency keyed on order status.
3. JWT refresh after `paid_active` (tier is fetched on demand via `/auth/me`, but the post-payment client should refresh so the new workspace is in the token's `workspace_id`).
4. The Razorpay order-creation adapter (`CreateProviderOrder`) + the PhonePe create/verify adapters, reusing the platform-settings payment config.
5. Frontend: the duplicate-phone → "choose a paid plan & pay" signup funnel UI (design-token-pure, three themes).

These are wired behind `phone_reuse_enforcement` (off), so `main` is unaffected until the flag is enabled AND the follow-up funnel is runtime-verified.
