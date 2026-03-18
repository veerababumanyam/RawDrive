---
phase: 06-ai-ml-pipeline
verified: 2026-03-18T00:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 6: AI/ML Pipeline Verification Report

**Phase Goal:** Photos are automatically embedded, deduplicated, and clustered for curation
**Verified:** 2026-03-18
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | CLIP ViT-B/32 model is pre-baked in the Docker image and computes embeddings on uploaded photos | VERIFIED | Dockerfile lines 44-45: `ENV TRANSFORMERS_CACHE` + `RUN python -c "from transformers import CLIPModel, CLIPProcessor; CLIPModel.from_pretrained(...)"`. Cache copied to prod stage at line 56-58. |
| 2 | Embeddings are stored in pgvector with HNSW index and queried for similarity | VERIFIED | Migration 0196 creates `idx_image_embeddings_hnsw` with `m=16, ef_construction=64`. `EmbeddingRepository.find_similar_by_embedding` uses `<=>` operator with `workspace_id` filter. |
| 3 | Duplicate photos are detected via both hash-based and embedding-based methods | VERIFIED | `duplicate_detector.py` uses real boto3 R2 download (no `asyncio.sleep` stub). `similarity_worker.py` calls `find_similar_by_embedding` with cosine threshold after storing embeddings. |
| 4 | DBSCAN clustering groups similar photos for curation review | VERIFIED | `clustering_service.py` implements DBSCAN with `pdist(..., metric="cosine")`, `eps = 1.0 - similarity_threshold`. `similarity_worker._cluster_embeddings` delegates to `embedding_client.cluster_embeddings` → `POST /api/v1/clustering/cluster`. |
| 5 | Similarity groups persist in database/Redis instead of in-memory storage | VERIFIED | `similarity_worker` calls `cache_service.cache_similarity_groups` after `bulk_create_groups`. `SmartCurationService` calls `get_cached_groups` before DB query, with DB fallback + cache population. |

**Score:** 5/5 success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `services/ai-processing-service/Dockerfile` | CLIP model pre-bake at build time | VERIFIED | Lines 44-58: TRANSFORMERS_CACHE env + RUN pre-bake + COPY to prod stage |
| `services/ai-processing-service/src/api/v1/embeddings.py` | REST endpoint for CLIP embedding | VERIFIED | `EmbedImagesRequest`, `EmbedImagesResponse`, `processing_time_ms`, batch processing via `get_clip_embedder()` + `download_from_r2` |
| `services/ai-processing-service/src/services/r2_download.py` | Download image bytes from R2 | VERIFIED | boto3 `get_object`, module-level client singleton, proper error handling |
| `services/ai-processing-service/src/models/clip_embedder.py` | CLIP model with fixed deprecated API | VERIFIED | `self.model.train(False)` at line 61 (not `set_training_mode`) |
| `backend/migrations/versions/0196_add_hnsw_index.py` | HNSW index migration | VERIFIED | Drops DiskANN + IVFFlat, creates HNSW with `m=16, ef_construction=64`, workspace index |
| `backend/src/app/repositories/embedding_repository.py` | pgvector embedding queries | VERIFIED | `EmbeddingRepository`, `get_embedding_repository`, `<=>` operator, `workspace_id` filter, `store_embedding`, `batch_store_embeddings`, `find_similar_by_embedding` |
| `services/ai-processing-service/src/consumers/duplicate_detector.py` | Fixed R2 download | VERIFIED | boto3 inline singleton, `get_object`, no `asyncio.sleep` stub in `_download_asset` |
| `backend/src/app/services/embedding_client.py` | HTTP client to ai-processing-service | VERIFIED | `EmbeddingClient`, httpx POST to `/api/v1/embed/images`, 120s timeout, 1 retry, `cluster_embeddings` calls `/api/v1/clustering/cluster` |
| `backend/src/app/workers/similarity_worker.py` | Updated worker with real CLIP + clustering + caching | VERIFIED | Imports `get_embedding_client`, `get_embedding_repository`, `get_similarity_cache_service`; no `placeholder` string, no `import torch`, `_ensure_clip_model` sets `_embedding_client` |
| `services/ai-processing-service/src/workers/embedding_worker.py` | Celery task for async embedding | VERIFIED | `@celery_app.task` with `max_retries=3`, `compute_embedding` and `compute_batch_embeddings` tasks |
| `services/ai-processing-service/src/workers/celery_app.py` | embedding_worker registered | VERIFIED | `"workers.embedding_worker"` in include list, task routing to "embedding" queue |
| `services/ai-processing-service/src/services/clustering_service.py` | DBSCAN with cosine distance | VERIFIED | `cluster_embeddings`, `DBSCAN`, `pdist(..., metric="cosine")`, `squareform`, `eps = 1.0 - similarity_threshold`, singleton handling |
| `services/ai-processing-service/src/api/v1/clustering.py` | Clustering REST endpoint | VERIFIED | `router`, `POST /cluster` (full path `/api/v1/clustering/cluster`), calls `cluster_embeddings` |
| `backend/src/app/services/similarity_cache_service.py` | Redis caching layer | VERIFIED | `SimilarityCacheService`, `CACHE_KEY_PREFIX = "similarity_groups:"`, `SIMILARITY_GROUP_TTL = 3600`, `cache_similarity_groups`, `get_cached_groups`, `invalidate_cache`, graceful Redis error handling |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `embeddings.py` | `clip_embedder.py` | `get_clip_embedder()` | WIRED | Line 73-76: lazy import + call |
| `embeddings.py` | `r2_download.py` | `download_from_r2()` | WIRED | Line 74,83: lazy import + call |
| `embedding_repository.py` | `image_embeddings` table | pgvector `<=>` operator | WIRED | SQL at line 166: `1 - (embedding_vector <=> $1::vector)` |
| `duplicate_detector.py` | R2 storage | boto3 `get_object` | WIRED | `_download_asset` uses module-level boto3 singleton |
| `similarity_worker.py` | `embedding_client.py` | `get_embedding_client()` | WIRED | Import at line 28, instantiated in `_ensure_clip_model` |
| `embedding_client.py` | `embeddings.py` (ai-processing-service) | POST `/api/v1/embed/images` | WIRED | Line 59: `url = f"{self.base_url}/api/v1/embed/images"` |
| `similarity_worker.py` | `embedding_repository.py` | `find_similar_by_embedding` | WIRED | Line 370: `await emb_repo.find_similar_by_embedding(...)` |
| `similarity_worker.py` | `clustering.py` (ai-processing-service) | HTTP POST via `embedding_client.cluster_embeddings` | WIRED | Line 125 of embedding_client: `/api/v1/clustering/cluster`; line 439 of similarity_worker calls it |
| `clustering.py` | `clustering_service.py` | `cluster_embeddings` import | WIRED | Line 16: `from services.clustering_service import cluster_embeddings` |
| `similarity_worker.py` | `similarity_cache_service.py` | `cache_similarity_groups` after `bulk_create_groups` | WIRED | Lines 272,277: `bulk_create_groups` then `cache_service.cache_similarity_groups` |
| `smart_curation_service.py` | `similarity_cache_service.py` | `get_cached_groups` before DB query | WIRED | Line 113: `cached = await self.cache_service.get_cached_groups(session_id)`, fallback to DB + re-cache at line 134 |

### Requirements Coverage

All requirements claimed by Phase 6 plans were cross-referenced against REQUIREMENTS.md.

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AI-01 | 06-01 | CLIP ViT-B/32 pre-baked in Docker image | SATISFIED | Dockerfile lines 44-58 |
| AI-02 | 06-03 | CLIPEmbedder wired to similarity_worker via Celery task dispatch | SATISFIED | `embedding_worker.py` Celery tasks; `similarity_worker` uses `EmbeddingClient` HTTP |
| AI-03 | 06-01 | Batch embedding computation processes photos asynchronously | SATISFIED | `EmbedImagesRequest` accepts list; Celery `compute_batch_embeddings` task |
| AI-04 | 06-02 | Embeddings stored in pgvector with HNSW index (m=16, ef_construction=64) | SATISFIED | Migration 0196 confirmed |
| AI-05 | 06-02 | Hash-based duplicate detection — R2 image fetch working | SATISFIED | `duplicate_detector._download_asset` uses real boto3, no stub |
| AI-06 | 06-03 | Embedding-based duplicate detection using cosine similarity threshold | SATISFIED | `similarity_worker` calls `find_similar_by_embedding` with threshold |
| AI-07 | 06-04 | DBSCAN clustering groups similar photos | SATISFIED | `clustering_service.py` DBSCAN + cosine distance; wired via HTTP through `similarity_worker` |
| AI-08 | 06-05 | Similarity groups stored in database/Redis | SATISFIED | `SimilarityCacheService` + `bulk_create_groups` write-through; `SmartCurationService` cache-first reads |
| PERF-01 | 06-01 | Image processing moved from main backend to ai-processing-service | SATISFIED | `similarity_worker` uses `EmbeddingClient` HTTP — no local ML; `embedding_client.py` has no torch dependency |
| PERF-02 | 06-02 | Duplicate detection uses indexed lookups | SATISFIED | HNSW index on `image_embeddings.embedding_vector`; `<=>` operator uses index |
| PERF-03 | 06-05 | Similarity groups migrated from in-memory to Redis | SATISFIED | `SimilarityCacheService` with 3600s TTL; `SmartCurationService` reads Redis first |

**Orphaned requirements check:** REQUIREMENTS.md maps AI-01 through AI-08, PERF-01 through PERF-03 to Phase 6. All 11 are claimed by plans 06-01 through 06-05. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `similarity_worker.py` | 114 | `asyncio.sleep(10)` | INFO | Error-loop backoff, not a stub — correct usage |

No blocker or warning anti-patterns found. The `asyncio.sleep(10)` is in the worker's main error-handling loop catch block, standard retry delay, not a placeholder.

### Human Verification Required

#### 1. CLIP Model Docker Build

**Test:** Build the ai-processing-service Docker image and confirm the CLIP model pre-bake RUN step completes without network errors
**Expected:** Build log shows "CLIP model pre-baked successfully" and image size includes model weights (~600MB increase)
**Why human:** Cannot run Docker build in static analysis; requires Docker daemon and network access during build

#### 2. Alembic Migration Run

**Test:** `docker exec rawdrive-backend alembic upgrade head` with migration 0196 applied to a live database
**Expected:** `idx_image_embeddings_hnsw` index appears in `pg_indexes` and old DiskANN/IVFFlat indexes are dropped
**Why human:** Cannot execute SQL against live PostgreSQL in static analysis

#### 3. End-to-End Similarity Worker Flow

**Test:** Upload a photo, observe that similarity_worker calls ai-processing-service and stores an embedding in `image_embeddings`
**Expected:** Row in `image_embeddings` with 512-dim `embedding_vector`; Redis key `similarity_groups:{session_id}` present after clustering
**Why human:** Requires running services, Celery worker, and database

#### 4. DBSCAN Cluster Quality

**Test:** Upload 10 nearly-identical photos and 5 distinct photos; trigger similarity worker
**Expected:** Similar photos grouped into 1-2 clusters; distinct photos are singletons
**Why human:** Requires real CLIP inference results to validate clustering parameters (eps=0.15 for threshold=0.85)

---

## Gaps Summary

No gaps found. All 14 artifacts are substantive and fully wired. All 11 requirements (AI-01 through AI-08, PERF-01 through PERF-03) have concrete implementation evidence. Key pipeline connections are verified:

- CLIP model pre-baked in Docker (AI-01, PERF-01)
- ai-processing-service REST API for embeddings wired to similarity_worker via EmbeddingClient HTTP (AI-02, AI-03)
- pgvector HNSW index migration ready (AI-04, PERF-02)
- R2 download stub replaced with real boto3 in duplicate_detector (AI-05)
- Cosine similarity threshold in find_similar_by_embedding for embedding deduplication (AI-06)
- DBSCAN clustering service with proper eps derivation, wired end-to-end (AI-07)
- SimilarityCacheService Redis persistence with cache-first reads in SmartCurationService (AI-08, PERF-03)

4 items require human/runtime verification (Docker build, migration execution, live worker flow, cluster quality) but none block the goal assessment.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
