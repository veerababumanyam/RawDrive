---
phase: 14-faceid-deep-dive-and-enhancement
plan: 02
subsystem: face-processing-performance
tags: [pgvector, hnsw, performance, onnx, worker, timeout]
dependency_graph:
  requires: [14-01]
  provides: [face-hnsw-index, batch-centroid, eager-model-loading, timeout-enforcement]
  affects: [face-cluster-service, face-detection-worker, face-embedder]
tech_stack:
  added: []
  patterns: [batch-db-operations, eager-initialization, circuit-breaker]
key_files:
  created:
    - backend/migrations/versions/0198_add_faces_embedding_hnsw_index.py
    - backend/tests/test_face_performance.py
  modified:
    - backend/src/app/services/face_cluster_service.py
    - backend/src/app/repositories/face_group_repository.py
    - backend/src/app/services/ai/face_embedder.py
    - backend/src/app/face_worker_main.py
    - backend/src/app/services/face_detection_worker.py
decisions:
  - HNSW chosen over IVFFlat for faces table (no training step, better at low data volumes)
  - ef_construction=200 for high recall quality (vs 64 on image_embeddings index)
  - Worker exits on model load failure rather than running with broken model
metrics:
  duration: 5m17s
  completed: 2026-03-19T22:00:22Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 16
  files_created: 2
  files_modified: 5
---

# Phase 14 Plan 02: Face Processing Performance Optimization Summary

HNSW index on faces.embedding for O(log n) similarity search, batch centroid recalculation reducing N queries to 1, eager ONNX model loading eliminating cold start latency, and asyncio.wait_for timeout enforcement with TIMEOUT error codes.

## Tasks Completed

### Task 1: HNSW Index Migration + Batch Centroid Recalculation
**Commit:** 19f962a8

- Created Alembic migration 0198 adding HNSW index on `faces.embedding` with `vector_cosine_ops` (m=16, ef_construction=200)
- Added composite index on `(workspace_id, face_group_id)` for scoped face queries
- Added `batch_recalculate_centroids()` to FaceClusterService - processes N groups and performs bulk update in single transaction
- Added `bulk_update_centroids()` to FaceGroupRepository with automatic cache invalidation
- 7 tests: migration existence/content/downgrade, batch method existence, multi-group processing, cache invalidation, bulk update existence

### Task 2: Eager Model Loading + Worker Timeout Enforcement
**Commit:** 9033273d

- Added `initialize_model()` function: loads ONNX model, logs timing, runs dummy inference warmup
- Added `is_model_loaded()` health check function
- Worker startup calls `initialize_model()` before accepting jobs; exits with RuntimeError on failure
- Added TIMEOUT error code to asyncio.wait_for timeout handler for structured error tracking
- Readiness endpoint now checks model loaded status
- 9 tests: function existence, worker main import, startup call, asyncio.wait_for usage, timeout error handling, job failure marking, stale recovery, timeout config

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 16 tests passing: `python -m pytest backend/tests/test_face_performance.py -v` (2.18s)
- Migration file valid Alembic format with upgrade/downgrade
- Worker timeout already used asyncio.wait_for (confirmed existing pattern, enhanced with TIMEOUT error code)
- Stale job recovery already existed at 3-minute threshold (confirmed <= 5 min requirement)

## Decisions Made

1. **HNSW over IVFFlat for faces table**: No training step needed, works well from 0 to millions of vectors, better recall at low data volumes. Used ef_construction=200 (higher than image_embeddings' 64) since face matching accuracy is critical.
2. **Worker hard-fails on model load**: Rather than silently accepting jobs without a model, the worker raises RuntimeError during startup. This ensures Kubernetes restarts the pod and prevents silent degradation.
3. **Separate index from image_embeddings**: The faces table has its own HNSW index (0198) separate from the image_embeddings HNSW index (0196), since they serve different purposes (face clustering vs visual search).
