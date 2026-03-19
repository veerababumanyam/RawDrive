# Phase 14: AI Processing Service — Face Detection Analysis

**Analyzed:** 2026-03-19
**Scope:** ai-processing-service, ai-service, diagnostic scripts, test files

## Architecture Overview

**AI Processing Service** (Port 8012, Docker: rawdrive-ai-processing)
- Microservice handling face detection, embedding extraction, and AI processing
- Uses InsightFace models (buffalo_l/m/s, antelopev2) for GPU-accelerated face detection
- Generates 512-dimensional L2-normalized embeddings (ArcFace) for face comparison
- Built with FastAPI, Celery for async tasks, Redis for caching, PostgreSQL for storage, Milvus (optional) for vector search

## Key Services

1. **FaceDetectionService** — Detects faces using InsightFace, extracts bounding boxes, landmarks, attributes (age/gender/pose)
2. **FaceEmbeddingService** — Generates 512-dim embeddings, provides similarity comparison
3. **Face Detection Worker** — Celery tasks for background processing with retry logic (MAX_RETRIES=3, BASE_RETRY_DELAY=60s)
4. **Clustering Service** — Groups similar faces into person clusters
5. **Google Vision Service** — Cloud Vision API integration for content analysis
6. **Gemini Vision Service** — Gemini API integration

## API Endpoints

```
POST /api/v1/detect              — Detect faces in image
POST /api/v1/detect-with-embeddings — Detect + extract embeddings
POST /api/v1/compare             — Compare two face embeddings (cosine similarity)
GET  /api/v1/info                — Service info & config
POST /embed/text                 — Generate CLIP embeddings for text
```

## Configuration

**Face Detection Settings:**
- `FACE_DETECTION_MODEL`: buffalo_l (default)
- `FACE_DETECTION_CONFIDENCE_THRESHOLD`: 0.5 (configurable 0.0-1.0)
- `FACE_DETECTION_MAX_FACES`: 100 per image
- `FACE_DETECTION_DET_SIZE`: 640 (detection resolution)
- `FACE_DETECTION_GPU_ENABLED`: True
- `FACE_EMBEDDING_DIM`: 512

**Celery Configuration:**
- Task timeout: 600s (10 min), soft limit: 540s
- Worker prefetch: 1 (one GPU task at a time)
- Task acks: Late acknowledgment for safety
- Retry: 3 max retries, 60s delay between retries
- Task routing: `face_detection` and `embedding` queues

**Milvus Vector DB (Optional):**
- Collection: `face_embeddings` (512-dim vectors)
- Metric: COSINE similarity
- Index: HNSW (M=16, efConstruction=200, efSearch=100)
- Status: MILVUS_ENABLED flag (disabled by default)

## Known Issues from Diagnostic Scripts

### 1. Face Avatar/Thumbnail Issues (diagnose_face_avatars.py, fix_face_avatars.py)
- Some face_groups lack `representative_face_id` → missing avatars in UI
- Representative faces may have NULL `thumbnail_urls` → broken image display
- Thumbnail generation failed during detection or from old data before thumbnail feature
- Fix script: Sets highest-confidence face as representative and regenerates thumbnails

### 2. Face Configuration Issues (verify_face_config.py)
- Google Cloud Vision credentials missing or misconfigured
- Checks for: GOOGLE_CLOUD_VISION_CREDENTIALS, GOOGLE_APPLICATION_CREDENTIALS paths
- Gemini API key configuration issues
- Provider credential validation and file existence checks

### 3. Biometric Consent Flow Issues (reproduce_issue.py)
- Biometric consent endpoint returning errors for face detection workflows
- Free users can't enable face detection due to consent check failures
- Involves: POST /workspaces/{workspace_id}/biometric-consent flow

### 4. FaceGroupResponse 500 Errors (reproduce_500.py)
- Pydantic validation errors returning 500 errors
- Root cause: Duplicate `id` parameter in validation (passed as arg + in **dict)
- Affects: GET face groups endpoints with deserialization

### 5. Stuck/Failed Jobs (reset_failed_face_jobs.py, reset_stuck_jobs.py)
- Jobs getting stuck in processing state indefinitely
- Failed jobs not properly cleaned up
- Scripts exist to manually reset these states

### 6. Free User FaceID Access (verify_free_user_faceid.py)
- Script verifying free-tier users can access face identification
- Suggests there were/are issues with plan-gating face features

## Test Coverage

**Integration Tests:**
- test_face_detection_real_photos.py — Real photo processing with thumbnail service
- test_face_cache_integration.py — Cache behavior across operations
- test_face_naming_search.py — Person name lookup & clustering
- test_face_error_responses.py — Security: generic error messages (no ID leakage)
- test_face_retention_worker.py — Data retention policies
- test_face_rate_limiting.py — Rate limit enforcement

**Unit Tests:**
- test_face_cluster_service.py — Person assignment & clustering logic
- test_face_cache_unit.py — Cache hit/miss scenarios
- test_face_error_handler.py — Exception handling
- test_face_rate_limit_service.py — Rate limit calculations
- test_biometric_consent_service.py — Consent validation

**Property-Based Tests:**
- test_face_cluster_properties.py — Cluster invariants
- test_face_detection_properties.py — Detection properties
- test_face_filtering_properties.py — Filter behavior
- test_face_group_deletion_properties.py — Deletion safety
- test_face_service_properties.py — Service contracts

## Error Handling Patterns

**Strengths:**
- Comprehensive error codes (FaceDetectionErrorCode enum)
- User-friendly messages mapped per error code
- HTTP status codes properly mapped
- Correlation ID support for tracing

**Gaps:**
- Worker doesn't propagate errors back to API (fire-and-forget)
- No retry logic in API endpoints for transient failures
- Rate limit errors not distinguishable from other 429s
- 540s soft limit triggers graceful shutdown, 600s hard kill

## Performance

- Detection: ~100-150ms per image (GPU-accelerated)
- Embedding: ~50-100ms per face
- Batch processing: 10-100 images with configurable batch size
- GPU memory: RealESRGAN uses ~9% VRAM fraction

## Missing/Incomplete Features

- Kafka consumers partially disabled (duplicate_detector, content_moderator, auto_tagger, upscaler)
- MCP server (upload monitoring) not fully integrated
- Some Kafka topic subscriptions need initialization
- Milvus vector search disabled by default (falling back to pgvector)

## Service Communication

- **Sync:** FastAPI REST endpoints for direct detection requests
- **Async:** Celery workers for batch processing, long-running tasks
- **Storage:** R2 (Cloudflare) for thumbnails, PostgreSQL for embeddings & metadata
- **Vector Search:** Milvus (optional), pgvector (default)
- **Caching:** Redis for intermediate results and rate limiting
