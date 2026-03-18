---
phase: 06-ai-ml-pipeline
plan: 03
subsystem: embedding-integration
tags: [clip, embeddings, http-client, celery, duplicate-detection]
dependency_graph:
  requires: [06-01, 06-02]
  provides: [embedding-client, embedding-worker, duplicate-detection]
  affects: [similarity-worker, celery-app]
tech_stack:
  added: [httpx]
  patterns: [http-service-client, celery-task-routing, pgvector-cosine-similarity]
key_files:
  created:
    - backend/src/app/services/embedding_client.py
    - services/ai-processing-service/src/workers/embedding_worker.py
    - backend/tests/test_similarity_worker.py
    - services/ai-processing-service/tests/test_embedding_worker.py
  modified:
    - backend/src/app/workers/similarity_worker.py
    - services/ai-processing-service/src/workers/celery_app.py
decisions:
  - HTTP client with 120s timeout and 1 retry for batch CLIP processing
  - DUPLICATE_CLIP_THRESHOLD=0.95 for near-duplicate detection (stricter than grouping 0.85)
  - Celery embedding tasks routed to dedicated "embedding" queue for resource isolation
metrics:
  duration: 5min
  completed: 2026-03-18T22:34:00Z
  tasks_completed: 2
  tasks_total: 2
  tests_added: 14
  files_changed: 6
---

# Phase 06 Plan 03: Embedding Integration and Celery Worker Summary

EmbeddingClient HTTP service wiring similarity_worker to ai-processing-service for CLIP embeddings, plus Celery task for fire-and-forget embedding on upload with pgvector duplicate detection.

## What Was Built

### Task 1: EmbeddingClient and similarity_worker Integration
- Created `EmbeddingClient` HTTP client that POSTs to `ai-processing-service:8012/api/v1/embed/images`
- Replaced all placeholder implementations in `similarity_worker.py`:
  - `_ensure_clip_model()`: now creates EmbeddingClient (no torch import)
  - `_compute_batch_embeddings()`: extracts object_keys, calls HTTP API, maps back to asset_id
  - `_store_embeddings()`: uses EmbeddingRepository for batch storage + duplicate detection
- Added duplicate detection: after storing embeddings, each asset is checked against existing embeddings with cosine threshold 0.95
- Zero torch/CLIP imports in backend similarity_worker -- all ML offloaded via HTTP

### Task 2: Celery Embedding Worker
- Created `compute_embedding` task: downloads from R2, computes CLIP via CLIPEmbedder, returns 512-dim vector
- Created `compute_batch_embeddings` task: processes list of assets with progress tracking
- Registered `workers.embedding_worker` in celery_app include list
- Added task routing to dedicated `embedding` queue with exchange and routing key
- Tasks configured with max_retries=3 and autoretry on transient errors

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Result |
|-------|--------|
| embedding_client.py contains httpx POST to /api/v1/embed/images | PASS |
| similarity_worker.py has NO import torch | PASS (0 occurrences) |
| similarity_worker.py has NO placeholder | PASS (0 occurrences) |
| similarity_worker.py uses embedding_client | PASS (5 references) |
| similarity_worker.py uses find_similar_by_embedding | PASS |
| celery_app.py includes workers.embedding_worker | PASS |
| embedding_worker.py has @celery_app.task decorator | PASS (2 tasks) |
| All 14 tests pass | PASS |

## Commits

| Hash | Message |
|------|---------|
| 35b0689e | feat(06-03): wire similarity_worker to ai-processing-service via EmbeddingClient |
| de0a8b70 | feat(06-03): add Celery embedding worker for upload-triggered CLIP computation |
