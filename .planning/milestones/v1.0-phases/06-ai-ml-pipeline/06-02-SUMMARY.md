---
phase: 06-ai-ml-pipeline
plan: 02
subsystem: database, ai
tags: [pgvector, hnsw, embeddings, cosine-similarity, boto3, r2, duplicate-detection]

requires:
  - phase: 03-ai-stabilization
    provides: ai-processing-service crash-loop fix
provides:
  - HNSW pgvector index on image_embeddings (m=16, ef_construction=64)
  - EmbeddingRepository with cosine similarity search via <=> operator
  - Working R2 image download in duplicate_detector (replaces stub)
  - workspace_id btree index for multi-tenant query filtering
affects: [06-03, 06-04, 06-05]

tech-stack:
  added: [boto3 inline in duplicate_detector]
  patterns: [pgvector HNSW indexing, module-level boto3 singleton, run_in_executor for sync IO]

key-files:
  created:
    - backend/migrations/versions/0196_add_hnsw_index.py
    - backend/src/app/repositories/embedding_repository.py
    - backend/tests/test_embedding_repository.py
    - services/ai-processing-service/tests/test_duplicate_detection.py
  modified:
    - services/ai-processing-service/src/consumers/duplicate_detector.py

key-decisions:
  - "HNSW with m=16, ef_construction=64 balances recall and build speed for photo embedding workloads"
  - "Inline boto3 client in duplicate_detector avoids cross-plan import dependency (Wave 1 parallel execution)"
  - "run_in_executor wraps synchronous boto3 get_object to avoid blocking asyncio event loop"

patterns-established:
  - "EmbeddingRepository follows project 3-layer pattern with get_postgres_pool singleton"
  - "Module-level _get_s3_client() singleton for boto3 connection reuse across calls"

requirements-completed: [AI-04, AI-05, PERF-02]

duration: 6min
completed: 2026-03-18
---

# Phase 06 Plan 02: HNSW Index and Embedding Repository Summary

**HNSW pgvector index on image_embeddings with EmbeddingRepository for cosine similarity queries and fixed R2 download in duplicate detector**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-18T22:21:37Z
- **Completed:** 2026-03-18T22:27:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Alembic migration 0196 replaces DiskANN/IVFFlat indexes with HNSW (m=16, ef_construction=64) on image_embeddings
- EmbeddingRepository provides find_similar_by_embedding using pgvector <=> operator with workspace_id filtering
- duplicate_detector._download_asset now downloads real images from R2 via boto3 (no more asyncio.sleep stub)
- 11 total tests (7 embedding repository + 4 duplicate detection)

## Task Commits

Each task was committed atomically:

1. **Task 1: HNSW index migration and EmbeddingRepository** - `7bb8dda4` (feat)
2. **Task 2: Fix R2 download stub in duplicate_detector.py** - `23f9f705` (fix)

## Files Created/Modified
- `backend/migrations/versions/0196_add_hnsw_index.py` - Drops DiskANN/IVFFlat, creates HNSW index with workspace_id btree index
- `backend/src/app/repositories/embedding_repository.py` - EmbeddingRepository with store, batch_store, find_similar_by_embedding, find_similar_by_phash
- `backend/tests/test_embedding_repository.py` - 7 unit tests for SQL structure verification
- `services/ai-processing-service/src/consumers/duplicate_detector.py` - Replaced stub with boto3 R2 download
- `services/ai-processing-service/tests/test_duplicate_detection.py` - 4 tests for R2 integration and error handling

## Decisions Made
- HNSW with m=16, ef_construction=64 chosen for good recall/speed tradeoff at photo-scale datasets
- Inline boto3 in duplicate_detector (self-contained, no cross-plan import of r2_download.py) since Plan 01 runs in parallel
- Used run_in_executor to wrap synchronous boto3 get_object call to avoid blocking the asyncio event loop

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test mock setup for asyncpg pool required custom async context manager helper (_make_mock_pool) since AsyncMock default behavior does not support `async with pool.acquire()` pattern correctly
- duplicate_detector tests needed sys.modules stubbing for heavy ML dependencies (imagehash, aiokafka, torch) not available in test environment

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- HNSW index ready for downstream CLIP embedding pipeline (Plan 03+)
- EmbeddingRepository provides the query layer needed by similarity grouping and smart curation
- R2 download working in duplicate_detector for hash-based and CLIP-based duplicate detection

## Self-Check: PASSED

- All 5 created files verified on disk
- Both task commits (7bb8dda4, 23f9f705) verified in git log

---
*Phase: 06-ai-ml-pipeline*
*Completed: 2026-03-18*
