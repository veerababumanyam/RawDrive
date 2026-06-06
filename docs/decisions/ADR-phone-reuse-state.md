# ADR: Phone-reuse state machine + payment-before-workspace onboarding

- **Status:** Accepted (2026-06-06)
- **Context:** anti-abuse + monetization rule for phone reuse on signup.
- **Supersedes:** the global `users_phone_key` byte-exact unique constraint (migration 002).

## Context

`users.phone` carries a byte-exact `UNIQUE` constraint (`users_phone_key`, migration 002) and the
app applies **zero normalization** (only `strings.TrimSpace`). Two consequences:

1. **Bypassable:** `9876543210`, `+91 98765 43210`, `098765 43210` are distinct rows — the
   "one account per phone" rule is defeated by reformatting.
2. **Too strict where it does bite:** a real user who already has a free account cannot open a
   second (paid) account on the same phone, even though we *want* to allow that if they pay.

We want: **one free account per phone; additional accounts only if paid; a lapsed paid account
does not silently become a second free account.**

## Decision

Introduce a four-state machine on `users.phone_reuse_state` (`free`, `paid_pending`,
`paid_active`, `paid_expired`), a canonical `users.phone_normalized` identity (`phone.Normalize`),
and replace the global unique constraint with a **partial unique index on `phone_normalized`
WHERE `phone_reuse_state='free'`**. Registration normalizes + looks up the phone and routes a
duplicate to `paid_pending` (free intent on a used phone is blocked). `paid_pending` accounts get
**no workspace/quota** until a payment is provider-verified; only then is the workspace created
with the paid tier, an active subscription inserted, the state flipped to `paid_active`, and the
JWT refreshed.

### Alternatives considered

- **Postgres ENUM type for the state** — rejected; the codebase models enumerations as
  `VARCHAR + CHECK` (`subscriptions.status`, migration 059). Adding a values to a PG ENUM later is
  awkward (`ALTER TYPE ... ADD VALUE` can't run in a transaction). VARCHAR+CHECK is consistent and
  evolvable.
- **Keep the global unique, just normalize it** — rejected; that fixes the bypass but keeps the
  "no legitimate paid second account" limitation, which is half the requirement.
- **Trust `req.Plan` to grant the paid tier** — **rejected, security-critical.** `req.Plan` is
  user input; selecting "studio" is not proof of payment. Provider verification (Razorpay HMAC /
  PhonePe status API) is the **only** source of truth. `req.Plan` decides *routing/intent* only.
- **Reuse the in-flight `billing_order_handler` signup-order infra** — rejected as a dependency;
  it is not on `main` (lives on `fix/allow-wasm-webp-encoder-in-csp`). Building off `main` we hook
  the on-main `subscription_upgrade_handler` payment path and add a focused signup-order surface.
  Reconciliation with the in-flight billing work is a follow-up, noted as residual risk.

## Backfill & the collision hazard (consequential)

The byte-exact constraint only ever blocked identical strings, so normalized-phone **collisions
can already exist** in production (two accounts that used differently-formatted versions of one
number). The partial unique index **cannot be created while two `free` rows share a
`phone_normalized`**. Therefore:

- The Go backfill (`cmd/backfill-phone-reuse-state`) computes `phone_normalized` +
  `phone_reuse_state` for every existing user and, per normalized-phone group, **auto-resolves**:
  earliest-created paid account → `paid_active`; earliest-created otherwise → `free`; **every
  newer collider → `paid_expired`** (outside the unique predicate, creatable, and gives those
  users the renew/pay/change-phone path). It emits a report of every group it touched.
- The constraint-swap migration (173) runs only after the backfill; a precheck fails closed if any
  unresolved `free` collision remains.

## STRIDE-lite + compliance pass

- **Spoofing / Elevation:** the core threat is "claim a paid tier without paying." Mitigated by
  D4 — tier is granted only on provider-verified payment; `paid_pending` holds no workspace/quota.
- **Tampering:** state transitions are server-side only; `phone_reuse_state` is never client-set.
- **Repudiation:** payment settlement + state flips are written in the same DB transaction and
  recorded (audit/analytics events per the existing subscription settlement path).
- **Information disclosure:** registration responses stay enumeration-safe — "this number already
  has an account; a paid plan is required" is shown only after the same generic-handling pattern
  the existing phone-taken 409 uses; no cross-account data is leaked.
- **DoS:** `paid_pending` accounts consuming no quota/workspace caps abuse cost.
- **DPDP/GDPR:** `phone_normalized` is derived PII (no new data category); same retention/erasure
  as `phone`. `paid_phone_verified_at` is a timestamp, not sensitive. No new third-party sharing.
- **SCS:** SCS-023/024 (authZ on the new signup/settlement endpoints — JWT via
  `middleware.JWTClaimsFromContext`, ownership checks), SCS-030/031 (no hardcoded payment creds —
  resolved via `platform_settings`→env), SCS-040.. (payment HMAC verification unchanged, reused),
  SCS-010.. (no PII in logs).

## Consequences

- `users_phone_key` is dropped; uniqueness is now identity-based + state-aware.
- A new pre-workspace payment surface exists (signup order keyed by `user_id`).
- Everything ships behind `phone_reuse_enforcement` (default off); registration/onboarding behave
  exactly as today until the flag is enabled in the final slice.
- Residual risk: reconciliation with the in-flight billing changeset; non-India numbers rely on an
  explicit `+cc` (a bare non-Indian 10-digit is assumed Indian — acceptable for an India-first
  product, documented).
