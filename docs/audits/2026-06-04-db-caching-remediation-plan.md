# RawDrive — DB & Caching Remediation Plan

**Date:** 2026-06-04
**Baseline audited:** `origin/main` @ `36e15cfd` (`perf(galleries): batch-hydrate cover + preview via ?include_assets #61`)
**Scope:** Database (Postgres 16 + pgvector), caching (Valkey + in-process), background workers, query/index coverage, and the public serving surface (public gallery share + studio profile). Plus end-to-end performance scope.
**Status of baseline:** Every prior **P0/HIGH** finding is already fixed and regression-tested on `main`. This plan covers the **remaining open / partial items**, the **new gaps** surfaced during the re-audit, and a **regression** the remediation batch itself introduced.

> All `file:line` references are against `origin/main` @ `36e15cfd`. Land every change via `npm run ship -- "<type>(<scope>): subject"` (never push to `main`). Each fix MUST carry a regression test (repo norm). Migrations are append-only and numbered after checking `origin/main`.

---

## How to read this plan

- **Priority:** P0 (do first — correctness/security/biggest perf ceiling) → P1 → P2.
- **Effort:** S (≤½ day) · M (½–2 days) · L (>2 days / multi-PR).
- **Risk:** **SAFE** (additive, low blast radius) · **RISKY** (behavior/infra change, needs measurement) · **DECISION** (needs your sign-off before work starts).
- **Theme:** the recurring root cause across most remaining items is **multi-node reality** — RawDrive runs 2 app nodes (`.42`/`.44`) but several caches/behaviors were written single-process, and the **public/anonymous serving path** (where photography clients actually land) is uncached, uncompressed, and un-CDN'd.

### Decisions required before Phase 2 starts
| ID | Decision | Why it's blocked on you |
|----|----------|--------------------------|
| PERF‑CDN | Put a CDN / signed-URLs in front of WebP derivatives? | Infra cost + topology; E2EE galleries must stay proxied. The single biggest throughput ceiling. |
| VEC‑2 | Target recall for face/semantic search (sets `hnsw.ef_search`) | Recall vs latency trade-off; needs a measurement pass. |
| PERF‑JETSTREAM | Move job dispatch from DB-polling to JetStream push consumers? | Architectural change to the worker pipeline. |
| PERF‑VIRT | Adopt a virtualization library for the public grid? | Interacts with masonry layout, deep-linking, face-filter windowing. |
| DB‑3 | Complete the RLS rollout, or formally stay app-enforced? | Strategic; documented ADR already leans app-enforced. |

---

## Master tracking table

| ID | Title | Priority | Effort | Risk | Phase |
|----|-------|----------|--------|------|-------|
| PERF‑GZIP | Response compression middleware | P0 | S | SAFE | 0 |
| PERF‑HDR | `Cache-Control` + 304 on public reads | P0 | M | SAFE | 0 |
| VEC‑2 | Tune `hnsw.ef_search` for face + semantic search | P0 | S | RISKY/DECISION | 0 |
| MIG‑160 | Resolve `160` migration-number collision + CI guard | P0 | S | SAFE | 0 |
| Q‑3 | Index `album_assets.asset_id` (FK / cascade) | P1 | S | SAFE | 0 |
| Q‑6 | Fix silently-shadowed `idx_assets_ai_tags` | P1 | S | SAFE | 0 |
| VEC‑4 | Runtime HNSW index-existence test | P1 | S | SAFE | 0 |
| VEC‑7 | Stop embedding the `"photograph"` fallback | P1 | S | SAFE | 0 |
| CACHE‑6 | Evict expired in-memory limiter keys | P2 | S | SAFE | 0 |
| CACHE‑8b | Remove dead `config.ValkeyURL`; doc Valkey config | P2 | S | SAFE | 0 |
| DB‑1b | Atomic claim for `asset_purge_worker` | P2 | S | SAFE | 0 |
| PUB‑CACHE | Cache public gallery + studio-profile metadata | P1 | M | SAFE | 1 |
| CACHE‑4 | Cross-node invalidation for storage-widget cache | P1 | M | SAFE | 1 |
| CACHE‑5 | Workspace-policy cross-node invalidation | P1 | M | SAFE | 1 |
| CACHE‑7 | Central `internal/cache` package + metrics + singleflight | P1 | L | SAFE | 1 |
| PERF‑WRK | Worker intra-batch concurrency | P1 | M | SAFE | 1 |
| D2 | `pg_trgm`/FTS for gallery owner search | P1 | M | SAFE | 1 |
| Q‑2b | Batch seam for album asset hydration | P1 | M | SAFE | 1 |
| VEC‑5 | Config-resolve embedding model | P1 | M | SAFE | 1 |
| VEC‑6 | Embedding backfill + gap index + retry | P1 | M | SAFE | 1 |
| CACHE‑2 | Wire (or remove) the RBAC role cache | P2 | M | SAFE | 1 |
| DB‑6b | Generic DB transient-retry + Prometheus `/metrics` | P1 | M | SAFE | 1 |
| Q‑4 | Keyset pagination on asset/gallery lists | P2 | M | SAFE | 1 |
| Q‑5 | Indexes for exif-model filter + filename/size sort | P2 | S | SAFE | 1 |
| PERF‑SPLIT | Code-split heavy gallery panels | P1 | M | SAFE | 1 |
| PERF‑RUM | web-vitals RUM reporter | P2 | M | SAFE | 1 |
| DB‑2b | Live-DB test that timeouts apply to pooled conns | P2 | S | SAFE | 1 |
| PERF‑CDN | CDN / signed-URLs for derivatives | P0 | L | DECISION | 2 |
| DB‑3 | RLS: complete rollout or harden app-enforcement | P1 | L | DECISION | 2 |
| PUB‑CAP | Paginate studio landing (60-gallery cap) | P1 | M | SAFE | 2 |
| PERF‑JETSTREAM | Event-driven job dispatch | P2 | L | DECISION | 2 |
| PERF‑VIRT | Virtualize public gallery grid | P2 | L | DECISION | 2 |

---

## Phase 0 — Quick SAFE wins + the P0 ceiling-relievers
*Goal: land in the first sprint. All low-risk except VEC‑2 (which needs a recall target).*

### PERF‑GZIP — Response compression middleware · P0 · S · SAFE
- **Problem:** The global Chi middleware stack has no compression, so large JSON list payloads (public gallery `ListAssets`, owner `include_assets` hydration, admin analytics) go out uncompressed.
- **Evidence:** `backend/cmd/api/main.go:1150-1179` (no `chimw.Compress`).
- **Fix:** Add `chimw.Compress(5)` to the global stack (after RequestID, before routes). Verify it doesn't double-compress already-gzipped storage streams (scope it to JSON content types or place before the `/storage` proxy mount).
- **Acceptance:** list endpoints return `Content-Encoding: gzip`; payload ≥60% smaller for a 200-asset gallery; storage byte-streams unaffected.

### PERF‑HDR — `Cache-Control` + conditional 304 on public reads · P0 · M · SAFE
- **Problem:** Public reads re-query + re-serialize the full body on every view. An `ETag` is emitted but `If-None-Match` is never honored. Derivative cache headers are inconsistent (`private` on the proxy, none on the encrypted handler, correct only on edge delivery).
- **Evidence:** ETag emitted, never honored `backend/internal/handler/public_gallery_handler.go:907`; proxy `Cache-Control: private, max-age=3600` `backend/cmd/api/main.go:3042`; `encrypted_derivative_handler.go` sets none; correct pattern at `edge_delivery_handler.go:65` (`public, max-age=86400, immutable`).
- **Fix:** (1) Honor `If-None-Match` on public gallery/profile GETs → return `304`. (2) Standardize derivative headers to `public, max-age=…, immutable` where not E2EE-gated; keep E2EE-gated derivatives `private`. (3) Add a short `s-maxage` to public metadata responses to enable a future CDN/edge.
- **Acceptance:** repeat public gallery GET with `If-None-Match` returns `304` with empty body; non-E2EE derivatives are browser/shared-cacheable.

### VEC‑2 — Tune `hnsw.ef_search` for face + semantic search · P0 · S · RISKY/DECISION
- **Problem:** Only dedup tunes `ef_search`; the two user-facing search paths run at the pgvector default (40) → lower recall on large embedding sets.
- **Evidence:** dedup sets it `backend/internal/ai/duplicate_service.go:111`; **not** set in `backend/internal/ai/search_service.go:188` or `backend/internal/repository/face_repo.go:84,121,164,199`.
- **Fix:** Wrap face-search and semantic-search queries in a tx with `SET LOCAL hnsw.ef_search = <N>` (mirror dedup). **Decision needed:** pick `N` from a recall/latency measurement (start 100). Optionally set a server default in `deploy/postgres/postgresql.conf`.
- **Acceptance:** a recall fixture (known same-person / known semantic match) that fails at ef_search=40 passes at the chosen N; p95 latency stays within budget.

### MIG‑160 — Resolve the `160` collision + add a CI guard · P0 · S · SAFE
- **Problem:** This remediation batch introduced two distinct migrations numbered `160` (`160_ai_jobs_claimed_at` + `160_role_session_timeouts`). Runs fine (distinct version keys) but violates the append-only/unique-number rule and is a latent ordering hazard. Legacy `006`×2 and `133`×2 also exist.
- **Evidence:** both `160_*` pairs in `backend/internal/database/migrations/`.
- **Fix:** Append a renumbered copy of the **younger** `160` (e.g. `162_role_session_timeouts`) and retire the duplicate per the project's renumber-before-merge guidance; do **not** edit committed migrations beyond what the runner requires. Add a CI check (`scripts/`) that fails on duplicate numeric prefixes in the migrations dir.
- **Acceptance:** `ls migrations | duplicate-prefix-check` is clean; CI gate added; migration suite still green.

### Q‑3 — Index `album_assets.asset_id` · P1 · S · SAFE
- **Problem:** FK `asset_id → assets(id) ON DELETE CASCADE` has no leading index (PK + the new `153` index both lead on `album_id`), so asset deletes and reverse lookups seq-scan `album_assets`.
- **Evidence:** FK `038_m11_asset_metadata_albums.up.sql:53`; no `asset_id`-leading index.
- **Fix (new migration):**
  ```sql
  CREATE INDEX IF NOT EXISTS idx_album_assets_asset_id ON album_assets (asset_id);
  ```
  Add a migration contract test asserting the index exists.
- **Acceptance:** `EXPLAIN` of an asset-delete cascade / reverse lookup uses the index; contract test passes.

### Q‑6 — Fix the silently-shadowed `idx_assets_ai_tags` · P1 · S · SAFE
- **Problem:** Two `CREATE INDEX IF NOT EXISTS idx_assets_ai_tags` with different predicates; `019` wins the name, so `044`'s intended stricter partial (`WHERE ai_tags != '[]' …`) never gets created — prod runs the looser, larger index.
- **Evidence:** `019_assets_ai_columns.up.sql:10` vs `044_m11_deferred_features.up.sql:58`.
- **Fix (new migration):** `DROP INDEX IF EXISTS idx_assets_ai_tags;` then recreate with the intended partial predicate. (Append-only — do not edit 019/044.)
- **Acceptance:** `pg_indexes` shows the stricter predicate; contract test asserts `indexdef` contains `ai_tags != '[]'`.

### VEC‑4 — Runtime HNSW index-existence test · P1 · S · SAFE
- **Problem:** Tests assert the embedding column *type* only; nothing asserts the HNSW indexes actually exist post-migration. A failed/dropped index build passes CI.
- **Evidence:** `m149_migrations_test.go:42` (file-text assert); `migrations_test.go:705` (type only); unused helper `integration_helpers_test.go:107` (`indexExists`).
- **Fix:** Add a live-DB test (using `indexExists`) asserting `idx_assets_embedding_hnsw` and `idx_face_clusters_embedding_hnsw` exist with `vector_cosine_ops`.
- **Acceptance:** test fails if either HNSW index is missing.

### VEC‑7 — Stop embedding the `"photograph"` fallback · P1 · S · SAFE
- **Problem:** When caption+tags are empty, the embedding text is the literal `"photograph"`, producing near-identical generic vectors that cluster as false near-duplicates and pollute semantic search. A test currently *enforces* this behavior.
- **Evidence:** `backend/internal/ai/search_service.go:147-149`; test `TestF110_BuildEmbeddingTextFallback`.
- **Fix:** Skip `IndexAsset` (leave `embedding` NULL, mark for backfill — see VEC‑6) when both caption and tags are empty; update the test to assert "no embedding written" instead.
- **Acceptance:** empty-source asset gets no embedding; dedup no longer groups untagged assets together.

### CACHE‑6 — Evict expired in-memory limiter keys · P2 · S · SAFE
- **Problem:** The in-memory fallback limiter map and the PIN limiter never delete expired keys → slow unbounded growth by distinct-IP cardinality (only exercised during a Valkey outage, so low urgency).
- **Evidence:** `backend/internal/middleware/middleware.go:439-497`; `rate_limit_pin.go:30-82`.
- **Fix:** Add a background janitor (ticker) or convert to a bounded TTL map that `delete()`s on sweep.
- **Acceptance:** map size returns to baseline after keys expire (unit test with a fake clock).

### CACHE‑8b — Remove dead config + document Valkey config · P2 · S · SAFE
- **Problem:** `config.ValkeyURL` is loaded but never read (wiring uses `os.Getenv` directly). Valkey config is env-only (not in `platform_settings`).
- **Evidence:** `backend/internal/config/config.go:61` (unused); `main.go:1026`.
- **Fix:** Delete the dead field, or wire it. Document that Valkey config is intentionally env-only (it's bootstrap infra, like the DSN) so it isn't mistaken for a `platform_settings` gap.
- **Acceptance:** no dead field; one-line note in AGENTS.md / config doc.

### DB‑1b — Atomic claim for `asset_purge_worker` · P2 · S · SAFE
- **Problem:** Still list-then-delete with no `FOR UPDATE SKIP LOCKED`; two nodes can select the same soft-deleted row. Idempotent today (wasted work, not corruption) but inconsistent with the other 6 workers.
- **Evidence:** `backend/internal/worker/asset_purge_worker.go:65`.
- **Fix:** Convert to the same atomic claim pattern (`UPDATE … FOR UPDATE SKIP LOCKED … RETURNING`) used by the other workers; add a concurrent-claim test.
- **Acceptance:** two concurrent purgers claim disjoint rows.

---

## Phase 1 — Correctness, cross-node coherence, and structural perf
*Goal: close the multi-node staleness windows, the public-surface caching gap, and the search/observability debt.*

### PUB‑CACHE — Cache public gallery + studio-profile metadata · P1 · M · SAFE
- **Problem:** Every anonymous public-gallery and studio-profile view = fresh DB round-trips (gallery: slug resolve + assets; profile: code lookup + tier + galleries), with `force-dynamic` SSR defeating any edge cache. Highest-volume, lowest-sensitivity surface; a shared Valkey already sits idle for exactly this.
- **Evidence:** `backend/internal/service/gallery_service.go:178,189`; `repository/gallery_subdomain.go:27`; `handler/workspace_profile_handler.go:78`; frontend `frontend/src/app/g/[slug]/page.tsx:40` (`force-dynamic`).
- **Fix:** Short-TTL (10–30s) cache for published-gallery metadata + studio-profile, keyed on slug / `business_unique_code`, invalidated on publish/settings change. Prefer the shared Valkey (cluster-coherent) via the new `internal/cache` package (CACHE‑7); reuse the `viewer/count_cache.go` coalescing pattern if staying in-process. Consider Next.js ISR/`revalidate` for the public gallery page where session resolution allows.
- **Acceptance:** N concurrent views of one public slug collapse to 1 DB read per TTL; invalidation on publish verified.

### CACHE‑4 — Cross-node invalidation for the storage-widget cache · P1 · M · SAFE
- **Problem:** Storage analytics cache is in-process, 1h TTL; invalidation fires only on the writing node → up to 1h stale on the peer node (the dashboard widget your rules say must reflect `workspace_storage` truthfully).
- **Evidence:** `backend/internal/service/storage_accounting_service.go:22-53,357,447`.
- **Fix:** Back it with the shared Valkey, **or** publish a NATS `workspace.storage.invalidated` event that both nodes subscribe to. Drop the TTL once invalidation is reliable.
- **Acceptance:** an upload on node A reflects in the widget read from node B within seconds.

### CACHE‑5 — Workspace-policy cross-node invalidation · P1 · M · SAFE
- **Problem:** The NATS invalidation subscriber the code comments promise still doesn't exist; `Invalidate()` has no non-test caller → peer node serves ≤5min-stale upload policy.
- **Evidence:** `backend/internal/service/workspace_policy_service.go:186,221-226`.
- **Fix:** Implement the NATS subscriber (or move the cache to shared Valkey) so `Set()`/policy changes fan out to both nodes.
- **Acceptance:** policy change on node A invalidates node B's cache within seconds; subscriber has a real caller.

### CACHE‑7 — Central `internal/cache` package + metrics + singleflight · P1 · L · SAFE
- **Problem:** No shared cache abstraction — ~10 bespoke `map+mutex`/`sync.Map` caches with divergent TTL/eviction/locking, **no hit/miss metrics**, and **no stampede protection** (a cold key drives N concurrent DB reads + decrypt).
- **Evidence:** platform_settings, storage_accounting, workspace_policy, upload_policy_catalog, rbac, totp, consent, terms, auth OTP/rate-log, viewer count.
- **Fix:** Introduce `backend/internal/cache` — typed get/set-JSON interface, namespaced key builders, in-process TTL fallback + optional shared-Valkey backing, `singleflight` coalescing, and Prometheus hit/miss/eviction counters. Migrate the bespoke caches onto it incrementally (start with platform_settings + the two cross-node caches from CACHE‑4/5).
- **Acceptance:** at least the 3 hottest caches run on the package; hit/miss metrics visible; a concurrent-cold-key test shows a single DB read.

### PERF‑WRK — Worker intra-batch concurrency · P1 · M · SAFE
- **Problem:** Workers claim a batch atomically (good) but then process **serially** per tick → slow drain on large bursts (e.g. a 2000-photo wedding upload; only 10 drained per thumbnail tick).
- **Evidence:** `backend/internal/worker/thumbnail_worker.go:263-288`; `download_worker.go:65`.
- **Fix:** Add a bounded-concurrency pool (`errgroup` + semaphore, 4–8 concurrent CPU-bound `cwebp` encodes per node). Atomic claim already guarantees correctness; tune batch size + concurrency to core count.
- **Acceptance:** burst thumbnail completion drops from minutes to seconds-per-batch in a load test; no double-processing.

### D2 — `pg_trgm`/FTS for gallery owner search · P1 · M · SAFE
- **Problem:** Owner gallery search uses leading-wildcard `ILIKE '%x%'` on title/description → seq-scan per search; no supporting index.
- **Evidence:** `backend/internal/repository/gallery_repo.go:410`.
- **Fix (new migration):** Add a `pg_trgm` GIN index on `title`/`description` (or a `tsvector` FTS column) and adjust the query to use it.
- **Acceptance:** `EXPLAIN` shows index usage; contract test asserts the index.

### Q‑2b — Batch seam for album asset hydration · P1 · M · SAFE
- **Problem:** The owner N+1 was fixed for gallery cover/preview/detail, but the **album branch** of the preview page still fetches per-asset (`getAsset` loop) because the album endpoint has no `include_assets` equivalent.
- **Evidence:** `frontend/src/app/(dashboard)/galleries/[id]/preview/page.tsx:146-149`; album list `repository/album_repo.go`.
- **Fix:** Add `?include_assets=true` (bulk `GetByIDs`, order-preserved) to the album asset endpoint mirroring the gallery seam; consume the embedded assets in `preview/page.tsx`.
- **Acceptance:** preview of an album issues 1 list request, not N; n+1 regression test for the album path.

### VEC‑5 — Config-resolve the embedding model · P1 · M · SAFE
- **Problem:** `text-embedding-004` is hardcoded, bypassing the `platform_settings → env → disable` rule. Swapping models requires a code change + a re-dimension migration.
- **Evidence:** `backend/internal/ai/gemini_client.go:203`; `search_service.go:109,111`.
- **Fix:** Resolve the embedding model via `platform_settings.ai.embedding_model → env → default`. Document the dimension coupling (model change ⇒ `assets.embedding` re-dimension migration) prominently.
- **Acceptance:** model is read from config; default unchanged; doc note added.

### VEC‑6 — Embedding backfill + gap index + retry · P1 · M · SAFE
- **Problem:** Assets whose AutoTag is skipped/errored get **no embedding** and no re-enqueue → permanently invisible to search/dedup. No backfill, no way to find gaps cheaply.
- **Evidence:** `backend/internal/ai/search_worker.go:102-124` (returns before `IndexAsset` on error); no `cmd/` backfill; no `embedding IS NULL` index.
- **Fix:** (1) Add a partial index `… WHERE embedding IS NULL AND status='ready' AND content_type LIKE 'image/%'` to locate gaps. (2) Add a `cmd/backfill-embeddings` re-enqueue command. (3) On AutoTag error, still attempt an embedding from filename/EXIF or mark for retry rather than stranding.
- **Acceptance:** a stranded asset is discoverable via the partial index and re-embedded by the backfill; search recall covers previously-missed assets.

### CACHE‑2 — Wire (or remove) the RBAC role cache · P2 · M · SAFE
- **Problem:** The `invalidate()` fix is correct but lands on **dead code** — the `rbac` engine has no production caller; the live role-change path (`AdminUserRepo.UpdateRole`) has no cache at all. The fix reads as "covered" but isn't exercised.
- **Evidence:** `backend/internal/rbac/rbac.go:177,223` (only test callers); `repository/admin_user_repo.go:380`.
- **Fix:** Either (a) wire the rbac engine into the live authorization path so the cache+invalidation is real, or (b) delete the unused engine to remove the false sense of coverage. Decide based on whether per-request role caching is actually needed (note: JWT is stateless, so role lookups may already be cheap).
- **Acceptance:** the role cache is either exercised by a real request path (with an invalidation test on role change) or removed.

### DB‑6b — Generic DB transient-retry + Prometheus `/metrics` · P1 · M · SAFE
- **Problem:** No generic transient-error retry/backoff (a pooler bounce surfaces as a request error). Observability is a pull-only admin JSON summary — no Prometheus/OTel, so none of this plan's perf targets are measurable.
- **Evidence:** no retry wrapper in repos; admin-summary only `handler/admin_routes.go:110`; `observability/dataplane.go`.
- **Fix:** (1) Add a small retry-on-serialization/transient-conn helper for transactional write paths (credit/coupon ledgers first). (2) Add a `promhttp` `/metrics` endpoint with request-duration histograms + pool/cache gauges.
- **Acceptance:** a simulated transient failure is retried; `/metrics` exposes p95 latency + pool stats.

### Q‑4 — Keyset pagination on asset/gallery lists · P2 · M · SAFE
- **Problem:** OFFSET/LIMIT everywhere; deep pages re-scan skipped rows on large workspaces. A `Cursor` field exists but is dead.
- **Evidence:** `backend/internal/repository/asset_repo.go:113` (dead `Cursor`), `:292`; `gallery_repo.go:415`.
- **Fix:** Implement keyset/seek pagination on the dashboard grid using the existing `idx_assets_workspace_created` (migration 154): `WHERE (created_at,id) < ($ts,$id) ORDER BY created_at DESC, id DESC`.
- **Acceptance:** deep-page latency flat vs page depth; the dead `Cursor` field is now used or removed.

### Q‑5 — Indexes for exif-model filter + filename/size sort · P2 · S · SAFE
- **Problem:** `exif_data->>'model' ILIKE` seq-scans + per-row JSONB extract; `ORDER BY filename | size_bytes` has no btree → Sort node every sorted grid page.
- **Evidence:** `backend/internal/repository/asset_repo.go:264,269,285`.
- **Fix (new migration):**
  ```sql
  CREATE INDEX IF NOT EXISTS idx_assets_exif_model_trgm
    ON assets USING gin ((exif_data->>'model') gin_trgm_ops) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_assets_workspace_filename
    ON assets (workspace_id, filename) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_assets_workspace_size
    ON assets (workspace_id, size_bytes) WHERE deleted_at IS NULL;
  ```
- **Acceptance:** `EXPLAIN` of camera-model filter + filename/size sort use the new indexes; contract tests added.

### PERF‑SPLIT — Code-split heavy gallery panels · P1 · M · SAFE
- **Problem:** Only one `next/dynamic` in the whole app; the gallery detail route ships a 4,301-line client component plus tethered-shooting, AI, map-view, compare, and product-preview panels in first-load JS.
- **Evidence:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` (single client comp; one `dynamic` at `:91`).
- **Fix:** `dynamic()` the tethered panel, AI panel, map-view, compare-mode, and product/preview (they're conditionally rendered). Keep the decode WASM libs lazy (already optimal).
- **Acceptance:** gallery-route first-load JS materially reduced (measure with the bundle analyzer); INP-on-open improves.

### PERF‑RUM — web-vitals RUM reporter · P2 · M · SAFE
- **Problem:** Zero field telemetry — LCP/INP/CLS are unmeasured, so regressions are invisible and this plan's targets can't be validated client-side.
- **Evidence:** no `web-vitals` dep; no `useReportWebVitals` in `frontend/src`.
- **Fix:** Add `web-vitals` + a `useReportWebVitals` reporter posting to a backend ingest endpoint (or the new `/metrics` pipeline).
- **Acceptance:** LCP/INP/CLS visible per route for gallery detail, `g/[slug]`, studio profile, dashboard.

### DB‑2b — Live-DB test that timeouts apply to pooled conns · P2 · S · SAFE
- **Problem:** Timeouts are enforced via `ALTER ROLE rawdrive` (verified the app logs in as that role) + pgbouncer, but the only test is a migration-text contract — nothing proves the GUC is non-zero on an actual pooled app connection.
- **Evidence:** `migrations/160_role_session_timeouts.up.sql:33-35`; pgbouncer `query_timeout=30`.
- **Fix:** Add an integration test that opens a pooled connection as the app role and asserts `current_setting('statement_timeout') != '0'`. Optionally add a defense-in-depth `AfterConnect` `SET` or per-query `context.WithTimeout` for known-slow paths.
- **Acceptance:** test fails if the role default is ever removed.

---

## Phase 2 — Infrastructure decisions (require sign-off)

### PERF‑CDN — CDN / signed-URLs for derivatives · P0 (value) · L · DECISION
- **Problem:** Every WebP derivative byte streams through Go from B2, re-authenticated per request, `Cache-Control: private` (forbids any shared cache). This is the dominant throughput/latency ceiling — every `<img>` in every gallery view = one Go goroutine + one B2 GET.
- **Evidence:** `backend/cmd/api/main.go:2954-3047,3042`; presign capability exists but unused `storage/s3.go:53`, `s3_aws.go:234`.
- **Options:**
  - **A — CDN in front of immutable derivative paths** (Cloudflare/Bunny) keyed on the content-addressed derivative key; API node serves only cache-misses. Best throughput; E2EE-gated derivatives must remain proxied.
  - **B — Short-lived signed URLs** for non-E2EE thumbnails/display variants; browser fetches B2 directly.
  - **C — Hybrid:** CDN for public/marketing + signed-URL for authed non-E2EE + proxy for E2EE.
- **Decision needed:** which model; CDN vendor/cost; how E2EE galleries stay proxied.
- **Acceptance (once chosen):** >90% of derivative bytes served off the API node; gallery LCP improves on the public share path.

### DB‑3 — RLS: complete rollout or formally stay app-enforced · P1 · L · DECISION
- **Problem:** RLS policies exist but are inert (app connects as the owner role; `FORCE ROW LEVEL SECURITY` deliberately un-embedded; `SetWorkspaceID` uses session-scoped `set_config(...,false)` on the shared pool → wrong connection + leak; bare `AssetRepo.GetByID` has no workspace predicate). A documented ADR leans app-enforced.
- **Evidence:** `config.go:31-48`; `middleware/db_context.go:32`; `asset_repo.go:166`; `docs/audits/2026-05-31-integration-audit/ADR-rls-backstop.md`.
- **Options:**
  - **A — Complete the rollout:** non-owner `rawdrive_app` login + connection-scoped `SET LOCAL app.workspace_id` on the query connection + apply `enable_force_rls.sql`. Strong DB backstop; needs the connection-scoping refactor.
  - **B — Formalize app-enforcement:** remove/replace the misleading `set_config(false)` leak, audit every bare `GetByID`/`List*` caller for an explicit ownership check, and keep RLS as a tracked future epic. Lower effort; no DB backstop.
- **Decision needed:** A or B (current trajectory is B).
- **Acceptance (B):** the leak is gone, and a census of `GetByID`/`List*` callers confirms each enforces workspace ownership. (A): cross-tenant query under RLS returns zero rows in an integration test.

### PUB‑CAP — Paginate studio landing (60-gallery cap) · P1 · M · SAFE
- **Problem:** The public studio landing silently truncates at `LIMIT 60` published galleries — a correctness/UX gap for prolific studios.
- **Evidence:** `backend/internal/handler/public_gallery_handler.go:752`.
- **Fix:** Add cursor/"load more" pagination to the studio landing gallery list (pairs with PUB‑CACHE + PERF‑VIRT).
- **Acceptance:** a studio with >60 published galleries shows all of them paginated.

### PERF‑JETSTREAM — Event-driven job dispatch · P2 · L · DECISION
- **Problem:** NATS JetStream is provisioned but **publish-only**; all job processing is DB-polling. The thumbnail worker already flags the event-driven path as a follow-up (G4).
- **Evidence:** `backend/internal/events/nats_publisher.go` (publisher only); no `PullSubscribe`/durable consumers; `thumbnail_worker.go:193`.
- **Options:** drive thumbnail/download/AI/webhook off durable JetStream push consumers (AckWait, MaxAckPending) to cut poll latency, **or** keep DB-polling and just add concurrency (PERF‑WRK) if the latency is acceptable.
- **Decision needed:** is poll latency a real problem worth the architectural change, given PERF‑WRK may suffice?
- **Acceptance (if pursued):** job pickup latency drops from poll-interval to sub-second; at-least-once semantics preserved.

### PERF‑VIRT — Virtualize the public gallery grid · P2 · L · DECISION
- **Problem:** The public grid renders append-only and never recycles DOM nodes → a 3000-photo gallery mounts 3000 tiles (heap growth + INP/scroll-jank on low-end phones).
- **Evidence:** `frontend/src/components/.../public-gallery-grid.tsx:75-88` (`INITIAL_GRID_RENDER_COUNT=60`, IntersectionObserver append).
- **Decision needed:** adopt a windowing lib (`@tanstack/react-virtual` / `react-virtuoso`) — interacts with the masonry layout, deep-linking, and face-filter window events.
- **Acceptance (if pursued):** mounted DOM nodes stay bounded while scrolling a large gallery; INP < 200ms on a mid-tier device.

---

## Sequencing & dependencies

```
Phase 0 (sprint 1)   PERF-GZIP, PERF-HDR, VEC-2*, MIG-160, Q-3, Q-6, VEC-4, VEC-7,
                     CACHE-6, CACHE-8b, DB-1b
                       │   (* VEC-2 needs a recall target — decide early)
                       ▼
Phase 1 (sprint 2-3) CACHE-7  ──►  PUB-CACHE, CACHE-4, CACHE-5   (cross-node caches build on the package)
                     PERF-WRK, D2, Q-2b, VEC-5, VEC-6, CACHE-2, DB-6b, Q-4, Q-5,
                     PERF-SPLIT, PERF-RUM, DB-2b
                       │   (DB-6b /metrics + PERF-RUM unblock measuring Phase-2 targets)
                       ▼
Phase 2 (decisions)  PERF-CDN, DB-3, PUB-CAP, PERF-JETSTREAM, PERF-VIRT
```

**Key dependencies**
- **CACHE‑7 before CACHE‑4/5/PUB‑CACHE** — build the shared package once, then move the cross-node + public caches onto it.
- **DB‑6b `/metrics` + PERF‑RUM before Phase 2** — you can't validate CDN/ef_search/virtualization targets without measurement.
- **VEC‑6 pairs with VEC‑7** — skip-when-empty only makes sense alongside a backfill path.
- **PUB‑CACHE + PUB‑CAP + PERF‑VIRT** all touch the public studio/gallery surface — coordinate to avoid churn.

## Execution norms (per repo rules)
- Land every change via `npm run ship -- "<type>(<scope>): subject"`; never push to `main`.
- Every fix carries a regression test; every new index/migration carries a contract test; migrations are append-only and numbered after checking `origin/main`.
- Use `tests/photos/` assets for any upload/gallery test; respect the design-token + GlassIconButton rules for any frontend change.
- Security/storage invariants unchanged (no local storage, no hardcoded creds, OTP-registration-only, TOTP step-up).

---

## Appendix — Already fixed on `origin/main` (no action; listed for completeness)
Distributed auth/global/MFA rate limiting (shared Valkey, fail-closed); `platform_settings` 30s cache + invalidation; Valkey client tuning + `--maxmemory allkeys-lru` + dead-var removal; **dedup ANN self-join** (O(n²) gone); **all 6 queue workers atomic-claim** + concurrent tests; **query/lock/idle timeouts** enforced via the app login role + pgbouncer; pool lifetime/jitter/idle; pool + Valkey health stats + `/health/deep` Valkey probe; **gallery hot-path composite index (153)**; **owner cover/preview/detail N+1 eliminated** via `include_assets` batch; public studio profile lookup indexed with no N+1; pgvector config correct (extension, 768/512 dims, HNSW, cosine opclass match — no drift).
