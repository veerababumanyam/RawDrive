# Seamless Find Me / Face ID on E2EE galleries

**Status:** epic in progress. Slice 0 (this PR) shipped first.
**Origin:** rawdrive-fix RCA of *"Face ID not working"* — `{"error":"gallery access requires a valid share link or invite"}` (HTTP 403). Issue #135.

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
| 1 — ingest endpoint | Authenticated `POST /api/v1/assets/{id}/face-embeddings` → validate 512-d → `faceRepo.StoreFaces` (`source="client"`) → `ClusterFaces`. openapi + migration (source tag). Reuses consent gates. | `client_face_index` | TODO |
| 2 — in-browser indexing | buffalo_l ONNX at upload (`onnxruntime-web`): detect+embed plaintext in-browser, POST embeddings to slice-1. Model hosting/caching, WebGPU/WASM, parity harness vs face-svc on `tests/photos/`. | `client_face_index` | TODO |
| 3 — query + decrypt (**L2**) | Guest selfie → buffalo_l → match the now-valid index; render People/result thumbnails via `useDecryptedAssetUrl`; enable the flag end-to-end. | `client_face_index` | TODO |

**Why L2 is in slice 3, not slice 0:** decryption-aware thumbnails are only *exercised* once an E2EE
gallery has indexed results. Today every E2EE gallery's index is empty, so slice 0 correctly lands
guests on an honest empty state; plaintext/legacy galleries render fine with the existing `<img>`.

## Compliance

Face embeddings are **biometric data** → SOC2/GDPR/DPDP. Reuse `consent-banner.tsx`, the
workspace `face_recognition_enabled` (mig 110/112) + gallery `face_detection_enabled` (mig 046/111)
gates, and embedding retention/deletion. Slices 1–3 must carry the compliance pass.
