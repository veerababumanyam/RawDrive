# Seamless Find Me / Face ID on E2EE galleries

**Status:** epic in progress. Slice 0 (this PR) shipped first.
**Origin:** rawdrive-fix RCA of *"Face ID not working"* — `{"error":"gallery access requires a valid share link or invite"}` (HTTP 403). Issue #135.

> **Licensing + E2EE-posture decision:** the `buffalo_l` weights are licensed
> non-commercial-research-only (and the live `face-svc` sidecar already ships them in prod),
> and the E2EE recognition posture (server-side plaintext match vs client-side encrypted-
> embedding match) is now an explicit, owner-ratifiable decision. See
> [`docs/decisions/faceid-licensing-and-e2ee-posture.md`](../../decisions/faceid-licensing-and-e2ee-posture.md)
> (slice 3j, issue #289). Slice 2b below stays owner-blocked on resolving that licensing plus
> hosting the ~190 MB models.

## Problem

"Find Me" (public `/g/{slug}/photo-search`) and the People tab are broken on shared galleries.
Three stacked failure layers were found (read-only RCA):

- **L1 — access-gate 403 (the reported error).** The public face/people clients
  (`frontend/src/lib/api/ai.ts`) call the **absolute cross-origin** API base with
  `credentials:"omit"`. The durable `gallery_session` is a **host-only cookie on the frontend
  origin** (minted by `share-pin-gate.tsx` via the relative `/api/v1` rewrite, or written by the
  password gate), so it never reaches `gateGalleryAccess`
  (`backend/internal/handler/public_gallery_handler.go:359`) → 403 on private/invite-only galleries.
  The `X-Gallery-Session` header path is dead cross-origin (`cors.go` Allow-Headers omits it).
- **L2 — non-decryption-aware thumbnails.** People tiles / person grid / photo-search result grid
  render raw `<img src=/storage/thumbnails/...>` = **ciphertext** on E2EE galleries; they only get
  asset-ID strings, not the `media_encryption` manifest. The main grid uses `useDecryptedAssetUrl`.
- **L3 — the deepest cause.** Uploads are **unconditionally client-side AES-256-GCM encrypted**
  (`use-upload.ts:362`; `WithClientSideEncryptionRequired(true)`); the server stores ciphertext and
  never holds the gallery key. The face worker computes embeddings **server-side** from storage bytes
  (`face_service.go` → face-svc) = ciphertext → 0 faces, silently → **every E2EE gallery has an empty
  face index.** Server-side face recognition is fundamentally incompatible with client-side E2EE.

## Decision (user-approved)

Make it seamless **without weakening E2EE**: move face detection + embedding **client-side at upload**
(the photographer's browser has plaintext + the gallery key), upload only the **embeddings** (biometric
data, no plaintext image) to the server index, and keep matching/clustering server-side on embeddings.

- **Model:** full **`insightface buffalo_l`** (det_10g + w600k_r50, **512-d**) in the browser via
  `onnxruntime-web` — exact parity with the server's face-svc, so the existing `face_clusters`
  `vector(512)` + HNSW index and the guest-selfie face-svc path are reused unchanged.
- Embedding-space parity is the #1 risk; preprocessing/alignment must match insightface.

## Slice DAG

| Slice | Scope | Flag | Status |
|---|---|---|---|
| **0 — access fix** | **L1**: route the 3 public face/people clients same-origin (`/api/v1/...` rewrite) + `credentials:"include"` so the `gallery_session` cookie reaches the gate. Honest empty states already present. Frontend-only. | — | **this PR (#135)** |
| 1 — ingest endpoint | Authenticated `POST /api/v1/assets/{id}/face-embeddings` → validate 512-d → `faceRepo.StoreFaces` (`source="client"`) → `ClusterFaces`. openapi updated; no migration (the `source` column already exists). Reuses `guardAssetWorkspace` (IDOR-safe) + `face_recognition_enabled` biometric gate. Idempotent re-POST via `DeleteFacesByAssetAndSource`. | `client_face_index` | **issue #137 (this PR)** |
| 2a — upload-side client | `uploadAssetFaceEmbeddings(assetId, faces, opts)` (authFetch) — typed client for the slice-1 ingest endpoint. Inert until 2b wires an embedder + the flag is on. | `client_face_index` | **issue #141 (this PR)** |
| 2b — in-browser indexing | buffalo_l ONNX at upload (`onnxruntime-web`): detect+embed plaintext in-browser, POST via the 2a client. **BLOCKED on external resources** (see spec below). | `client_face_index` | **BLOCKED — specced** |
| 3 — decrypt thumbnails (**L2**) | Backend enriches ListPeople/ListPersonPhotos/PhotoSearch with decryptable asset records (`publicAssetResponse` via `resolveAssetsByID`); People cover + per-person grid + Find Me result grid render via the new shared `DecryptedThumb` (`useDecryptedAssetUrl`). Gallery key is global (localStorage/`#rd_key`). | — | **issue #139 (this PR)** |
| 3b — query parity + flag-on | Guest selfie → buffalo_l → match the now-valid index; flip `client_face_index` on end-to-end. (Depends on slice 2.) | `client_face_index` | TODO |

**Why L2 is in slice 3, not slice 0:** decryption-aware thumbnails are only *exercised* once an E2EE
gallery has indexed results. Today every E2EE gallery's index is empty, so slice 0 correctly lands
guests on an honest empty state; plaintext/legacy galleries render fine with the existing `<img>`.

## Compliance

Face embeddings are **biometric data** → SOC2/GDPR/DPDP. Reuse `consent-banner.tsx`, the
workspace `face_recognition_enabled` (mig 110/112) + gallery `face_detection_enabled` (mig 046/111)
gates, and embedding retention/deletion. Slices 1–3 must carry the compliance pass.

## Slice 2b — execution spec (BLOCKED on external resources)

Slice 2b makes Find Me actually return matches on E2EE galleries by computing face
embeddings **in the photographer's browser at upload** (where the plaintext + gallery key
live) and POSTing them via the 2a client. It is **fully designed and unblocked in code** —
the only blockers are infra/verification, below.

### What it requires (the two hard blockers — owner/ops decision)
1. **Host the ONNX models (~190 MB) at a public URL.** Parity with the server demands the
   *same* `insightface buffalo_l` models: `det_10g.onnx` (~17 MB) + `w600k_r50.onnx` (~170 MB).
   They are **not in the repo** — `services/face-svc` auto-downloads them via the Python
   `insightface` package into its container volume (`~/.insightface`). For the browser they
   must be served from a public URL (e.g. a public B2 bucket or CDN), fetched once and cached
   in IndexedDB. Committing 190 MB to git is not acceptable.
2. **Verify embedding parity.** Prove browser embeddings match face-svc within tolerance, or
   cosine search returns garbage. Run both pipelines on every `tests/photos/` JPEG and assert
   cosine(browser, face-svc) ≥ ~0.98 per face. Needs both pipelines running (face-svc is in
   docker-compose; the browser/onnxruntime-node side needs the models from blocker 1).

### Pre-built / ready (this epic)
- **Ingest endpoint** — `POST /api/v1/assets/{id}/face-embeddings` (slice 1, on main).
- **Upload-side client** — `uploadAssetFaceEmbeddings()` (slice 2a, this PR).
- **Result rendering** — `DecryptedThumb` + enriched responses (slice 3, on main).
- **Feature flag** — `client_face_index` (off by default).

### Remaining code (drop-in once blockers clear)
- `frontend/src/lib/face-embedding/` — onnxruntime-web session loader (fetch models from the
  public URL → IndexedDB cache); SCRFD/RetinaFace `det_10g` detection (anchors + NMS);
  5-landmark affine warp → 112×112; `w600k_r50` recognition → 512-d → **L2-normalize**.
  Preprocessing MUST match insightface exactly (BGR, the insightface mean/std). Run in a Web
  Worker (mirror `src/workers/upload-screening.worker.ts` + its `worker-client.ts`).
- **Upload seam** — `frontend/src/hooks/use-upload.ts` post-finalize (after `finalAssetId`,
  where `item.file` plaintext is still in scope): if `client_face_index` on **and** workspace
  `face_recognition_enabled` (GET via `workspace_face_recognition_handler`) **and** gallery
  `face_detection_enabled`, run the worker on the plaintext, then `uploadAssetFaceEmbeddings`.
  Best-effort: wrap in try/catch so detection never blocks the upload.
- **Parity harness** — `frontend` script + a `tests/` fixture comparing browser vs face-svc
  embeddings on `tests/photos/`; gate enabling the flag on it.
- Then flip `client_face_index` on (slice 3b) → guest selfie → match → decrypted results.

### Verdict
Everything codeable + unit-verifiable in this repo is shipped (slices 0/1/2a/3). Slice 2b
cannot be claimed *working* without blockers (1) + (2), which are an ops/infra decision plus a
verification run — not code. **Owner decision needed: where to host the models.**
