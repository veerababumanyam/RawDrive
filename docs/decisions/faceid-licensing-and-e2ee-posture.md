# Decision: FaceID / Find-Me — `buffalo_l` licensing posture + E2EE recognition posture

> **UPDATE (2026-06-08) — FaceID TURNED ON; active posture is (a).** The owner
> ratified operating posture **(a) server-side match** now (not the off-until-
> consent-UI interim). Two changes ship this:
> 1. **Migration 191** reverts migration 190 — `workspaces.face_recognition_enabled`
>    defaults TRUE again and existing rows are backfilled to TRUE.
> 2. **`server_face_index_plaintext` now defaults ON** (`backend/cmd/api/main.go`),
>    re-opening the plaintext face-index path (`StoreIndexImage`). The kill switch
>    stays available — `FEATURE_SERVER_FACE_INDEX_PLAINTEXT=false` (or the
>    platform_settings row) re-closes it.
>
> **E2EE consequence (explicit):** under posture (a) the server **transiently
> processes a DECRYPTED face frame** at index time — it does NOT honor the
> "server never sees plaintext" bar. This is the accepted interim while posture
> **(b)** (client-side embedding, slice 2b) remains owner-blocked on commercial
> model licensing + ONNX hosting + parity (§3 below). The DPDP/GDPR Art 9
> special-category-at-rest risk-acceptance (consent capture + audit, slice 3b)
> applies. Re-closing the off-posture = roll back migration 191 + set the kill
> switch to false.

- **Status:** Active posture (a) — owner-ratified ON 2026-06-08 (superseding the
  2026-06-07 "off until consent UI" proposal).
- **Scope:** Documentation/decision only — no code or runtime change.
- **Refs:** roadmap slice `3j`; GitHub issue #289; audit
  `docs/audits/faceid-findme-audit-2026-06-07.md` §7.4, §8.1, §8.2, §8.5;
  epic spec `docs/features/e2ee-face-search/README.md`.
- **Recorded as the target of:** the slice-3a reconciled code comments that point to
  "the licensing + E2EE-posture decision … recorded by slice 3j"
  (`backend/internal/ai/face_service.go:86`, `:266`;
  `backend/internal/handler/workspace_face_recognition_handler.go:11`).

## Context

RawDrive's FaceID / Find-Me feature (guest selfie `photo-search`/`face-match`, the People
tab, owner clustering) is backed by **InsightFace `buffalo_l`** — the `det_10g` detector +
`w600k_r50` ArcFace recognition model producing **512-d** embeddings stored as
`face_clusters.vector(512)` with an HNSW index. Two previously-undocumented decisions block
this feature's privacy-correct end state, and one of them is a **live commercial exposure
today**, not a future browser-only concern.

### Showstopper — the `buffalo_l` weights are non-commercial, and the LIVE server ships them (B-L1, audit §8.1)

- InsightFace **code** is MIT, but the **`buffalo_l` pretrained weights** (`det_10g` +
  `w600k_r50`) are licensed **"for non-commercial research purposes only"** (InsightFace
  GitHub README). Commercial use requires a separate paid license
  (`recognition-oss-pack@insightface.ai`).
- This is **not** a future browser problem. The existing `services/face-svc` sidecar
  **auto-downloads and runs `buffalo_l` server-side in production today** — it backs every
  guest selfie `photo-search`/`face-match` **and** the live `POST /assets/{id}/face-index-image`
  ingest path. **A commercial photography SaaS is running research-only weights in prod
  right now.** A browser path that fetches the weights from a public URL would be
  *redistribution* — a more overt violation of the same license, not a new category.
- Neither the audit roadmap (B-E1: "host the model, verify parity, flip the flag") nor the
  e2ee-face-search spec mentioned licensing at all. **It outranks** the model-hosting and
  parity blockers the team already documented (audit §8.5 item 1).

### The E2EE recognition posture was never named (B-E1 / audit §7.4)

The external research says "encrypt the embeddings at rest." RawDrive stores embeddings as
**plaintext `vector(512)`** because pgvector HNSW needs plaintext for server-side ANN
search. That is a real tension with RawDrive's always-on, client-side AES-256-GCM E2EE
posture (the server holds only ciphertext for the media itself) and forces an explicit
choice that B-E1 never made — which is how the "default-on, no-consent, derived biometric
on the server" pairing arose.

### The live ingest path defeats E2EE for the face frame (audit §8.2)

The headline "`client_face_index` is OFF → Find-Me non-functional" conflated **two distinct
ingest endpoints**, only one of which is live:

- **`POST /assets/{id}/face-embeddings` — `StoreEmbeddings`** (the truly E2EE-safe path:
  client posts 512-d vectors, never an image) **is** flag-gated by `client_face_index`
  (default OFF → **404**, `face_embeddings_handler.go:152`). Its frontend client
  `uploadAssetFaceEmbeddings` has no production caller. → effectively dormant on both ends.
- **`POST /assets/{id}/face-index-image` — `StoreIndexImage`** is the **LIVE** path that
  `use-upload.ts` calls on every encrypted upload (and the "Reindex/Sync Now" button). It is
  **NOT** flag-gated (`face_embeddings_handler.go:265`). The browser already decodes the
  photo to plaintext pixels in a `<canvas>` to build the encrypted WebP derivatives, captures
  the plaintext `display_webp` frame, and **POSTs that plaintext frame** to the server, which
  runs `buffalo_l` and stores the embeddings. So when face-svc is reachable, **E2EE galleries
  ARE indexed — by handing the server a decrypted plaintext biometric frame. That defeats
  E2EE for that frame.**

## Decision

> The recommendations below are recorded as the conductor's recommendation **for owner
> ratification**. They are decisions-for-ratification, not open questions.

### 1. Licensing (B-L1) — resolve FIRST; it covers the live server, not just the browser

Embedding spaces are **not interchangeable**: any model that is not `buffalo_l`/`w600k_r50`
produces vectors in a different space, so **any model swap is an index-wide regeneration
event** (the `face_clusters` schema survives; the data is truncated and re-derived, the same
shape as migration 149's truncate). The options:

| Option | Keeps `buffalo_l` | Re-index `face_clusters`? | Accuracy | Notes |
|---|---|---|---|---|
| **(1) Buy the InsightFace commercial license** | ✅ | ❌ none | unchanged | Preserves the existing `vector(512)` + HNSW index and the guest-selfie path verbatim. **Cleanest** — clears the live server exposure AND unblocks a future browser path with no re-index. |
| (2) **AuraFace** (commercial-friendly ArcFace r100, 512-d) | ❌ | ✅ full re-index | lower | Different embedding space → full `face_clusters` regen; schema survives. |
| (3) **MobileFaceNet ONNX (~5 MB)** | ❌ | ✅ full re-index | lower | Browser-friendly size; **verify the specific weights' license**; full re-index. |

**Recommended: Option (1) — buy the InsightFace commercial license.** It is the only option
that both legitimizes the **already-live** server use and avoids an index-wide regen. Options
(2)/(3) are the fallbacks if a commercial license is declined; each requires a planned
`face_clusters` re-index and accepts an accuracy regression.

### 2. E2EE recognition posture (B-E1 / §7.4)

- **Posture (a) — server-side match (plaintext embeddings at rest).** Keep the HNSW index;
  send only the query embedding to `/face-match`. *Pros:* fast; reuses `vector(512)` + HNSW +
  the guest-selfie path; minimal new work once 2b ships. *Cons:* the server holds *derived*
  biometric vectors (Art 9 special-category, even though they are not images); **weaker** than
  the "encrypted at rest" bar and requires the documented risk-acceptance + consent + audit.
- **Posture (b) — client-side match (encrypted embeddings at rest).** Store each embedding
  **encrypted with the gallery key**; the guest downloads the gallery's encrypted embedding
  set, decrypts in-browser, and matches locally (a cosine/linear scan is trivial at gallery
  scale — 512×4 B ≈ 2 KB/face; a 1,000-photo gallery ≈ a few MB). *Pros:* fully honors
  "encrypted at rest" + "match locally after unlock"; the server **never holds plaintext
  biometrics** — the strongest fit for RawDrive's always-on E2EE model. *Cons:* loses
  server-side HNSW (acceptable — N is gallery-scoped and small); adds a client match path.

**DECISION (for ratification): the TARGET end-state is posture (b)** — the cleanest match to
the always-on E2EE model and the owner's privacy research. **Posture (a) is an acceptable
INTERIM** now that consent capture + audit (slice 3b) and the honest empty/unavailable states
(slices 3d/3e/3i) have shipped, which make a server-side-plaintext-embedding posture
defensible in the meantime. This is a recorded decision, not an open question: build toward
(b); operate on (a) only while (b)'s blockers (below) remain.

### 3. Slice-2b status — in-browser `buffalo_l` ONNX remains OWNER-BLOCKED

In-browser `buffalo_l` ONNX embedding at upload is the **only E2EE-faithful index path** (it
computes embeddings where the plaintext + gallery key live and POSTs only vectors). It remains
**owner-blocked** on two external prerequisites — neither is code:

1. **Licensing** — resolved per §1 above (commercial license, or a re-index model swap).
   Serving the weights from a public URL is redistribution and requires a license that permits
   it.
2. **Model hosting (~190 MB) + a parity gate.** Parity demands the *same* models:
   `det_10g.onnx` (~16 MB) + `w600k_r50.onnx` (~166 MB fp32; fp16 recog ≈ 83 MB; **int8 breaks
   ArcFace parity**). They are **not in the repo** — `services/face-svc` auto-downloads them via
   the Python `insightface` package into its container volume. For the browser they must be
   served from a public URL (public B2 bucket / CDN), fetched once and cached in IndexedDB
   (committing 190 MB to git is not acceptable). Enabling 2b is gated on a parity harness
   asserting **cosine(browser_emb, face-svc_emb) ≥ ~0.98** on every `tests/photos/` JPEG.

There is currently **ZERO ML in the frontend** — no `onnxruntime-web` and no model in
`frontend/package.json`. See `docs/features/e2ee-face-search/README.md` §"Slice 2b — execution
spec" and the standing E2EE↔face-recognition conflict (server indexes ciphertext → empty index
under true E2EE; the seamless fix is client-side embedding at upload).

### 4. Ingest-endpoint flag inconsistency — disposition (audit §8.5 items 2/3)

- `StoreEmbeddings` (`POST /assets/{id}/face-embeddings`) is `client_face_index`-gated
  (default OFF → 404).
- `StoreIndexImage` (`POST /assets/{id}/face-index-image`, the **LIVE** path) is **NOT**
  flag-gated and indexes by sending the server a **decrypted plaintext face frame**, defeating
  E2EE for that frame.

**Recorded, actionable post-decision follow-up (per chosen posture):**

- **Under the target posture (b) / client-embed-only:** the plaintext `/face-index-image` path
  **must be RETIRED or guarded**, and both ingest endpoints placed on **ONE** contract (the same
  flag + consent gate). This is the runtime reconciliation that slice 3j's decision authorizes —
  it is tracked here so §8.5 blockers #2/#3 are **not dropped**.
- **Under the interim posture (a):** `/face-index-image` is **retained WITH** the now-shipped
  consent capture + audit (slice 3b) and the honest "indexing unavailable" state (slices
  3d/3e/3i), and the flag contract is unified so the two endpoints stop diverging.

**UPDATE — guard disposition IMPLEMENTED (runtime slice):** `StoreIndexImage` is now gated
behind its own kill switch **`server_face_index_plaintext`** (default **OFF**, precedence
`platform_settings` → env `FEATURE_SERVER_FACE_INDEX_PLAINTEXT` → default-off, mirroring
`client_face_index`). The handler **fails closed** — a disclosure-safe **404** before any
request body is read — when the flag is absent or disabled, so the server no longer accepts a
decrypted frame by default and the E2EE contract holds. This implements the **guarded** branch
of the disposition above without choosing between retire-vs-keep: the path is dormant until an
operator deliberately enables it, and stays the interim posture-(a) mechanism only while
enabled. Files: `backend/internal/featureflag/server_plaintext_face_index.go`,
`backend/internal/handler/face_embeddings_handler.go` (`WithPlaintextFaceIndexGate`,
`StoreIndexImage`), wired in `backend/cmd/api/main.go`. Full retirement and the single unified
flag+consent contract for both endpoints remain a follow-up under the ratified target posture (b).

A separate runtime slice must implement whichever final disposition the owner ratifies; this
record is the decision it cites, and the guard above is its first landed increment.

## Consequences

- The live commercial-licensing exposure (research-only `buffalo_l` in prod) is now an
  explicit, owner-visible decision rather than a silent gap.
- The E2EE recognition posture is named: **target (b), interim (a)** — closing the B-E1 gap.
- Slice 2b stays owner-blocked on licensing + model hosting + the parity gate; no code changes
  until those clear.
- The `/face-index-image` vs `/face-embeddings` flag/contract reconciliation is a tracked
  follow-up, not a dropped blocker. **First increment landed:** `/face-index-image` is now
  guarded behind the default-off `server_face_index_plaintext` kill switch and fails closed, so
  the live plaintext-frame path is dormant by default (§4 UPDATE). Full retirement + a single
  unified flag/consent contract remain the follow-up under the ratified target posture (b).
- The slice-3a code comments (`face_service.go`, `workspace_face_recognition_handler.go`) now
  resolve to a real document.

## Alternatives considered (and why not now)

- **Homomorphic / encrypted-comparison match on the server** — rejected (complexity/latency);
  posture (b)'s client-side match is the privacy-preserving substitute (audit §7.5).
- **Decrypt the whole library server-side to index** — rejected; index at **upload** when
  plaintext is already in hand (no bulk re-decrypt) (audit §7.5).
- **Keep posture silent / treat 2b as "host model + flip flag" only** — rejected; that framing
  hid both the licensing exposure (§8.1) and the plaintext-frame posture question (§8.2).
