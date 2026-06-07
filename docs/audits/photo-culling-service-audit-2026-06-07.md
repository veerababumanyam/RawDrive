# Photo Culling Service — End-to-End Audit & Recommendations

- **Date:** 2026-06-07
- **Scope:** The "Smart Culling" feature across backend service, API, async workers, database/data-model, caching, and frontend.
- **Type:** Read-only audit (no code changed, no app booted). Every claim below is cited to `file:line` and was verified directly.
- **Verdict:** 🔴 **The culling feature is non-functional in production today.** The service code exists, the HTTP endpoints are wired, and a UI component is written — but **no worker ever runs the analysis**, so every culling job is created and then sits `pending` forever, and the only result endpoint always 404s. On top of the dead wiring there are authorization (IDOR), performance-law, data-model, contract-drift, and UI-compliance defects that must be fixed before the feature can ship.

---

## 0. TL;DR — what's broken, in priority order

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| 1 | 🔴 **Blocker** | **No culling worker.** `ProcessCulling` is never called; job type `"culling"` is claimed by nobody. Jobs are stuck `pending` forever. | `culling_service.go:62` (only callers are its own def); `main.go:2634-2636` (registers duplicate-scan/aesthetic-scoring/burst-grouping, **no culling**); `duplicate_worker.go:62` (claims `"duplicate_scan"` only) |
| 2 | 🔴 **Blocker** | **Stale/false code comment** says "Called by the duplicate worker (which handles culling jobs too)" — the duplicate worker does **not** handle culling. Misleads every future maintainer. | `culling_service.go:60-61` vs `duplicate_worker.go:62` |
| 3 | 🔴 **Blocker** | **Frontend is orphaned.** Nothing imports `CullingView`; `triggerCulling`/`getCullingSuggestions` are never called from any page. | grep: zero non-test importers of `CullingView`, zero non-test callers of the API funcs |
| 4 | 🟠 **High** | **IDOR / missing tenancy checks.** `TriggerCulling` passes `gallery_id` straight to the service with **no check that the gallery belongs to the caller's workspace**; `GetCullingSuggestions` fetches by `jobId` with **no workspace scoping**. | `handler.go:907`, `handler.go:916-931`, `culling_service.go:62-101`, `culling_service.go:177-207` |
| 5 | 🟠 **High** | **Perf-law violations.** `ProcessCulling` reads the **full-size original** (`storage_key`) of **every** asset into memory and calls Gemini **sequentially, one image at a time**. An 800-photo gallery = 800 serial full-res downloads + 800 serial vision calls. | `culling_service.go:69-152` |
| 6 | 🟠 **High** | **Unbounded AI cost / no pre-flight budget gate.** `AnalyzeGallery` never calls `SpendService.CheckAndEnforce`; cost is only logged *after* each call, and the cap check is non-blocking. A large gallery can blow the workspace monthly cap. | `culling_service.go:41-58`, `spend_service.go:68-105` |
| 7 | 🟡 **Med** | **API/type contract drift.** Backend returns `{quality:{...}, recommendation:"keep"\|"review", rank}` and defaults `top_percent=20`; the frontend type expects `{score, recommendation:"keep"\|"remove"\|"review", reason}` and defaults `70`. They do not match. | `culling_service.go:31-38` & `handler.go:905,931` vs `frontend/src/lib/api/ai.ts:775-808` |
| 8 | 🟡 **Med** | **Recommendation is never persisted.** keep/review is recomputed from `top_percent` on every read; there is no place to store a photographer's accept/reject decision, and **no action to apply the cull** (delete/flag rejects). | `culling_service.go:159-171, 224-235` |
| 9 | 🟡 **Med** | **Data-model gaps.** `quality_scores` has no index on `overall` (sort column) or `workspace_id`; recommendation/derivative refs absent. | migration `020_duplicate_groups.up.sql:33-46` |
| 10 | 🟡 **Med** | **Duplicate quality pipeline.** `aesthetic_worker` and `culling_service` both call `AssessQuality` and both write `quality_scores`, with different spend labels (`"aesthetic_scoring"` vs `"curation"`) — double cost, no reuse. | `aesthetic_worker.go:68-112`, `culling_service.go:118-144` |
| 11 | 🟡 **Med** | **No integration with duplicate/burst.** Culling ranks globally; `best_pick_id` on bursts is never populated; "keep best of each dup/burst group" does not exist. | `burst_service.go:29-98`, `duplicate_service.go:71-152` |
| 12 | 🟢 **Low** | **Frontend law/a11y violations** in `CullingView`: arbitrary `text-[10px]`/`min-h-[44px]`, raw `<button>` + inline `<svg>` instead of `GlassIconButton`/icon registry, no `aria-pressed`/labels/keyboard handling, no E2EE thumbnail decryption, no virtualization, missing loading/error/empty/progress states. | `frontend/src/components/ai/CullingView.tsx:81-139` |
| 13 | 🟢 **Low** | **No retry/backoff, no dead-letter, no feature flag, no rate-limit/idempotency** on culling. | `culling_service.go`, `handler.go:891-914` |
| 14 | 🟢 **Low** | **Wrong content-type to Gemini.** Originals may be HEIC/RAW but are sent as hardcoded `"image/jpeg"`. | `culling_service.go:118` |

> **Honesty note:** the marketing surface is *currently honest* — `frontend/src/app/solutions/ai-intelligence/page.tsx:23-27` says culling is "Coming soon … not enabled yet." This audit is about closing the gap between that promise and a correct, shippable implementation.

---

## 1. What the feature is supposed to do

"Smart Culling" should help a photographer shortlist a large shoot: score every image's technical/aesthetic quality, rank them, recommend a keep-set (top *N%*), let the photographer review and override, then **apply** the decision (e.g. flag/keep/reject, push keepers to proofing). The marketing page promises quality ranking + duplicate detection + burst best-pick + face-aware discovery feeding "the best frames" into delivery.

## 2. How it actually behaves today (end-to-end trace)

1. **Trigger** — `POST /api/v1/ai/cull` → `TriggerCulling` (`handler.go:891`) decodes `{gallery_id, top_percent}`, clamps `top_percent` to 20 if out of range, calls `AnalyzeGallery`.
2. **Enqueue** — `AnalyzeGallery` (`culling_service.go:41`) inserts an `ai_jobs` row with `type="culling"`, `status="pending"`, `result={gallery_id, top_percent}`. Returns `202 {job_id, status:"pending"}`.
3. **Process** — *nothing happens.* `ProcessCulling` (`culling_service.go:62`) is the function that would download images, call Gemini, write `quality_scores`, and mark the job done — but **no worker calls it** (`main.go:2634-2636` registers no culling worker; `duplicate_worker.go:62` claims only `"duplicate_scan"`). The job remains `pending` indefinitely.
4. **Poll** — `GET /api/v1/ai/cull/{jobId}` → `GetCullingSuggestions` → `GetSuggestions` (`culling_service.go:177`) returns an error unless `job.Status == "done"` (`:182`). Since the job never reaches `done`, the endpoint **always returns 404**.
5. **UI** — even if (3) and (4) worked, `CullingView` is never mounted and the API client functions are never invoked, so a user can't reach any of it.

**Net:** the feature is reachable by URL but produces no result. It is effectively dead code plus an exposed, unauthenticated-against-tenancy job-creation endpoint.

---

## 3. Layer-by-layer findings & recommendations

### 3.1 Backend service (`backend/internal/ai/culling_service.go`)

**Findings**
- **F-3.1.1 (Blocker)** No worker invokes `ProcessCulling`. Dead pipeline. (`:62`)
- **F-3.1.2 (Blocker)** Comment at `:60-61` is false and must not be trusted.
- **F-3.1.3 (High, perf-law)** Per-asset full-file read of the **original**: `s.store.Get(asset.StorageKey)` + `readAll` (`:106-116`). Originals can be RAW/HEIC tens of MB; this should read a bounded WebP derivative (`display_webp`/`thumb_lg_webp`), not the original. Violates AGENTS.md "avoid double full-file reads / batch hot paths."
- **F-3.1.4 (High, perf)** Sequential Gemini calls in a `for` loop (`:105-152`) with no concurrency, no batching, no progress updates. Latency scales linearly with gallery size; one slow/timed-out call stalls the whole job.
- **F-3.1.5 (High)** Partial failures are swallowed — every error path `continue`s (`:108, :114, :120, :142`); the job would be marked done with silently incomplete scores. No `processed_items` progress is written.
- **F-3.1.6 (Med)** `ThumbnailURL` is only set in `ProcessCulling` from `thumbnail_urls["md"]` (`:93-95`) but **not** in `GetSuggestions` (`:201-222`) — so the persisted-read path returns suggestions with empty thumbnails.
- **F-3.1.7 (Med)** Recommendation (`keep`/`review`) is computed in memory from `top_percent` on every call (`:159-171, :224-235`); never stored; no `reject` tier; no per-photo reason.
- **F-3.1.8 (Low)** Hardcoded `"image/jpeg"` mime to Gemini regardless of real type (`:118`).
- **F-3.1.9 (Low)** No idempotency: every POST creates a new job for the same gallery.

**Recommendations**
- **R-3.1.a** Create `culling_worker.go` mirroring `aesthetic_worker.go`/`duplicate_worker.go`: poll `ClaimPending(ctx, "culling", n, lease)` with `FOR UPDATE SKIP LOCKED`, call `ProcessCulling`, write `processed_items` progress, `MarkDone`/`MarkFailed`. Register it in `main.go` (`workerRegistry.Register("culling", cullingWorker)`). **This single change is the difference between dead and alive.**
- **R-3.1.b** **Stop reading originals.** Score against `display_webp` (or `thumb_lg_webp`) derivative keys; pass the correct content-type.
- **R-3.1.c** **Reuse existing scores.** Before calling Gemini, `SELECT` existing `quality_scores`/`assets.ai_quality_score`; skip already-scored assets. Unify culling and `aesthetic_worker` onto one `QualityService.ScoreAssets` so a gallery is scored once and culling becomes a cheap ranking pass over stored scores.
- **R-3.1.d** Bound concurrency (e.g. worker pool of N, context-cancel on job timeout) and write incremental progress so the UI can show a real progress bar.
- **R-3.1.e** Treat per-asset errors as recorded failures (count them, expose `failed_items`), not silent `continue`.
- **R-3.1.f** Delete or correct the false comment at `:60-61`.

> **Bigger architectural call (recommended):** the per-image Gemini vision call is expensive and cloud-bound. Sharpness (variance-of-Laplacian), exposure (histogram clipping), and basic composition can be computed **locally and for free** during the existing thumbnail/WebP derivative pipeline, and stored on `assets`. Reserve Gemini (or a local aesthetic model) for an optional "aesthetic" layer. This removes the hard Gemini dependency, makes culling work without an API key, and collapses cost from "per photo per cull" to "near zero." See §3.6.

### 3.2 API / handler (`backend/internal/ai/handler.go`, `routes_m3.go`)

**Findings**
- **F-3.2.1 (High, IDOR)** `TriggerCulling` (`:891`) reads `wsID` from the token but passes `body.GalleryID` to `AnalyzeGallery` with **no verification that the gallery belongs to `wsID`**. A caller can enqueue a culling job (and, once a worker exists, drive Gemini spend) against **another workspace's** gallery. Contrast with `DuplicateService.DetectDuplicates`, which scopes by workspace.
- **F-3.2.2 (High, IDOR)** `GetCullingSuggestions` (`:916-931`) looks the job up purely by `jobId`; `GetSuggestions` never checks the job's `workspace_id` against the caller. Cross-tenant read of another workspace's suggestions/filenames.
- **F-3.2.3 (Med)** Invalid `top_percent` is silently coerced to 20 (`:903-905`) instead of `400`-ing — masks client bugs and is the root of the 20-vs-70 drift.
- **F-3.2.4 (Med)** No rate-limit / idempotency on job creation.
- **F-3.2.5 (Low)** Reuses `FaceDetectResponse` as the culling response DTO (`:914`) — works, but couples unrelated contracts.
- **F-3.2.6 (Low)** No feature flag — endpoints are always registered (`routes_m3.go:47-48`) even though the feature is "coming soon."

**Recommendations**
- **R-3.2.a** Add an ownership guard: load the gallery and assert `gallery.workspace_id == wsID` before enqueuing; return `404` (not `403`) on mismatch to avoid existence disclosure.
- **R-3.2.b** In `GetSuggestions`, fetch the job and assert `job.WorkspaceID == wsID`; scope the suggestions query by `workspace_id` too.
- **R-3.2.c** Validate `top_percent` (1–100) and `400` on violation; align the default with the frontend (pick one — see §3.5).
- **R-3.2.d** Add a per-workspace "one active culling job per gallery" idempotency check (return the existing job if `pending`/`running`).
- **R-3.2.e** Gate behind a feature flag (e.g. `FEATURE_AI_CULLING`, per-workspace) so rollout matches the marketing "coming soon" copy.
- **R-3.2.f** Call `SpendService.CheckAndEnforce` at enqueue with an estimated cost (`assets × per-image estimate`) and **block** with `402/429` when over cap.

### 3.3 Async workers / orchestration

**Findings**
- **F-3.3.1 (Blocker)** Culling worker absent (see F-3.1.1).
- **F-3.3.2 (Med)** No retry/backoff on transient Gemini errors (`gemini_client.go` returns `ErrQuotaExceeded` on 429 with no backoff); a failed job is terminal.
- **F-3.3.3 (Med)** No dead-letter / requeue path; failed jobs just sit with `status="failed"`.
- **F-3.3.4 (Med)** `aesthetic_worker` and culling overlap (both score quality) — duplicated cost and write contention on `quality_scores` (`aesthetic_worker.go:100-107`).
- **Strength** The claim model is correct: `ClaimPending` uses `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED) … RETURNING` with a `claimed_at` lease for crash recovery (`job_repo.go:110-143`) — the new culling worker should reuse it verbatim.

**Recommendations**
- **R-3.3.a** Add bounded exponential backoff + jitter for 429/5xx/timeouts; cap attempts; only then `MarkFailed`.
- **R-3.3.b** Add a lightweight requeue (e.g. `failed` + `attempts < N` becomes re-claimable) or an ops endpoint to retry failed AI jobs.
- **R-3.3.c** Merge culling+aesthetic into one quality pipeline; culling consumes stored scores instead of re-scoring.

### 3.4 Database & data-model

**Findings** (`020_duplicate_groups.up.sql:33-46`, `018/160_ai_jobs`, `019/043 assets`)
- **F-3.4.1 (Med)** `quality_scores` has the unique index on `asset_id` (good for the upsert) but **no index on `overall`** — the core ranking sort (`ORDER BY qs.overall DESC`, `culling_service.go:207`) and **no index on `workspace_id`**.
- **F-3.4.2 (Med)** No persisted recommendation/decision. There is nowhere to store `keep|review|reject`, who decided, or when.
- **F-3.4.3 (Med)** Two sources of truth for quality: `quality_scores.overall` **and** denormalized `assets.ai_quality_score` (`043_m15_pwa_security_ai`) with a **type mismatch** (`DECIMAL(5,3)` in 019 vs `NUMERIC(5,2)` in 043). Risk of drift/precision surprises.
- **F-3.4.4 (Low)** `burst_groups.best_pick_id` exists but is never populated; `best_pick_id` has no `ON DELETE` (handled manually by hard-delete pre-nulling per AGENTS.md).
- **Strength** FK hygiene is good: `quality_scores` cascades on asset/workspace delete, so deleting a photo cleans its score automatically.

**Recommendations**
- **R-3.4.a** Add indexes: `CREATE INDEX idx_quality_scores_overall ON quality_scores (workspace_id, overall DESC);` (covers both ranking and tenant scoping). Add a migration contract test (per AGENTS.md perf-index rules).
- **R-3.4.b** Introduce a **decision table** to make culling stateful and applyable:

  ```sql
  -- NNN_culling_decisions.up.sql
  CREATE TABLE culling_decisions (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id       UUID NOT NULL REFERENCES ai_jobs(id)   ON DELETE CASCADE,
      gallery_id   UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
      asset_id     UUID NOT NULL REFERENCES assets(id)    ON DELETE CASCADE,
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      suggested    VARCHAR(10) NOT NULL,        -- keep | review | reject
      decision     VARCHAR(10),                 -- keep | reject | NULL (undecided)
      decided_by   UUID REFERENCES users(id),
      decided_at   TIMESTAMPTZ,
      rank         INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (job_id, asset_id)
  );
  CREATE INDEX idx_culling_decisions_gallery ON culling_decisions (gallery_id, workspace_id);
  ```
  This lets the UI persist overrides and lets an "apply" action act on real rows.
- **R-3.4.c** Pick **one** quality source of truth (recommend keeping `quality_scores` canonical; treat `assets.ai_quality_score` as an explicitly-synced denormalization or drop it). Reconcile the column type.
- **R-3.4.d** Populate `burst_groups.best_pick_id` from the quality pipeline so culling and bursts agree.

### 3.5 Caching

**Findings**
- **F-3.5.1 (Low)** **Zero caching** around culling. Every `GetCullingSuggestions` re-queries and re-ranks in app memory (`culling_service.go:201-235`). An internal-process TTL cache exists (`backend/internal/cache/`) but is unused here.
- Given the async, poll-based nature, this is acceptable short-term — but the suggestions payload (potentially hundreds of rows) is recomputed on every poll tick.

**Recommendations**
- **R-3.5.a** Once the worker writes results, **materialize the ranked suggestions** into the job `result` (or the new `culling_decisions` table) so reads are a single indexed fetch, not a recompute.
- **R-3.5.b** Optionally cache the completed suggestion set in Valkey keyed by `job_id` with a short TTL (it's immutable once `done`), invalidated when a decision is applied.
- **R-3.5.c** For polling specifically, return job status cheaply (status + `processed_items/total_items`) and only fetch the full suggestion list once `status=done`.

### 3.6 AI / model strategy & cost

**Findings**
- **F-3.6.1 (High)** Hard Gemini dependency: no API key ⇒ no culling at all (`config_repo.GetDecryptedKey` → `ErrNoAPIKey`, surfaced at `culling_service.go:63-66`).
- **F-3.6.2 (High)** No pre-flight budget enforcement; cap check is non-blocking (`spend_service.go:96-102`).
- **F-3.6.3 (Med)** Non-deterministic scores (LLM sampling) — same photo can score differently across runs; no validation/clamping of returned 0–1 values (`gemini_client.go:292-324`).

**Recommendations**
- **R-3.6.a** **Local-first quality.** Compute sharpness/exposure (and a cheap composition proxy) locally in the derivative pipeline; store on `assets`/`quality_scores`. Culling then works offline, deterministically, at zero marginal cost.
- **R-3.6.b** Keep the cloud model as an **optional aesthetic layer**, flag-gated and budget-gated, with `CheckAndEnforce` *before* the run and a clamped/validated response.
- **R-3.6.c** Surface a **pre-run cost estimate** to the user ("Analyze 812 photos ≈ ₹X") so culling cost is consented, not surprising.

### 3.7 Frontend (`frontend/src/components/ai/CullingView.tsx`, `app/(dashboard)/galleries/[id]/ai/page.tsx`, `lib/api/ai.ts`)

**Findings**
- **F-3.7.1 (Blocker)** `CullingView` is **orphaned** — no page mounts it; the AI page renders only the face-scan panel. `triggerCulling`/`getCullingSuggestions` are never called.
- **F-3.7.2 (Med, contract)** Type drift: `CullingSuggestion` in `lib/api/ai.ts` expects `{ score, recommendation: "keep"|"remove"|"review", reason }`, but the backend emits `{ quality:{sharpness,exposure,composition,overall}, recommendation:"keep"|"review", rank }`. `"remove"` is never produced; `score`/`reason` don't exist on the wire. Default `top_percent` is `70` here vs `20` server-side.
- **F-3.7.3 (Med)** Missing states: no loading skeleton, no error UI, no empty state, **no polling loop** for job progress. `CullingView` is a pure presentational grid with only in-memory keep/review toggles.
- **F-3.7.4 (Med)** No **apply** path: `onApply(keepIds)` is a stub with no consumer; there's no delete/flag/move-to-proofing action, no bulk select-all/clear, no export.
- **F-3.7.5 (Med, E2EE)** Thumbnails use a plain `<img>` with no `useDecryptedAssetUrl` — on client-E2EE galleries (the default) tiles would render ciphertext/blank. See the E2EE/face-search precedent in memory.
- **F-3.7.6 (Low, perf)** No virtualization — renders every asset; fine < ~500, risky at 1000+.
- **F-3.7.7 (Low, design-law)** Violations of RawDrive UI laws: arbitrary `text-[10px]` and `min-h-[44px]`, raw `<button>` + inline `<svg>` checkmark instead of `GlassIconButton` + icon registry.
- **F-3.7.8 (Low, a11y)** No `aria-pressed`/`aria-label` on toggles, no keyboard handler, no `aria-live` for the running count, no focus-visible styling.
- **F-3.7.9 (Low)** Only `S/E/C` sub-scores are shown; the `overall` (the actual ranking key) is not surfaced; no compare/lightbox/side-by-side review affordance.

**Recommendations**
- **R-3.7.a** Build the actual page flow: a "Start culling" entry inside the gallery (consistent with "upload lives inside a gallery"), a polling hook that reads job status + progress, then renders `CullingView` on `done`.
- **R-3.7.b** **Single source of truth for the contract.** Generate/align the TS types from the Go DTO (the repo already runs an `openapi` CI gate); fix `score`→`quality.overall`, drop `remove` or add it server-side as the `reject` tier, unify the default `top_percent`.
- **R-3.7.c** Add loading/empty/error/in-progress states and a real progress bar fed by `processed_items/total_items`.
- **R-3.7.d** Wire `onApply` to a new **apply-cull** endpoint (acts on `culling_decisions`): persist keep/reject, optionally hard-delete rejects (using the existing synchronous hard-delete path) or just flag them. Add bulk select-all/clear and a keep-list export.
- **R-3.7.e** Use `useDecryptedAssetUrl` for E2EE galleries; prefer WebP derivative keys (the test already asserts F-093 WebP preference).
- **R-3.7.f** Replace raw button/SVG with `GlassIconButton` + registry icons; replace arbitrary values with tokens; add `aria-pressed`/labels/keyboard + `aria-live` count; add a windowed grid for large galleries; add a compare/lightbox review mode.

---

## 4. Cross-cutting gaps (feature-completeness vs. the promise)

- **No "apply the cull."** Today's best case is read-only advice. Photographers expect to *act*: keep-set → proofing/album, reject-set → flagged/deleted. Needs the decision table (R-3.4.b) + apply endpoint + UI (R-3.7.d).
- **No integration between the four AI signals.** Culling (quality), duplicates (pgvector ≥0.92 cosine), bursts (time+camera), and faces are independent. The high-value workflow — "for each burst/dup cluster, auto-keep the sharpest, eyes-open frame; review the rest" — does not exist. `best_pick_id` is the natural home and is unused.
- **No domain-specific quality cues** wedding/event culling needs: closed-eyes/blink detection, smile, motion-blur vs intentional bokeh, group-shot "everyone looking." Current scoring is generic technical quality via one LLM prompt.
- **Observability:** errors go to stdout; no per-job metrics (success rate, score distribution, cost per gallery). Add structured logging + `/metrics` counters (a Prometheus `/metrics` path already exists in the codebase).

---

## 5. Recommended remediation roadmap (flag-gated, one-unit-per-PR per AGENTS.md)

> Decompose as dependency-ordered, independently-shippable slices behind `FEATURE_AI_CULLING` (flag-on slice last). Track on GitHub Project #2 before building.

**Phase 0 — Make it real & safe (blockers)**
1. `culling_worker.go` + register in `main.go`; correct the false comment. *(R-3.1.a, R-3.1.f)*
2. Tenancy guards on `TriggerCulling` + `GetSuggestions` (IDOR). *(R-3.2.a/b)*
3. Pre-flight budget gate + `top_percent` validation. *(R-3.2.c/f)*

**Phase 1 — Correctness & cost**
4. Score WebP derivatives, not originals; correct content-type; bounded concurrency + progress. *(R-3.1.b/d)*
5. Unify culling+aesthetic into one quality pipeline; reuse stored scores. *(R-3.1.c, R-3.3.c)*
6. Local-first quality scoring (sharpness/exposure); cloud aesthetic optional + flagged. *(R-3.6.a/b)*
7. `idx_quality_scores_overall`; reconcile dual quality columns. *(R-3.4.a/c)*

**Phase 2 — Make it stateful & actionable**
8. `culling_decisions` table + persist suggestions in job result. *(R-3.4.b, R-3.5.a)*
9. Apply-cull endpoint (keep→proofing, reject→flag/delete). *(R-3.7.d)*
10. Frontend: page flow, polling, all states, contract alignment, E2EE decrypt, design-law/a11y/virtualization fixes. *(R-3.7.a–f)*

**Phase 3 — Differentiators**
11. Integrate duplicates/bursts: per-cluster best-pick; populate `best_pick_id`. *(R-3.4.d, §4)*
12. Closed-eyes/blink/smile/blur cues; compare/lightbox review UX.
13. Retry/backoff + requeue for AI jobs; structured metrics. *(R-3.3.a/b, §4)*

**Phase 4 — Flag-on**
14. Enable `FEATURE_AI_CULLING`, update marketing from "coming soon," UAT with `tests/photos/` (17 real JPEGs incl. spaces/parens in names) inside Docker Playwright.

---

## 6. Evidence appendix (primary citations)

- **Dead worker:** `backend/internal/ai/culling_service.go:60-62`; `backend/cmd/api/main.go:2615,2628,2634-2636`; `backend/internal/ai/duplicate_worker.go:62`.
- **Handler/IDOR/validation:** `backend/internal/ai/handler.go:891-931`; routes `backend/internal/handler/routes_m3.go:47-48`.
- **Perf/full-file/sequential:** `backend/internal/ai/culling_service.go:69-174`.
- **Quality model & cost:** `backend/internal/ai/gemini_client.go:292-324`; `backend/internal/ai/cost_calculator.go:9-32`; `backend/internal/ai/spend_service.go:68-105`.
- **Aesthetic overlap:** `backend/internal/ai/aesthetic_worker.go:68-112`.
- **Schema:** `backend/internal/database/migrations/020_duplicate_groups.up.sql:33-46` (quality_scores), `018_ai_configs_jobs.up.sql` + `160_ai_jobs_claimed_at.up.sql` (ai_jobs), `019_assets_ai_columns.up.sql` + `043_m15_pwa_security_ai.up.sql` (assets/burst_groups).
- **Claim model (reuse):** `backend/internal/ai/job_repo.go:110-143`.
- **Frontend:** `frontend/src/components/ai/CullingView.tsx:1-142`; `frontend/src/lib/api/ai.ts:773-808`; `frontend/src/app/(dashboard)/galleries/[id]/ai/page.tsx`; marketing `frontend/src/app/solutions/ai-intelligence/page.tsx:23-27`.

---

*Prepared as a read-only audit. No source files were modified and the application was not booted. All `file:line` references were verified against the working tree at the time of writing (branch `main`).*
