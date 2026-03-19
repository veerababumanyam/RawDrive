# Phase 14: FaceID Backend Architecture Analysis

**Analyzed:** 2026-03-19
**Scope:** All face-related backend models, services, repositories, API endpoints, workers

## Architecture Overview

**Data Flow:** Photo Upload → Detection → Embedding → Clustering → Grouping → UI Display

1. **Photo Upload** → Asset stored in R2 cloud storage
2. **Face Detection** → FaceDetectionService calls AI providers (Cloud Vision, Gemini)
3. **Embedding Generation** → FaceEmbedder (ArcFace ONNX model) generates 512-d vectors
4. **Clustering** → FaceClusterService assigns faces to groups using cosine similarity
5. **Caching** → Multi-tier cache (L1 memory, L2 Redis, L3 database)
6. **API Surface** → REST endpoints for CRUD, search, merge/split operations

## Database Schema

**Core Models:**
- `faces` (Face) — Detected face with bounding box, embedding, confidence, detection metadata
- `face_groups` (FaceGroup) — Clusters of similar faces with centroid vector, face_count, person link
- `face_assignments` (FaceAssignment) — Assignment history (auto/manual, confidence, confirmation status)
- `workspace_biometric_settings` — GDPR consent tracking (granted/withdrawn/pending_deletion)
- `face_rate_limit_config` — Per-workspace rate limits (face_search_rpm, daily_quota)
- `face_embedding_retention_job` — Scheduled cleanup jobs with status tracking
- `asset_embeddings_cache` — L3 persistent cache of detection results (write-through)
- `face_group_centroids_cache` — Cached centroid vectors with TTL expiration

**Key Relationships:**
- Face → Photo (asset_id) → Gallery → Workspace (multi-tenant isolation)
- Face → FaceGroup (face_group_id, optional)
- FaceGroup → Person (person_id, optional)
- FaceAssignment records history (AUTOMATIC, MANUAL, MERGED, SPLIT sources)

## API Surface

**Face Endpoints** (`/api/v1/faces`):
- `GET /galleries/{gallery_id}/faces` — List faces in gallery (paginated)
- `GET /faces/{face_id}` — Get face details with embedding
- `POST /faces/{face_id}/trigger-detection` — Trigger face detection for photo
- `GET /faces/search` — Similarity search using embedding vectors
- `POST /faces/{face_id}/assign-group` — Assign face to group
- `POST /faces/bulk-assign` — Batch assign multiple faces with rate limiting

**Face Group Endpoints** (`/api/v1/face_groups`):
- `GET /galleries/{gallery_id}/face-groups` — List groups in gallery
- `GET /face-groups/{group_id}` — Get group with representative face
- `POST /face-groups` — Create new face group
- `PATCH /face-groups/{group_id}` — Update group name/settings
- `POST /face-groups/{group_id}/merge` — Merge multiple groups
- `POST /face-groups/{group_id}/split` — Split faces into new group
- `POST /face-groups/{group_id}/merge-suggestions` — AI-suggested merges

**Biometric Consent** (`/api/v1/workspaces/{workspace_id}/biometric`):
- `GET /settings` — Get consent status
- `POST /consent/grant` — Grant GDPR Article 9 consent (audit trail: IP, UA, policy version)
- `POST /consent/withdraw` — Revoke consent (triggers cascade delete)

**Retention & Rate Limits:**
- `GET /face-retention/stats` — Retention statistics
- `POST /face-retention/cleanup` — Trigger manual cleanup
- `GET /face-rate-limits/usage` — Current usage vs limits

## Service Architecture

```
API Layer (faces.py, face_groups.py, biometric_consent.py)
    ↓
Service Layer:
- FaceDetectionService (orchestration: detect → cluster → thumbnail)
- FaceClusterService (clustering logic with centroid calc)
- FaceClusteringService (batch/workflow level operations)
- FaceService (CRUD with validation)
- BiometricConsentService (consent enforcement)
- FaceRetentionService (cleanup jobs)
- FaceThumbnailService (cropped face images)
- FaceGroupHistoryService (audit trail)
- FaceCacheManager (multi-tier caching)
- FaceEmbedder (ArcFace ONNX embeddings)
    ↓
Repository Layer:
- FaceRepository, FaceGroupRepository, FaceEmbeddingRepository
- FaceRetentionRepository, FaceCacheRepository, FaceRateLimitRepository
    ↓
Database: PostgreSQL (pgvector), Redis (L2 cache), R2 (storage)
AI Providers: Cloud Vision, Gemini
Model: ArcFace buffalo_l (ONNX, 512D)
```

## Issues Found

### CRITICAL

1. **Biometric Consent Bypass Flag** (`face_detection_service.py:67`)
   - `BYPASS_CONSENT_CHECKS` env var allows disabling consent entirely
   - GDPR Article 9 violation if set in production
   - **Fix:** Remove or restrict to dev environments only

2. **Model Integrity Validation Disabled** (`face_embedder.py:36`)
   - `EXPECTED_MODEL_HASH = None` — hash validation never runs
   - Corrupted/tampered models could be loaded silently
   - **Fix:** Set actual SHA-256 hash of w600k_r50.onnx

### HIGH

3. **Missing Consent Cascade Delete Verification**
   - `PENDING_DELETION` status exists but cascade delete trigger unclear
   - Embeddings may remain after consent withdrawal
   - **Fix:** Verify face_cascade_delete_service.py triggered on withdrawal

4. **No pgvector Index for Similarity Search**
   - Without index, similarity search is O(n) table scan
   - Will timeout with >100k faces
   - **Fix:** Add IVFFlat or HNSW index on embedding column

5. **Incomplete Worker Timeout Handling** (`face_detection_worker.py:43-50`)
   - `JOB_TIMEOUT_SECONDS = 120` defined but no `asyncio.wait_for()` enforcement
   - Jobs can hang indefinitely
   - **Fix:** Use asyncio.wait_for() with explicit timeout

6. **Embedding Vectors Returned in API Responses**
   - FaceResponse includes raw embedding vectors
   - Vectors could theoretically be used to reconstruct faces
   - **Fix:** Only return embeddings for internal similarity search

### MEDIUM

7. **N+1 Query Risk in Centroid Recalculation** — face_count updates trigger multiple queries per merge
8. **Cache Invalidation Race Condition** — L1/L2/L3 caches may go out of sync across workers
9. **Concurrent Job Limit Too Low** (`CONCURRENT_JOBS = 2`, reduced from 5 for OOM)
10. **No Deadlock Prevention in Merge Operations** — unordered transaction lock acquisition
11. **Centroid Cache TTL Fixed at 2 Hours** — not adaptive to group activity
12. **Worker Doesn't Propagate Errors to API** — fire-and-forget pattern
13. **Rate Limits Not Enforced on Bulk Operations** — merge endpoint may bypass limits
14. **GDPR Consent Withdrawn Audit Gap** — tracks `withdrawn_at` but not `withdrawn_by_user_id`
15. **Consent Not Checked in Background Workers** — only enforced at API level

## Performance Concerns

1. Embedding similarity search needs pgvector HNSW/IVFFlat index
2. Centroid recalculated on every single face assignment (should batch)
3. face_count denormalization could drift on failed operations
4. ONNX model lazy-loaded on first request (cold start latency)
5. Multi-tier cache coherence not guaranteed across distributed workers
