# Caching Mechanism Review — Pre-Production Audit

**Date:** 2026-06-05  
**Scope:** Full-stack caching (Go backend, Next.js frontend, nginx, Valkey)  
**Trigger:** Pre-production review before HA active-active transition

---

## Deployment Context

RawDrive runs two app nodes (`.42` primary, `.44` backup). nginx is configured with `.44` as a `backup` upstream — it only activates when `.42` is unhealthy. The Patroni HA plan (PR #154, flag-gated) would promote this to true active-active. Risk severities below reflect **current primary/backup mode**; they escalate if active-active is enabled.

---

## Risk Register

### 🔴 CRITICAL — Fix Before Active-Active HA

#### C-1: TOTP Used-Code Replay Protection Is Per-Node Only

**File:** `backend/internal/auth/totp.go:58`

The `usedCodes sync.Map` tracking consumed TOTP codes within the 120-second validity window lives entirely in each node's process memory. A code verified on `.42` is unknown to `.44`.

- **In primary/backup mode:** Risk is low — `.44` is inactive under normal load. Activates only on failover.
- **In active-active mode:** A user can replay a valid TOTP code on the second node within the 120-second window to create a second session.
- **Code acknowledges this:** `auth/totp.go:72` — *"A horizontal scale-out would back this with Valkey; tracked alongside the consumedChallenges scale-out note."*

**Fix:** Replace `sync.Map` with `SETEX totp:used:{sha256(secret+":"+code)} 130 1` in Valkey (130s covers the 120s replay window with margin).

---

#### C-2: MFA Challenge Token Denylist Is Per-Node Only

**File:** `backend/internal/auth/mfa_handler.go:116`

`consumedChallenges sync.Map` tracks single-use `mfa_token` JWTs (5-minute lifetime). Same structural gap as C-1: a token consumed on `.42` can be replayed on `.44` within the 5-minute window.

- **Code acknowledges this:** `mfa_handler.go:129` — *"A horizontal scale-out would want a Valkey-backed denylist instead; that is tracked as a separate Tier A finding."*

**Fix:** `SETEX mfa:challenge:{sha256(token)} 310 1` in Valkey (310s covers the 5-minute JWT lifetime).

---

### 🟠 HIGH — Operational Risk in Current Deployment

#### H-1: Chunked Upload Sessions Have No Session Affinity

**File:** `backend/internal/handler/chunked_upload.go:155`

Rolling hash and tail-buffer state for multipart uploads lives in a per-node `sync.Map` keyed by upload ID. nginx does not set session affinity (`ip_hash` / sticky cookie absent from `deploy/nginx/templates/rawdrive.conf.template`). If a chunk POSTed on `.42` is followed by a PATCH on `.44`, the in-memory state is missing on `.44`.

- **Functional impact:** The `upload_sessions` table (Postgres) provides a durable cold path, so uploads *complete*, but rolling hash verification and Tier D spot-check state are lost on a node switch.
- **Code notes this:** `chunked_upload.go:156` — *"finalize cold path handles that case."*

**Fix options (choose one):**
1. Add `hash $remote_addr consistent;` to `backend_upstream` in nginx config (1-line change, no code).
2. Persist stream state to `upload_sessions` table — migration 079 already exists, just not wired.

---

#### H-2: PIN Rate Limiter Has No Valkey Backing

**File:** `backend/internal/middleware/rate_limit_pin.go:37`

The PIN-verify rate limiter (5 attempts per `(IP, streamID)` per 5-minute sliding window) is enforced per-node via a `sync.Map`. In any multi-node scenario, an attacker gets 5 attempts per node.

- `NewRedisPINRateLimiter` is already scaffolded — it is just not wired in `cmd/api/main.go`.
- **Code acknowledges this:** `rate_limit_pin.go` comment — *"should swap RedisBucket in (see NewRedisPINRateLimiter, TODO M30+1)."*

**Fix:** Wire `NewRedisPINRateLimiter(valkeyRaw, ...)` in `main.go` where the current in-memory limiter is constructed.

---

### 🟡 MEDIUM — Document / Monitor

#### M-1: Platform Settings 30-Second Cross-Node Staleness

**File:** `backend/internal/repository/platform_settings_repo.go:16`

Admin writes platform settings on `.42` (SMTP creds, storage keys, feature flags) — `.44` continues serving the cached old value for up to 30 seconds. This is **intentional and documented in the source**:

> *"out-of-band writers — the sync-platform-settings-from-env one-off and an admin PUT landing on the other app node — are invisible to this process, so the TTL is the upper bound on cross-node staleness. 30s matches the operational expectation that settings/secret rotations are followed by a smoke test."*

**Action:** Add to `docs/runbooks/cicd.md` — after any `platform_settings` change, wait ≥30 seconds before traffic verification on the second node.

---

#### M-2: Valkey Fallback Is Silent

**File:** `backend/cmd/api/main.go:1121`, `backend/internal/middleware/valkey_ratelimit.go:23`

When Valkey is unavailable (startup or runtime), rate limiters silently fall back to per-node in-memory enforcement. No metric, no WARN log, no alert.

- During a Valkey outage, effective rate limits per IP double (each node enforces independently).
- The startup ping failure is logged at INFO level and treated as non-fatal.

**Action:** Emit a `valkey_fallback_active{limiter="global"|"credential"|"mfa"}` counter when the fallback code path is taken. Wire it to an alert.

---

#### M-3: Storage Analytics 1-Hour TTL Without Valkey

**File:** `backend/internal/service/storage_accounting_service.go:15`

Without Valkey, each node holds its own analytics cache with a 1-hour TTL. After a large upload finalized on `.42`, `.44`'s dashboard may show stale storage usage for up to 1 hour.

**Action:** Verify `VALKEY_URL` is set in production `.env.cobolt` and that the `valkeyAnalyticsCache` is wired (`cmd/api/main.go:1898`). If confirmed, this is resolved.

---

### 🟢 Acceptable — No Action Needed

| Item | File | Verdict |
|---|---|---|
| Public gallery 15s TTL | `service/gallery_service.go:69` | Eager invalidation on publish/edit/delete. Valkey-backed when available. ✅ |
| Platform settings eager invalidation | `repository/platform_settings_repo.go:275,288` | Same-node writes invalidate immediately. ✅ |
| Frontend `cache: "no-store"` | `lib/api/galleries.ts`, `photographer-profile.ts` (8 calls) | All dynamic public-page fetches correctly bypass Next.js Data Cache. ✅ |
| WebP derivative `immutable` | `handler/edge_delivery_handler.go:65` | Content-addressed keys; `max-age=86400, immutable` is correct. ✅ |
| Password-gated gallery `no-store` | `handler/public_gallery_handler.go:1155` | Correctly prevents edge caching of private content. ✅ |
| MFA enroll `no-store` | `handler/mfa_handler.go:306` | Plaintext TOTP secret response correctly uncached. ✅ |
| Consent hash `sync.Map` (no TTL) | `service/consent_service.go:87` | SHA-256 of immutable text — no TTL needed. ✅ |
| Upload policy 5-min TTL | `service/upload_policy_catalog.go:36` | Admin-only mutation path; stale fallback on network error acceptable. ✅ |
| nginx immutable static assets | `deploy/nginx/templates/rawdrive.conf.template:83` | `max-age=31536000, immutable` + 7-day proxy_cache for `/_next/static/*`. ✅ |
| Gallery session cookie 24h | `components/gallery/public-gallery-session-bridge.tsx:63` | Readable cookie → best-effort HttpOnly upgrade pattern is correct. ✅ |
| Media encryption keys in localStorage | `lib/media-encryption/media-key-store.ts:16` | Client-only, never hits wire. ✅ |
| IndexedDB offline catalog | `lib/offline/catalog.ts` | Etag + revalidation-on-reconnect; 403/404/410 purge. ✅ |
| Decrypted asset object URL revocation | `lib/media-encryption/use-decrypted-asset-url.ts:239` | Revoked on unmount, no memory leak. ✅ |
| TOTP code sweep | `auth/totp.go:163` | Opportunistic eviction of expired entries on each call (max 16). Acceptable for single-node. ✅ |

---

## Complete Cache Inventory

### Backend — TTL Reference

| Cache | TTL | Shared via Valkey? | Location |
|---|---|---|---|
| Public gallery metadata | 15s | Optional | `service/gallery_service.go:69` |
| Studio landing page | 15s | Optional | `handler/public_gallery_handler.go:99` |
| Platform settings | 30s | No (in-proc only) | `repository/platform_settings_repo.go:25` |
| Terms active version | 60s | No | `service/terms_service.go:22` |
| Viewer count | 5s | No | `streaming/viewer/count_cache.go:64` |
| TOTP used-code replay | 120s | No (**gap**) | `auth/totp.go:36` |
| MFA challenge denylist | 5min | No (**gap**) | `auth/mfa_handler.go:116` |
| Upload policy validity | 5min | No | `service/upload_policy_catalog.go:36` |
| Workspace upload policy | 5min | Optional | `service/workspace_policy_service.go:105` |
| PIN rate limiter | 5min sliding | No (**gap**) | `middleware/rate_limit_pin.go:37` |
| Storage analytics | 1h | Optional | `service/storage_accounting_service.go:425` |
| Consent text hash | ∞ | No (immutable) | `service/consent_service.go:87` |
| Chunked upload session | Session lifetime | No (**gap**) | `handler/chunked_upload.go:158` |

### Frontend — Caching Architecture Summary

- **Server Components:** All dynamic routes use `export const dynamic = "force-dynamic"` or `cache: "no-store"`. No `unstable_cache` or React `cache()` in use.
- **No TanStack Query / SWR.** All caching is manual.
- **Media encryption:** Keys cached in module-level `Map` + localStorage. Decrypted blobs cached in Cache Storage; evicted on 4xx.
- **Offline:** IndexedDB catalog + per-gallery Cache Storage buckets (Service Worker managed).
- **Sessions:** 24h cookie (`Secure`, `SameSite=Strict`) + best-effort HttpOnly upgrade.

---

## Recommended Fix Order

1. **C-1** — TOTP Valkey denylist (`SETEX totp:used:{hash} 130 1`) — security correctness, ~30 LOC
2. **C-2** — MFA challenge Valkey denylist (`SETEX mfa:challenge:{hash} 310 1`) — same pattern, already tracked as Tier A
3. **H-2** — Wire `NewRedisPINRateLimiter` in `cmd/api/main.go` — scaffolding already exists
4. **H-1** — Add `hash $remote_addr consistent;` to nginx `backend_upstream` — 1-line nginx change
5. **M-2** — Emit `valkey_fallback_active` counter metric in `valkey_ratelimit.go` fallback branch
6. **M-1 / M-3** — Runbook entries, no code changes

Items C-1 through H-2 should be resolved before enabling Patroni active-active. Items M-1 through M-3 are operational hygiene.

---

## Verification Checklist (Post-Fix)

```bash
# C-1: TOTP Valkey key written on verify
redis-cli -u $VALKEY_URL keys "totp:used:*"

# C-2: MFA challenge key written on verify-totp
redis-cli -u $VALKEY_URL keys "mfa:challenge:*"

# H-1: nginx sticky routing (same node across 5 requests)
for i in $(seq 5); do curl -s http://.42/api/v1/health | jq -r .node; done

# H-2: PIN rate limiter Valkey key written
redis-cli -u $VALKEY_URL keys "ratelimit:pin:*"

# Regression: full test suite
npm run test:backend
npm run test:frontend
```
