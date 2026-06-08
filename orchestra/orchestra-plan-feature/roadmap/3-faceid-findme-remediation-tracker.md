# 3 - FaceID / Find-Me audit remediation (faceid-findme-audit-2026-06-07) (tracker)

**Status:** 100% complete (15/15 shipped)

> GENERATED from `3-faceid-findme-remediation-tracker.json` - the machine source of truth. Do NOT hand-edit this table;

> run `cpf-track set --ref <id> --status <s>` then `cpf-track view` (or re-materialize).

| # | Sub-feature | Priority | Size | Depends on | Status | Issue | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3a | Reconcile the biometric opt-in/opt-out documentation to the shipped default-on reality (B-P1 docs) | P0 | S | - | merged | #280 | #295 |
| 3b | Persist + audit biometric consent on both public face endpoints (B-P2) | P0 | M | - | merged | #281 | #296 |
| 3c | Add the affirmative consent step to the standalone public Find-Me page (FE-2) | P0 | S | #3b | merged | #282 | #297 |
| 3d | Route the /ai/faces FaceClusterDetail through the decryption hook (FE-6) | P0 | S | - | merged | #283 | #298 |
| 3e | Pre-downscale the face-index frame, retry on 502/body-reset, and surface index failures (FE-1 + deploy hygiene) | P0 | M | - | merged | #284 | #299 |
| 3f | Make ClusterFaces concurrency-safe to stop duplicate-cluster splits (B-C1) | P1 | M | - | merged | #285 | #300 |
| 3g | Job-level failed/retry when the sidecar is unavailable for a batch (B-W1) | P1 | M | - | merged | #286 | #301 |
| 3h | Unify public face-match and photo-search thresholds + candidate sets (B-D1) | P1 | S | - | merged | #287 | #302 |
| 3i | Converge the two public Find-Me UIs and remove the dead unavailable branch (FE-3) | P2 | M | #3c | merged | #288 | #303 |
| 3j | Record the buffalo_l licensing constraint + E2EE Find-Me posture decision (B-L1 + B-E1 decision) | P2 | S | - | merged | #289 | #304 |
| 3k | Explicit face-embedding deletion + cascade regression test + DSR coverage (B-X1) | P3 | M | - | merged | #290 | #305 |
| 3l | Add dialog a11y to the biometric capture modal (FE-4) | P3 | S | - | merged | #291 | #306 |
| 3m | Standardize face_clusters RLS on app.current_workspace_id (D-2) | P3 | S | - | merged | #292 | #307 |
| 3n | Replace raw face-control buttons with GlassIconButton + fix token/empty-state law violations (FE-7) | P3 | M | - | merged | #293 | #308 |
| 3o | Remove or wire the inert face API helpers (B-X2) | P3 | S | - | merged | #294 | #309 |
