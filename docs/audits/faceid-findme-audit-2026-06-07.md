# FaceID / Find-Me — End-to-End Audit & Recommendations

- **Date:** 2026-06-07
- **Scope:** Full vertical slice of **FaceID / Find-Me** — database & data model,
  backend (face service / worker / repo / sidecar client / handlers), API contract,
  and frontend (owner faces dashboard, public Find-Me, in-browser index path) —
  across face **detection, clustering, identity review, photo-search, and
  face-match**, with explicit focus on the **E2EE conflict** and **biometric
  compliance**.
- **Out of scope:** the broader AI pipeline (aesthetic, culling, duplicate, burst)
  except where it shares the worker/claim machinery.
- **Type:** Read-only documentation audit (no live boot). Findings cite `file:line`.
  Backend/frontend gathered by parallel sub-audits; high-severity items verified.

---

## 1. Executive Summary

FaceID is the **most architecturally ambitious and most internally contradictory**
of the audited domains. It is well-engineered in places (atomic worker claims,
gallery-scoped IDOR hardening, a careful sidecar client, configurable thresholds)
but is built on a **fundamental conflict it has not resolved** and ships **two
compliance/UX contradictions** that matter more than any single bug.

Five themes:

1. **E2EE vs. server-side face recognition (the core conflict).** Galleries are
   client-E2EE; the server only ever holds ciphertext and has no key. Server-side
   indexing (`face_worker` → B2 bytes → sidecar) therefore detects **0 faces** on
   E2EE galleries. The intended fix — in-browser embedding (`client_face_index`) —
   **is OFF by default and the ONNX path is unwired**, so on the default production
   posture **Find-Me does nothing on E2EE galleries**. The empty states are honest,
   but the feature is effectively non-functional. (B-E1)
2. **Biometric "opt-in" is actually opt-out — a compliance gap.** Migration `112`
   flipped `workspaces.face_recognition_enabled` to `DEFAULT TRUE` **and backfilled
   every existing workspace**, and `111` defaulted galleries on; the opt-in UI was
   removed. Yet code comments and `AGENTS.md` still claim "DEFAULT FALSE — biometric
   processing is opt-in under DPDP/GDPR." Biometric processing is now **on by
   default with no consent capture** — the opposite of the documented contract.
   (B-P1, **High**)
3. **Consent is inconsistent and never recorded.** The public `face-match` endpoint
   requires `consent_given:true`; the public `photo-search` (same biometric
   matching) requires **none**. Neither persists consent or audits who matched whom.
   (B-P2)
4. **The known 413/502 ingest hazard persists.** The in-browser index path sends a
   2400px frame first and only retries smaller on a message matching "too large"/
   "413" — **not** the nginx **502** that is the documented prod symptom — and the
   upload-time path has no retry at all (silent no-index). (FE-1)
5. **Two of everything, again.** Two public Find-Me UIs (modal gate vs standalone
   page) that have drifted; two owner face surfaces (`/ai/faces` is a stale,
   **E2EE-broken** duplicate of the gallery-scoped review panel); a server-embed
   path (live) and a client-embed path (inert).

Unlike calendar/CRM/freelancer, FaceID **is partially represented in
`docs/api/openapi.yaml`** (a positive). Notification/webhook integration is, as
elsewhere, absent.

### Severity snapshot

| # | Layer | Finding | Severity |
|---|-------|---------|----------|
| B-P1 | DB/Backend | "Opt-in" biometric gate flipped to **default-TRUE + backfilled** (mig 112/111); comments/AGENTS.md still say opt-in → DPDP/GDPR Art 9 exposure, no consent capture | **High** |
| B-E1 | All | E2EE: server can't index ciphertext; `client_face_index` OFF by default + ONNX path unwired → **Find-Me non-functional on E2EE galleries** in default posture | **High (product)** |
| FE-6 | Frontend | `/ai/faces` `FaceClusterDetail` renders **E2EE ciphertext thumbnails** (no decrypt hook) → permanently broken on encrypted galleries | **High** |
| FE-1 | Frontend | In-browser face-index sends 2400px first; 413-retry misses the prod **502**; upload path has no retry → silent no-index (the known 413/502 hazard) | **High** |
| B-C1 | Backend | `ClusterFaces` read-then-`uuid.New()` is **not concurrency-safe** → same person splits into duplicate clusters under parallel worker+client ingest | **Medium** |
| B-W1 | Backend | Whole-batch sidecar outage marks the scan **done** with `faces_found:0` (no job-level failed/retry) → silent under-indexing | **Medium** |
| B-P2 | Backend | Consent required for `face-match` but **not** `photo-search`; consent never persisted/audited | **Medium** |
| FE-2 | Frontend | No affirmative biometric **consent step** on the primary public Find-Me page (prose only); modal has it — inconsistent, weaker than GAL-FR-107 | **Medium** |
| FE-3 | Frontend | Two divergent public Find-Me UIs (modal gate vs standalone page); the gate's honest "E2EE unavailable" state is **dead code** (`setStep("unavailable")` never called) | **Medium** |
| B-D1 | Backend | Public `face-match` uses a **hardcoded** threshold + unclustered candidates while `photo-search` uses configurable thresholds + clustered-only → behavioral drift | **Low/Med** |
| FE-4 | Frontend | Modal capture flow: no `role=dialog`/focus-trap/Esc/aria on a biometric overlay | **Medium** |
| B-X1 | Backend/Privacy | Embedding deletion relies solely on FK cascade; `DeleteFacesByAsset` is dead code; no regression test; no DSR/export of face data | **Low/Med** |
| FE-5 | Frontend | Feature-disabled vs unavailable detected by **regex on error text** — brittle | **Low** |
| FE-7 | Frontend | Design-law: every face control is a raw `<button>` (zero `GlassIconButton`); one arbitrary `min-h-[44px]` | **Low/Med** |
| B-X2 | Backend | `getClusterContact`/`getClusterAssets`/`triggerFaceDetect`/`uploadAssetFaceEmbeddings` are wired-but-uncalled / inert API surface | **Low** |
| D-2 | DB | `face_clusters` RLS uses `app.current_workspace_id`; older tables use `app.workspace_id` (mig 180 defensively covers both) | **Low** |

---

## 2. Database & Data Model

Tables: `face_clusters` (mig `017`, widened to `vector(512)` in `149`),
`face_identity_aliases` (`179`, durable merge decisions), `face_identity_contacts`
(`180`, link cluster→CRM contact). Toggles: `galleries.faceid_enabled`/
`face_detection_enabled` (`046`/`111`), `workspaces.face_recognition_enabled`
(`112`/`125`).

- **B-P1 (High) — the opt-in/opt-out reversal.** `112_workspaces_face_recognition_
  default_true.up.sql` sets `DEFAULT TRUE` **and** `UPDATE workspaces SET
  face_recognition_enabled = TRUE` (backfill), `111` defaults galleries on, and
  112's comment notes the opt-in UI was removed ("the gate becomes a no-op from the
  user's perspective"). Biometric processing is therefore default-on for all
  workspaces, while `face_service.go:77,253`, `workspace_face_recognition_handler.go
  :6`, and `AGENTS.md` still assert "DEFAULT FALSE — opt-in." This is both a
  **compliance exposure** (DPDP/GDPR Art 9 special-category data processed without
  consent) and **misleading documentation**. Decide the posture and reconcile.
- **149 — destructive widen.** Migration 149 `TRUNCATE`s `face_clusters` to move
  128-d→512-d and lets the worker regenerate. Correct for derived data, but on E2EE
  galleries regeneration never happens (B-E1), so post-149 those galleries have
  permanently empty indexes.
- **D-2 (Low) — RLS variable.** `face_clusters`/aliases use `app.current_workspace_id`
  (`017:24`, `179:24`); `180` defensively covers **both** `current_workspace_id` and
  `workspace_id`. Standardize as part of the cross-domain RLS cleanup
  (calendar/CRM).
- **Deletion:** `face_clusters.asset_id`/`workspace_id` are `ON DELETE CASCADE`,
  `gallery_id` is `SET NULL` (`017`). Since asset delete is a synchronous hard-delete
  (project law), embeddings are removed via cascade — but **no explicit
  `DeleteFacesByAsset` is called** in production and **no test asserts the cascade**
  (B-X1).

---

## 3. Backend

Files: `ai/face_service.go`, `face_worker.go`, `face_repo.go`, `face_thresholds.go`,
`search_service.go`; `face/client.go`; `handler/face_embeddings_handler.go`,
`workspace_face_recognition_handler.go`, `public_gallery_handler.go` (1563-2072),
`ai/handler.go`; `featureflag/client_face_index.go`; routes `routes_m2.go`/`m3.go`.

### E2EE & flag state
- **B-E1 (High product).** `FaceService.DetectAndStore` (`face_service.go:104-130`)
  reads `storage_key` from B2 and POSTs to the sidecar — **ciphertext** for E2EE
  galleries → 0 faces. The only working E2EE ingest is the browser path
  (`face_embeddings_handler.go` `StoreEmbeddings` `:137` / `StoreIndexImage` `:265`).
  `client_face_index` default is **disabled** (`featureflag/client_face_index.go:51-
  54`), and `StoreEmbeddings` returns **404** when off (non-disclosure). Read paths
  degrade honestly: `ListPeople` → `[]`, `ListPersonPhotos` → `count:0`,
  `PhotoSearch` → `200 {found:false, index_status:"empty"}`
  (`public_gallery_handler.go:1747,1823,1942`). So the empty state is correct — but
  the feature is **non-functional on every E2EE gallery** in the default posture.

### Endpoints & auth (well-hardened — a positive)
All four public face endpoints (`/people`, `/people/{id}/photos`, `/photo-search`,
`/face-match`) call `gateGalleryAccess` and require `IsPublished` before returning
face data, and use `...InGallery` scoping so a guest on gallery A cannot enumerate
identities from gallery B (`public_gallery_handler.go:1799,1974,2044`). Dashboard
paths resolve workspace from JWT. Embeddings are stripped from responses
(`ai/handler.go:220`). **This isolation work is solid.**

### Sidecar client (`face/client.go`) — solid
30s timeout, bounded retries (2, linear backoff) only on transport/502/503/504,
never 4xx; 503→`ErrServiceUnavailable`; defensive 512-d dimension guard rejects
model swaps; 4KB error-body cap; clean nil-client/unset-URL → 503. Minor: full
in-memory multipart buffering (acceptable at the ≤20 MB cap).

### Worker & pipeline
- **Atomic claim ✓** (`FOR UPDATE SKIP LOCKED` + `claimed_at` lease) — compliant.
- **N+1 ✓** — per-asset count returned; progress batched every 10.
- **B-W1 (Medium).** Per-asset sidecar errors are logged and the loop continues
  (`face_worker.go:161-166`), then the job is marked **done** regardless — a
  whole-batch sidecar outage "succeeds" with `faces_found:0` and **no job-level
  retry/failed state**. Transient downtime permanently completes an empty scan.
- Opt-out check fails **closed** (good).

### Clustering & identity
- **B-C1 (Medium).** `ClusterFaces` (`face_service.go:275-317`) is a non-transactional
  read-then-write: `FindSimilarFaces(threshold 0.55, limit 1)`; on no match it mints
  `uuid.New()`. Two faces of the same new person processed concurrently (worker batch
  + a client `StoreEmbeddings` POST, or two workers) both see "no cluster" and create
  **different labels** → one person splits into two clusters. No `FOR UPDATE`/advisory
  lock. The merge UI repairs this manually, but the pipeline generates the duplicates.
- **Alias resolution ✓** — `ResolveClusterLabel` (depth-capped) applied consistently
  in search/clustering/merge; merge is transactional (`face_repo.go:710-739`).
- **Thresholds ✓** — `face_thresholds.go` resolves `platform_settings` → env →
  defaults from one source; invalid values fall back safely.

### Search
- Dashboard `SearchByFace` and public `PhotoSearch` **embed the selfie server-side**
  via the sidecar; candidate retrieval is `workspace_id`-filtered then gallery-scoped
  → cross-tenant safe. Public `FaceMatch` expects a **client-precomputed** embedding.
- **B-D1 (Low/Med).** `FaceMatch` uses a **hardcoded** threshold (0.6, clamped) and
  `FindSimilarFacesInGallery` **without** the `cluster_label IS NOT NULL` filter,
  while `PhotoSearch`/`SearchByFace` use configurable thresholds and clustered-only
  candidates (`public_gallery_handler.go:1618`, `face_repo.go:161`). Two public
  biometric endpoints, same gallery, different behavior.

### Privacy & compliance
- **B-P2 (Medium).** `FaceMatch` requires `consent_given:true` (`:1575`);
  `PhotoSearch` (`:1875`) has **no consent check**. Consent is a transient boolean —
  **never persisted or audited**; there is no record of who ran a face search or
  matched whom (DPDP/GDPR Art 9).
- **B-X1 (Low/Med).** Embedding deletion relies solely on FK cascade;
  `DeleteFacesByAsset` is dead code; no cascade regression test; no evidence face
  embeddings are included in any DSR/export path.

### API
FaceID **is partially present in `docs/api/openapi.yaml`** (unlike calendar/CRM/
freelancer — verify the 31 matches are real endpoints, not substrings, and that all
public/owner face routes are covered). **B-X2:** `getClusterContact`,
`getClusterAssets`, `triggerFaceDetect`, and `uploadAssetFaceEmbeddings` are
client/API surface with no live caller — dead or future-slice.

---

## 4. Frontend

Two public Find-Me UIs + two owner surfaces + an in-browser index path.

### Public Find-Me
- **FE-3 (Medium).** `g/[slug]/photo-search/page.tsx` (hero "Find me", the primary
  surface) is the polished one — 8 stages, camera-error classifier, three distinct
  no-match outcomes, decrypted result thumbs. The **modal** `faceid-gate.tsx`
  (`?faceid=1`) is a **separate, weaker** implementation that lacks secure-context
  detection, the camera-error classifier, and the `faces_detected===0` vs
  `index_status==="empty"` distinction. Worse, the gate declares an honest
  `"unavailable"` E2EE panel (`:245-265`) but **`setStep("unavailable")` is never
  called** and the `encrypted` prop is discarded (`:127`) — so the honest state is
  dead code and users fall through to a generic "we couldn't match your face" error.
- **FE-2 (Medium).** The standalone page has **no affirmative consent step** — just
  descriptive prose (`:353-387`) — while the modal *does* show a consent notice. The
  primary public biometric surface is the one missing the explicit GAL-FR-107
  consent affordance.
- **FE-5 (Low).** Feature-disabled vs unavailable is detected by **regex on the
  error body** (`/photo search disabled/i`, `:314,323`) — any backend copy change
  silently breaks the friendly panel.
- **FE-4 (Medium).** The modal is a `fixed inset-0 z-50` biometric-capture overlay
  with **no `role="dialog"`, `aria-modal`, focus trap, Esc-to-close, or labelling**
  (`faceid-gate.tsx:130`); `<video>` has no `aria-label`.

### In-browser index path (`face-index-browser.ts`)
- Clarification: this module does **not** run ONNX — it fetches a derivative,
  decrypts it client-side, and POSTs the **plaintext** frame to
  `/assets/{id}/face-index-image` (the server embeds it). The true client-ONNX
  helper (`uploadAssetFaceEmbeddings`, `client_face_index`) is **declared but
  unwired** — no model is hosted/loaded (matches "slice 2b blocked on model
  hosting").
- **FE-1 (High).** The path sends the **2400px `display_webp`** first
  (`webp-derivatives.ts:84` makes it the face-index frame) and only retries smaller
  on a message matching "too large"/"413" (`face-index-browser.ts:59-128`). The
  documented prod symptom is an nginx **502** (MaxBytesReader resets the body) —
  **not matched**, so a 502 aborts the asset with no downscale. The upload-time path
  (`use-upload.ts:640-658`) has **no 413 retry at all** and swallows failures with
  `console.warn` → silent zero-index. Fix: proactively downscale before the first
  POST and treat 502/reset as retryable.

### Owner face surfaces
- **FE-6 (High).** `/ai/faces` `FaceClusterDetail.tsx:33,75` renders thumbnails via
  `getAssetPreviewUrl` with **no decryption hook** → **ciphertext images** on every
  E2EE gallery (the L2 bug, fixed on gallery-scoped surfaces but **not** on this
  global one). It's also passed `clusterName=""` so the header always says "Unknown
  Person." This surface is a stale, less-capable, E2EE-broken duplicate.
- **Positive:** `FaceIdentityReviewPanel` (inside `/galleries/[id]/photo-search`) is
  the real, well-built review surface — rename/merge/split/link-contact/Sync-Now with
  bounded concurrency, abort, pagination, and **correct decryption**
  (`useDecryptedAssetUrl`).
- **FE-7 (Low/Med).** Every face control is a raw `<button>` (zero `GlassIconButton`
  across gate, panel, browser) — violates the icon-button law; one arbitrary
  `min-h-[44px]` (`FaceClusterBrowser.tsx:101`). `FaceClusterBrowser` also masks
  fetch errors as the empty state (`:47`).

### Data patterns
No N+1 (batched `includeAssets` + Map); pagination present on the panel/dashboard
(absent on `/ai/faces`). Decryption correct on gallery-scoped surfaces, **broken on
`/ai/faces`** (FE-6).

---

## 5. Cross-Cutting Themes

- **E2EE is the root cause** of the product gap (B-E1), the ciphertext thumbnails
  (FE-6), and the in-browser index path's existence (FE-1). Until in-browser
  embedding (slice 2b) ships with hosted models, Find-Me is honest-but-empty on
  encrypted galleries.
- **Compliance contradiction:** processing is default-on (B-P1) yet consent is
  inconsistent and unrecorded (B-P2, FE-2) — the worst pairing for special-category
  biometric data.
- **Duplication:** two public UIs (FE-3), two owner surfaces (FE-6), two thresholds
  for two public endpoints (B-D1), server-embed vs client-embed.
- **No notification/webhook integration** for "your photos were found" or
  identity-linked events, despite the infra.

---

## 6. Prioritized End-to-End Roadmap

Dependency-ordered, flag-gated, one-unit-per-PR slices.

**P0 — Compliance & correctness (first):**
1. **B-P1** Reconcile the biometric posture: either restore a real opt-in + consent
   capture, or document and risk-accept default-on with a consent record. Fix the
   misleading comments/AGENTS.md regardless.
2. **B-P2 / FE-2** Make consent consistent (require + **persist + audit** on both
   `photo-search` and `face-match`); add the consent step to the standalone page.
3. **FE-6** Route `/ai/faces` `FaceClusterDetail` through `useDecryptedAssetUrl`/
   `DecryptedThumb` (or retire the surface).
4. **FE-1** Proactively downscale the face-index frame in-browser before the first
   POST; treat 502/body-reset as retryable; surface upload-index failures.

**P1 — Make the pipeline trustworthy:**
5. **B-C1** Make `ClusterFaces` concurrency-safe (advisory lock / `FOR UPDATE` /
   dedupe on first-face).
6. **B-W1** Job-level failed/retry when the sidecar is unavailable for a batch.
7. **B-D1** Unify public `face-match` and `photo-search` thresholds + candidate sets.

**P2 — Resolve the E2EE feature:**
8. **B-E1** Ship in-browser embedding (`client_face_index` slice 2b): host the ONNX
   model, wire `uploadAssetFaceEmbeddings`, verify parity with the sidecar, then flip
   the flag — or formally retire server Find-Me on E2EE galleries and keep the honest
   empty state as the permanent contract.
9. **FE-3** Converge the two public Find-Me UIs on the stronger standalone
   implementation; delete the dead `unavailable` branch or wire it.

**P3 — Hardening & polish:**
10. **B-X1** Explicit embedding deletion + cascade regression test; include face data
    in DSR/export. **FE-4** dialog a11y on the capture modal. **D-2** RLS variable
    standardization (with calendar/CRM). **FE-7** GlassIconButton/token cleanup.
    **B-X2** remove or wire dead API helpers.

### Quick wins
B-P1 comment reconciliation, FE-6 (reuse the existing decrypt hook), FE-2 (add the
consent step the modal already has), and FE-1's 502-retry + pre-downscale are cheap
and directly close a compliance gap, a broken surface, and the documented 413/502
prod symptom.

---

## 7. Integration Design — Privacy-Preserving Find-Me (architecture direction)

> Added 2026-06-07 to fold in the owner's privacy-architecture research and turn the
> open B-E1 conflict into a concrete, E2EE-faithful design. **Direction/spec only — no
> code changed.** This section *refines* roadmap item **B-E1 / slice 2b**; it does not
> supersede the P0 compliance work (B-P1/B-P2/FE-2), which is required under any posture.

### 7.1 Terminology: two different "Face IDs" — do not conflate
The owner's research separates two concepts. RawDrive only has the second one today:

- **(A) Face ID as a biometric *access gate*** — a device biometric (Apple Face ID /
  WebAuthn / passkey) that unlocks a locally-held key or session. **RawDrive does not
  have this**, and Find-Me does not need it. If ever wanted, it would gate the
  **photographer dashboard** sign-in, is fully on-device, and is **orthogonal** to
  Find-Me. Out of scope here.
- **(B) Face recognition *inside photos*** — a wedding guest finds *their own* photos in
  a shared gallery by taking a selfie. **This is RawDrive's "FaceID/Find-Me."** The
  research's relevant guidance ("generate embeddings locally, encrypt/minimize them at
  rest, match after unlock, never recognize over ciphertext") is exactly the unresolved
  **B-E1** conflict — and it **endorses** the team's existing `client_face_index` /
  slice-2b decision (see memory: E2EE↔face conflict, remediation wave).

The research's core law — *"recognition needs decrypted pixels at the moment of
inference; never use encrypted photo blobs directly"* — is precisely why server-side
indexing yields **0 faces** on E2EE galleries (B-E1, §3). The server only ever holds
ciphertext, so it can never be the place inference happens.

### 7.2 The layered model mapped onto RawDrive
| Research layer | RawDrive equivalent | Status today |
|---|---|---|
| **L1 — biometric unlocks a *key*, not photos** | The **gallery key** is the vault key. Unlock = the **share link / PIN / password** gate (`#rd_key` + gallery session). No biometric is the gate; the *access event* is. | ✅ exists (share/PIN/password) |
| **L2 — decrypt only what's rendered, in memory** | `useDecryptedAssetUrl` / `DecryptedThumb` decrypt per-tile in memory; nothing decrypted is persisted. | ✅ exists (broken only on the stale `/ai/faces` surface — FE-6) |
| **L3 — recognition is *local* and *separate from auth*** | In-browser buffalo_l (512-d) embedding at **upload** (index) and at **selfie** (query); only **embeddings** move, never recognition pixels. | ⛔ the gap — `client_face_index` OFF, ONNX unwired (B-E1, slice 2b) |

Keying off this table, the principle "Face ID protects the key, not the photo bytes"
becomes "**the gallery unlock protects the key; recognition runs on the
already-decrypted pixels the browser holds, and only derived embeddings ever leave the
device.**"

### 7.3 Target data flow (E2EE-safe Find-Me)
**Index (write path, at upload) — already specced as slice 1 + 2b:**
1. Browser has plaintext pixels + gallery key (it just encrypted the upload).
2. Run **insightface buffalo_l (512-d) via `onnxruntime-web`** in-browser →
   detect + embed faces.
3. Upload **only** the 512-d embeddings (+ bbox/quality/source=`client`) to the
   existing authed `POST /assets/{id}/face-embeddings` (slice 1, built). **Never** upload
   a face image for indexing.
   → satisfies "generate embeddings locally; never recognize over ciphertext."

**Query (read path, guest selfie):**
1. Guest unlocks the gallery (L1) → captures selfie.
2. **Embed the selfie in-browser with the SAME model** → produce a 512-d query vector.
3. Match — choose per posture (§7.4) — and decrypt only the matched result thumbs via
   L2 (`DecryptedThumb`).
4. The **selfie is transient**: embed-and-discard. Never persist the selfie image *or*
   its embedding. (Today `/photo-search` ships the selfie *image* to the server to embed
   — §3 B-P2 — which both violates on-device recognition and is the source of the
   413/502 ingest hazard. Moving selfie embedding client-side closes **both**: only a
   ~2 KB vector is ever POSTed, so **FE-1's 413/502 class disappears for the query
   path**.)

### 7.4 The unresolved nuance the audit must record: "encrypt embeddings at rest"
The research says *"encrypt the embeddings at rest."* RawDrive currently stores
embeddings as **plaintext `vector(512)`** because pgvector HNSW needs plaintext to do
server-side ANN search. That is a real tension with the E2EE posture and forces an
explicit choice — **this decision belongs in B-E1 and is currently undocumented:**

- **Posture (a) — server-side match (plaintext embeddings at rest).** Keep the HNSW
  index; send only the query embedding to `/face-match`. *Pros:* fast, reuses the
  existing `vector(512)` + HNSW + guest-selfie path; minimal new work once 2b ships.
  *Cons:* the server holds *derived* biometric vectors (Art 9 special-category even
  though non-image). Requires **documented risk-acceptance + consent + audit** (P0
  work) and is **weaker** than the research's "encrypted at rest" bar.
- **Posture (b) — client-side match (encrypted embeddings at rest).** Store each
  embedding **encrypted with the gallery key**; the guest downloads the gallery's
  encrypted embedding set, decrypts in-browser, and matches locally (cosine/linear scan
  is trivial at gallery scale — 512×4 B ≈ 2 KB/face; a 1,000-photo gallery ≈ a few MB).
  *Pros:* fully honors "encrypted at rest" + "match locally after unlock"; the server
  **never holds plaintext biometrics** — the strongest fit for RawDrive's E2EE model.
  *Cons:* loses server-side HNSW (acceptable: N is gallery-scoped and small), adds a
  client match path.

**Recommendation:** posture **(b)** is the cleanest match to the owner's privacy model
and to always-on E2EE; posture **(a)** is a faster interim that still needs the P0
consent/audit work to be defensible. Either way, **B-E1 must name the chosen posture**
— today it is silent, which is how the "default-on, no consent, derived biometric on the
server" pairing (B-P1 + B-P2) arose.

### 7.5 What to avoid (research checklist vs. current state)
- ❌ *Decrypt the whole library to index* → ✅ index at **upload**, when plaintext is
  already in hand (no bulk re-decrypt).
- ❌ *Send decrypted photos to the server to match* → ⚠️ **violated today** by
  `/photo-search` shipping the selfie image; fix = client-side selfie embedding (§7.3).
- ❌ *Store raw face images as the biometric* → ✅ only embeddings are stored/sent;
  enforce **embed-and-discard** for the selfie.
- ❌ *Keep long-lived decrypted files on disk* → ✅ L2 is in-memory; **verify** keys are
  cleared on gallery lock/background (note for a hardening slice — not currently
  asserted by a test).
- ❌ *Cloud-side face grouping over shared images* → owner clustering runs on the same
  derived embeddings, never on ciphertext; homomorphic/encrypted-comparison is explicitly
  **not** pursued (complexity/latency) — posture (b)'s client-side match is the
  privacy-preserving substitute.

### 7.6 Net effect on the roadmap (§6)
- **Confirms** slice 2b (in-browser buffalo_l ONNX) is the *only* E2EE-faithful path;
  the standing blocker is unchanged — **host the ~190 MB models (`det_10g` +
  `w600k_r50`) at a public URL + verify embedding parity vs the `face-svc` sidecar on
  `tests/photos/`. Owner decision: where to host the models.**
- **Adds** the posture (a) vs (b) decision to **B-E1** (was undocumented).
- **Adds** "move selfie embedding client-side" to the query path — which also retires
  the **FE-1** 413/502 hazard for Find-Me queries (only a vector is POSTed).
- **Reinforces P0**: under *either* posture, the consent capture + persistence + audit
  (B-P1/B-P2/FE-2) and the honest E2EE empty state remain mandatory until 2b ships.

---

## 8. Evidence Index

| Layer | Path |
|------|------|
| Schema | `migrations/017_pgvector_face_clusters`, `149` (512-d widen), `179` (aliases), `180` (contacts), `046/111/112/125` (toggles) |
| Compliance flip | `112_workspaces_face_recognition_default_true.up.sql` (DEFAULT TRUE + backfill); comments `ai/face_service.go:77,253` |
| RLS | `017:24`, `179:24`, `180` (both vars) |
| Service/worker | `ai/face_service.go` (`:104,:275`), `face_worker.go:161`, `face_repo.go`, `face_thresholds.go` |
| Sidecar client | `face/client.go` |
| Handlers | `handler/face_embeddings_handler.go:137,265`; `public_gallery_handler.go:1563-2072` (`:1575,:1618,:1875,:1942`); `workspace_face_recognition_handler.go`; `ai/handler.go` |
| Flag | `featureflag/client_face_index.go:51-54` |
| Routes | `routes_m2.go:141,147,314,504-536`; `routes_m3.go:17-33` |
| Frontend public | `app/g/[slug]/photo-search/page.tsx` (`:314,353`); `components/gallery/faceid-gate.tsx` (`:127,245`) |
| Frontend in-browser | `lib/media-encryption/face-index-browser.ts:59-128`; `lib/media-encryption/webp-derivatives.ts:84`; `use-upload.ts:640-658` |
| Frontend owner | `app/(dashboard)/ai/faces/page.tsx`; `components/ai/FaceClusterBrowser.tsx:47,101`, `FaceClusterDetail.tsx:33,75`, `FaceIdentityReviewPanel.tsx` |
| API client | `lib/api/ai.ts` (face helpers; `uploadAssetFaceEmbeddings` inert) |
| API contract | `docs/api/openapi.yaml` (face partially present — verify coverage) |

---

*Audit is documentation-only; no code was changed and no services were booted. Prior
related work: see memory notes on the E2EE↔face conflict and the Find-Me remediation
waves, and the companion `calendar-/crm-/freelancer-marketplace-audit-2026-06-07.md`.
To action, create the relevant GitHub Project #2 items and ship each slice via
`npm run ship` behind a feature flag.*
