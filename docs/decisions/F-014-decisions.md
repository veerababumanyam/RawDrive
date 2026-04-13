# F-014 Live Streaming Commercialization — Decisions

Resolved during M31 build (2026-04-13). These fill the "open decisions" the F-014
planner deferred. Treat as source of truth for M31–M35 implementation.

## D1. Package Taxonomy

Three tiers, all paise-precise, seeded in migration 084.

| Tier       | Price (INR) | Minutes | Max concurrent viewers | Replay TTL |
| ---------- | ----------- | ------- | ---------------------- | ---------- |
| Basic      | 499         | 60      | 50                     | 7 days     |
| Pro        | 1 499       | 180     | 200                    | 30 days    |
| Enterprise | 4 999       | 600     | 1 000                  | 90 days    |

**Base credit rate:** 100 paise / minute (₹1/min). Package prices above are
effective top-ups; purchasing a package posts `minutes * 100` paise of credit,
subject to the active `streaming_rate_cards` row at purchase time.

## D2. Overage Policy

When a live stream exceeds its reserved minutes:

- Streaming continues, but each additional minute is metered at **150 paise/minute**
  (1.5× base), posted to the ledger as `entry_type = 'overage'`.
- Hard stop at **1.5× package duration**. Enforced by the stream control loop
  (M33): once overage minutes > 0.5 × package minutes, the stream is force-ended.
- Overage entries are always positive-magnitude debits, append-only like all
  ledger entries.

## D3. Replay Retention

Replay TTL is package-tier-scoped (see D1). Enforced by:

- `streams.replay_expires_at` computed at stream end (`ended_at + tier_ttl`).
- A daily worker (M33 reconciliation-poller) deletes expired assets from
  Cloudflare Stream and sets `streams.replay_state = 'expired'`.
- No grace period; the UI shows "Replay expired" once `replay_expires_at < now()`.

## D4. Cloudflare Signed Playback

- All `cf_playback_url` access requires a **viewer session JWT** (from M30
  `streaming/viewer`) regardless of PIN protection.
- CF Stream signed URL: **HS256**, 15-minute TTL, bound to viewer session ID
  (embedded as `sub` claim) and stream ID (embedded as `aud`).
- Signing key lives in `platform_settings['streaming.cf_signing_key']`,
  envelope-encrypted via F-005 KEK.
- Rotation: lands in M33 (E105-S5 ingest-key rotation / reveal audit).

## D5. Payment Provider Scope

- **PhonePe primary**, launched in M32 (standard checkout + X-VERIFY webhook).
- **Razorpay fallback**, code lands in M32 but is gated behind
  `platform_settings['payments.razorpay_enabled'] = true` (super-admin flip).
- Both providers post to the same ledger via identical `credit.Purchase()`
  code path — no provider-specific ledger branches.

## Milestone-Story Assignment (reconciles dossier drift)

- **M31** (schema foundation + rate-card UI): stories 31-1..31-6 as planned.
- **M32** (events + reservations + payments): introduces `streaming_reservations`
  *lifecycle operations* (the table lands in M31); adds PhonePe checkout,
  Razorpay fallback, GST invoice, refund flow.
- **M33**: CF Stream ops, webhooks, reconciliation, realtime.
- **M34**: Dashboard console, public viewer, desktop preflight, notifications.
- **M35**: Analytics, governance, migration cleanup, release readiness.

## Implementation Ordering Guard

Within M31, migrations MUST apply in order: 083 (streams ext) → 084 (packages/rates)
→ 085 (purchases/ledger) → 086 (reservations) → 087 (events/sessions/audit).
Each is independent but downstream FKs depend on upstream tables existing.
