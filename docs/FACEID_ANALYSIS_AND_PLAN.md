# FaceID Tagging System Analysis & Smart Caching Implementation Plan

**Date**: 2026-02-08
**Status**: Implementation In Progress (Session 2)

---

## 📊 Implementation Progress

### Sprint 1: Fix Critical Issues (83% Complete)
- ✅ Task 1.1: Fixed face_embedder.py with retry logic, validation, circuit breaker
- ✅ Task 1.2: Added AI provider configuration to gallery-service config.py
- ✅ Task 1.3: Fixed initialization logic in face_detection_service.py (added dev bypass, better error messages)
- ✅ Task 1.4: Created cache tables migration (0193_add_face_embedding_cache_tables.py)
- ✅ Task 1.5: Added consent seeding endpoint and biometric consent API
- ⏳ Task 1.6: Add cache integration tests

### Sprint 2: Core Caching (80% Complete)
- ✅ Task 2.1: Implemented FaceTaggingCacheManager service
- ✅ Task 2.2: Implemented FaceCacheRepository
- ✅ Task 2.3: Added cache-aware endpoints to faces.py (stats, invalidate, warm)
- ✅ Task 2.4: Created client-side cache service (faceCacheService.ts, useFaceCache hook)
- ⏳ Task 2.5: Add cache unit tests

### Sprint 3: Advanced Caching (0% Complete)
- ⏳ Task 3.1: Implement FaceCacheWarmer
- ⏳ Task 3.2: Add scheduled warmup jobs
- ⏳ Task 3.3: Implement similarity index cache
- ⏳ Task 3.4: Configure Redis cache
- ⏳ Task 3.5: Update API documentation

### Sprint 4: Testing & Deployment (0% Complete)
- ⏳ Task 4.1: Load testing with cache
- ⏳ Task 4.2: Cache invalidation testing
- ⏳ Task 4.3: Performance benchmarking
- ⏳ Task 4.4: Production deployment
- ⏳ Task 4.5: Monitoring & alerting setup

---

## 🎉 Session 2 Accomplishments (2026-02-08)

### Files Created
1. **backend/src/app/services/biometric_consent_seeder.py**
   - CLI utility for seeding consent in development
   - Seed specific workspace or all workspaces
   - Verify consent status

2. **frontend/src/services/faceCacheService.ts**
   - Client-side cache integration service
   - Biometric consent management
   - Cache stats and invalidation
   - LocalStorage caching for performance

3. **frontend/src/hooks/useFaceCache.ts**
   - React hooks: useFaceCacheStats, useBiometricConsent, useFaceDetectionAllowed
   - Utility functions for formatting status
   - Performance metrics calculation

### Files Modified
1. **backend/src/app/api/v1/faces.py**
   - Added biometric consent endpoints (POST, GET, DELETE)
   - Added cache management endpoints (stats, invalidate, warm)
   - Integrated FaceTaggingCacheManager

2. **backend/src/app/services/face_detection_service.py**
   - Added RAWDRIVE_BYPASS_BIOMETRIC_CONSENT env var for development
   - Improved DetectionDisabledError with reason field
   - Better error messages for consent blocking

3. **backend/src/app/services/face_exceptions.py**
   - Updated DetectionDisabledError with reason parameter
   - Better user-facing messages for consent issues

### New API Endpoints

#### Biometric Consent
- `POST /api/v1/workspaces/{workspace_id}/biometric-consent` - Grant consent
- `GET /api/v1/workspaces/{workspace_id}/biometric-consent` - Get consent status
- `DELETE /api/v1/workspaces/{workspace_id}/biometric-consent` - Withdraw consent

#### Cache Management
- `GET /api/v1/workspaces/{workspace_id}/cache/stats` - Cache statistics
- `DELETE /api/v1/workspaces/{workspace_id}/cache` - Invalidate cache
- `POST /api/v1/galleries/{gallery_id}/cache/warm` - Warm gallery cache

### Frontend Integration

#### Service API
```typescript
// Check consent
const allowed = await faceCacheService.isFaceDetectionAllowed(workspaceId);

// Grant consent
await faceCacheService.grantConsent(workspaceId, {
  policy_version: "1.0",
  auto_enable_detection: true
});

// Get cache stats
const stats = await faceCacheService.getCacheStats(workspaceId);

// Warm gallery cache
const result = await faceCacheService.warmGalleryCache(workspaceId, galleryId, 100);
```

#### React Hooks
```typescript
// Consent management
const { status, isAllowed, grantConsent } = useBiometricConsent(workspaceId);

// Cache statistics
const { stats, metrics, refetch } = useFaceCacheStats(workspaceId);

// Quick permission check
const allowed = useFaceDetectionAllowed(workspaceId);
```

### Environment Variables Added
- `RAWDRIVE_BYPASS_BIOMETRIC_CONSENT` - Development bypass for consent checks (default: false)
- `TEST_WORKSPACE_IDS` - Comma-separated list of test workspace IDs

---

## 📊 Executive Summary

The RawDrive faceID tagging system consists of multiple interconnected components across backend, frontend, and AI processing services. This document provides a comprehensive analysis of the current implementation, identifies critical issues preventing faceID tagging from working, and presents a detailed implementation plan for a smart caching layer.

---

## 🏗️ Current Architecture Overview

### Database Schema

| Table | Purpose | Key Columns |
|-------|---------|--------------|
| **faces** | Stores detected faces | id, workspace_id, photo_id, bounding_box, confidence, embedding, face_group_id, thumbnail_urls |
| **face_groups** | Face clusters (people) | id, workspace_id, name, person_id, centroid, face_count, representative_face_id |
| **face_assignments** | Face-to-group history | id, workspace_id, face_id, face_group_id, confidence, source, is_confirmed |
| **face_detection_jobs** | Async processing queue | id, workspace_id, photo_id, status, priority, faces_detected, error_message |
| **assets** | Photos with denormalized status | asset_id, face_scan_status, faces_count, face_scanned_at |

### Backend Services (Main)

```
backend/src/app/services/
├── face_detection_service.py      # Orchestrates detection pipeline
├── face_clustering_service.py     # Gallery-level clustering orchestration
├── face_cluster_service.py        # Core clustering operations
├── face_detection_worker.py       # Async worker (processes jobs)
├── ai/
│   ├── face_embedder.py            # ArcFace ONNX model (512-d embeddings)
│   └── providers/
│       ├── provider_manager.py      # Provider selection & failover
│       ├── cloud_vision_provider.py
│       ├── gemini_provider.py
│       └── local_provider.py        # InsightFace-based local detection
├── repositories/
│   ├── face_repository.py
│   ├── face_group_repository.py
│   └── face_embedding_repository.py
└── api/v1/
    └── faces.py                     # REST endpoints
```

### AI Processing Service (Separate)

```
services/ai-processing-service/
├── src/
│   ├── services/
│   │   ├── face_detection_service.py    # InsightFace wrapper
│   │   └── face_embedding_service.py
│   └── workers/
│       └── face_detection_worker.py    # Celery tasks
└── config.py
```

### Frontend Services

```
frontend/src/services/
├── faceDetectionService.ts          # face-api.js wrapper
├── faceApiLoader.ts                 # Dynamic model loading
└── faceApiService.ts                # API integration
```

---

## 🔍 Critical Issues Identified

### 1. Configuration & Authentication Issues

#### Missing AI Provider Configuration
```python
# services/gallery-service/src/config.py - MISSING
# No AI_API_KEY, AI_PROVIDER, or face detection config
```

**Impact**: Face detection fails silently or throws authentication errors.

#### Biometric Consent Blocking
```python
# backend/src/app/services/face_detection_service.py:709-756
async def _is_detection_enabled(self, workspace_id: UUID) -> bool:
    # COM-001: Check biometric consent FIRST
    consent_allowed = await self.consent_service.is_face_detection_allowed(workspace_id)
    if not consent_allowed:
        return False  # BLOCKS all face detection
```

**Impact**: Face detection is blocked until explicit consent granted per workspace.

### 2. Model Initialization Issues

#### Heavy Model Download
```python
# backend/src/app/services/ai/face_embedder.py:46-78
MODEL_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
# 100+ MB model download on first use - NO retry logic
```

**Impact**: Fails on network issues, timeout, or insufficient disk space.

#### Lazy Initialization Race Conditions
```python
# backend/src/app/services/ai/face_embedder.py:34-44
async def ensure_initialized(self):
    async with self._init_lock:  # Lock exists but...
        if self._initialized:
            return
        await self._load_model()  # Can fail, leaves corrupted state
        self._initialized = True  # Set even if load failed!
```

**Impact**: Failed initialization leaves service in broken state.

### 3. Architecture Duplication

#### Dual AI Processing Services
1. **Backend**: `backend/src/app/services/ai/` - ProviderManager with Cloud Vision/Gemini/Local
2. **AI Processing Service**: `services/ai-processing-service/` - InsightFace only

**Impact**: Confusion about which service handles what. No clear integration point.

### 4. No Caching Layer

#### Repeated Embedding Generation
```python
# Each face detection triggers:
# 1. Download/decrypt full image (R2 storage)
# 2. Call AI provider for detection
# 3. Generate embeddings locally (ArcFace)
# 4. Store in database
# NO CACHING of embeddings or detection results
```

**Impact**:
- Same photo re-scanned every time
- High latency (2-10s per photo)
- Unnecessary AI API costs
- Scalability bottleneck

### 5. Worker Issues

#### Job Timeout Too Short
```python
# backend/src/app/services/face_detection_worker.py:47
JOB_TIMEOUT_SECONDS = 120  # 2 minutes
# For batch processing or slow networks, this is too short
```

#### Stale Job Recovery Issues
```python
# OLD_JOB_CLEANUP_MINUTES = 60
# Jobs older than 1 hour are auto-deleted - TOO AGGRESSIVE
# Can delete jobs that are just slow to process
```

### 6. Missing Error Context

#### Provider Failures Not Logged Properly
```python
# All providers fail → Generic error
# No detailed logging of WHICH provider failed and WHY
```

---

## 🎯 Implementation Plan: Smart Tagging Cache Layer

### Phase 1: Fix Critical FaceID Issues (Priority: HIGH)

#### 1.1 Fix Configuration
- Add AI provider configuration to gallery-service
- Add proper environment variable documentation
- Set up default provider priorities

#### 1.2 Fix Model Initialization
- Add proper error handling with retries
- Implement model preloading on service startup
- Add model validation after download
- Implement circuit breaker for model loading

#### 1.3 Fix Biometric Consent
- Ensure consent is properly seeded for test workspaces
- Add API endpoint to grant consent programmatically
- Add UI indication when consent is missing

#### 1.4 Consolidate AI Services
- Decide on single source of truth for face detection
- Integrate LocalProvider with proper configuration
- Remove or deprecate duplicate ai-processing-service

### Phase 2: Smart Caching Layer (Priority: HIGH)

#### 2.1 Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    Smart Tagging Cache Layer                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────────────┐      │
│  │  L1     │  │   L2     │  │         L3                │      │
│  │ Memory  │  │  Redis  │  │   Persistent Storage      │      │
│  │ Cache  │  │  Cache  │  │  (Database + Index)     │      │
│  │         │  │         │  │                          │      │
│  │ • Embed  │  │ • Embed │  │ • Processed Assets       │      │
│  │  dings  │  │  dings  │  │ • Face Groups            │      │
│  │ • BBox   │  │ • BBox   │  │ • Similarity Index       │      │
│  │ • Meta   │  │ • Meta   │  │ • Cache Metadata        │      │
│  │         │  │         │  │                          │      │
│  │ 32MB    │  │  256MB  │  │ Unlimited                │      │
│  │ default │  │  LRU    │  │                          │      │
│  └─────────┘  └──────────┘  └──────────────────────────┘      │
│       │            │                       │                     │
│       └────────────┴───────────────────────┘                     │
│                   │                                               │
│              ┌───▼────┐                                       │
│              │ Cache  │                                       │
│              │ Manager│                                       │
│              └────────┘                                       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.2 Cache Key Design

```python
# Asset-level cache key
asset_cache_key = f"asset:{workspace_id}:{asset_id}:hash(image_data)}"

# Embedding-level cache
embedding_cache_key = f"embedding:{workspace_id}:{hash(face_crop)}"

# Face group cache
group_cache_key = f"group:{workspace_id}:{group_id}"
```

#### 2.3 Cache Strategies

**Write-Through Pattern:**
1. Check cache → Return if hit
2. Generate embeddings → Store in all cache layers
3. Return result

**Write-Behind Pattern:**
1. Check cache → Return if hit
2. Queue async job → Return immediately with status
3. Job processes → Updates cache
4. Client polls or gets webhook notification

#### 2.4 Cache Invalidation

- **Time-based**: TTL on all entries (5 min for L1, 1 hour for L2, 24 hours for L3)
- **Event-based**: Invalidate on asset update/delete
- **Explicit**: Admin API to invalidate by workspace/gallery/asset
- **Predictive**: Preload likely-accessed faces (recent uploads, popular galleries)

### Phase 3: Database Schema Additions

```sql
-- Asset embeddings cache (fast lookup for already-processed assets)
CREATE TABLE asset_embeddings_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
    image_hash VARCHAR(64) NOT NULL,  -- SHA-256 of image data

    -- Cached detection results (JSONB for flexibility)
    faces_detected INTEGER DEFAULT 0,
    bounding_boxes JSONB,  -- Array of {x, y, width, height}
    embeddings JSONB,  -- Array of 512-d vectors
    confidence_scores JSONB,  -- Detection confidence per face
    detection_metadata JSONB,

    -- Caching metadata
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ttl_seconds INTEGER DEFAULT 3600,  -- Time-to-live
    hit_count INTEGER DEFAULT 0,

    -- Performance indexes
    CONSTRAINT asset_embeddings_cache_unique UNIQUE (workspace_id, asset_id, image_hash)
);

CREATE INDEX idx_asset_embeddings_cache_asset ON asset_embeddings_cache(asset_id);
CREATE INDEX idx_asset_embeddings_cache_workspace ON asset_embeddings_cache(workspace_id);
CREATE INDEX idx_asset_embeddings_cache_hash ON asset_embeddings_cache(image_hash);
CREATE INDEX idx_asset_embeddings_cache_ttl ON asset_embeddings_cache(cached_at + INTERVAL '1 second' * ttl_seconds) WHERE ttl_seconds IS NOT NULL;

-- Face group centroid cache (avoid recalculating)
CREATE TABLE face_group_centroids_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    face_group_id UUID NOT NULL REFERENCES face_groups(id) ON DELETE CASCADE,

    -- Cached centroid
    centroid_vector JSONB NOT NULL,  -- 512-d centroid
    face_count INTEGER NOT NULL,
    quality_score DECIMAL(5,4),  -- Cluster quality metric

    -- Metadata
    last_face_added_at TIMESTAMPTZ,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ttl_seconds INTEGER DEFAULT 7200,  -- 2 hours

    CONSTRAINT face_group_centroids_cache_unique UNIQUE (workspace_id, face_group_id)
);

CREATE INDEX idx_face_group_centroids_cache_group ON face_group_centroids_cache(face_group_id);
CREATE INDEX idx_face_group_centroids_cache_ttl ON face_group_centroids_cache(calculated_at + INTERVAL '1 second' * ttl_seconds);
```

### Phase 4: New Services

#### 4.1 Cache Manager Service

```python
# backend/src/app/services/face_cache_manager.py
class FaceTaggingCacheManager:
    """Manages multi-tier caching for face detection results."""

    async def get_cached_detection(self, asset_id: UUID, workspace_id: UUID, image_hash: str) -> Optional[dict]
    async def cache_detection(self, asset_id: UUID, workspace_id: UUID, image_hash: str, result: dict)
    async def invalidate_asset(self, asset_id: UUID, workspace_id: UUID)
    async def invalidate_gallery(self, gallery_id: UUID, workspace_id: UUID)
    async def warm_cache_for_gallery(self, gallery_id: UUID, workspace_id UUID)
    async def get_cache_stats(self, workspace_id: UUID) -> dict
```

#### 4.2 Cache Warmer Worker

```python
# backend/src/app/services/face_cache_warmer.py
class FaceCacheWarmer:
    """Background worker that preloads cache for likely-accessed assets."""

    async def warm_recent_uploads(self, workspace_id: UUID, limit: int = 100)
    async def warm_popular_galleries(self, workspace_id: UUID, limit: int = 20)
    async def warm_user_favorites(self, user_id: UUID, workspace_id: UUID)
```

### Phase 5: API Enhancements

```python
# New endpoints
POST /api/v1/faces/cache/warm
GET /api/v1/faces/cache/stats
DELETE /api/v1/faces/cache/invalidate
GET /api/v1/galleries/{id}/faces/cached
```

---

## 📋 Implementation Task Breakdown

### Sprint 1: Fix Critical Issues (Week 1)

| Task | File | Description | Est. Effort |
|------|------|-------------|------------|
| 1.1 | `backend/src/app/services/ai/face_embedder.py` | Add model download retry & validation | 4h |
| 1.2 | `services/gallery-service/src/config.py` | Add AI provider config | 2h |
| 1.3 | `backend/src/app/services/face_detection_service.py` | Fix initialization logic | 3h |
| 1.4 | `backend/migrations/` | Add cache tables migration | 3h |
| 1.5 | `backend/src/app/api/v1/` | Add consent seeding endpoint | 2h |
| 1.6 | Tests | Add cache integration tests | 6h |

### Sprint 2: Core Caching (Week 2)

| Task | File | Description | Est. Effort |
|------|------|-------------|------------|
| 2.1 | `backend/src/app/services/face_cache_manager.py` | Implement cache manager | 8h |
| 2.2 | `backend/src/app/repositories/face_cache_repository.py` | Cache data access | 4h |
| 2.3 | `backend/src/app/api/v1/faces.py` | Add cache-aware endpoints | 4h |
| 2.4 | `frontend/src/services/faceDetectionService.ts` | Client-side cache checking | 3h |
| 2.5 | Tests | Add cache unit tests | 6h |

### Sprint 3: Advanced Caching (Week 3)

| Task | File | Description | Est. Effort |
|------|------|-------------|------------|
| 3.1 | `backend/src/app/services/face_cache_warmer.py` | Implement cache warmer | 6h |
| 3.2 | `backend/src/app/scheduled/face_cache_warmup.py` | Scheduled warmup jobs | 4h |
| 3.3 | `backend/src/app/services/face_similarity_cache.py` | Similarity index cache | 8h |
| 3.4 | Infrastructure | Redis cache configuration | 4h |
| 3.5 | Docs | Update API documentation | 3h |

### Sprint 4: Testing & Deployment (Week 4)

| Task | Description | Est. Effort |
|------|-------------|------------|
| 4.1 | Load testing with cache | 6h |
| 4.2 | Cache invalidation testing | 4h |
| 4.3 | Performance benchmarking | 4h |
| 4.4 | Production deployment | 4h |
| 4.5 | Monitoring & alerting setup | 3h |

---

## 🔧 Technical Specifications

### Cache Hit Flow

```
1. Client requests faces for photo
   ↓
2. API checks L1 (memory cache) → Hit? Return
   ↓
3. Check L2 (Redis) → Hit? Return & populate L1
   ↓
4. Check L3 (database) → Hit? Return & populate L1, L2
   ↓
5. Miss → Queue detection job
   ↓
6. Process detection → Store in all layers → Return
```

### Cache Warming Strategies

1. **On Upload**: Cache newly uploaded photos immediately
2. **Scheduled**: Warm popular galleries every 6 hours
3. **On Access**: Lazy load when gallery is viewed
4. **Predictive**: Based on access patterns

### Cache Invalidation Triggers

- Asset modified/deleted
- Face groups merged/split
- User consent revoked
- Explicit invalidation via API
- TTL expiration

---

## 📈 Performance Targets

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Avg face detection latency | 5-10s | 50-200ms (cache hit) |
| Re-detection same photo | 5-10s | 50-200ms |
| Gallery face scan (100 photos) | 8-16 min | 30-60s (warmed cache) |
| Memory usage per instance | ~500MB | ~600MB (+cache) |
| Redis storage for cache | 0 | ~500MB (100K photos) |
| Database query reduction | 1x | 0.1x (90% reduction) |

---

## 🚀 Next Steps

1. **Review Plan**: Get approval on architecture and implementation plan
2. **Sprint 1**: Fix critical faceID blocking issues
3. **Sprint 2**: Implement core multi-tier caching
4. **Sprint 3**: Advanced caching features
5. **Sprint 4**: Testing, deployment, monitoring

---

## 📝 Dependencies

- Redis 7+ (for L2 cache)
- PostgreSQL 16+ (for L3 cache)
- InsightFace buffalo_l models
- Pydantic v2 settings
- asyncio for async operations
- pytest-asyncio for testing

---

**Document Version**: 1.1
**Last Updated**: 2026-02-08
**Author**: Claude Code Analysis

---

## 📋 Implementation Session Summary (2026-02-08)

### Files Created
1. **backend/migrations/versions/0193_add_face_embedding_cache_tables.py**
   - Database migration for cache tables (asset_embeddings_cache, face_group_centroids_cache)
   - Includes helper functions for cache stats and cleanup

2. **backend/src/app/services/face_cache_manager.py**
   - Multi-tier cache manager (L1: Memory, L2: Redis, L3: Database)
   - Write-through caching pattern with automatic promotion
   - Cache invalidation methods (asset, gallery, workspace)
   - Cache warming functionality

3. **backend/src/app/repositories/face_cache_repository.py**
   - Data access layer for cache operations
   - Batch operations and similarity search
   - Cache statistics and cleanup queries

4. **backend/src/app/models/asset_embeddings_cache.py**
   - SQLAlchemy model for L3 asset cache

5. **backend/src/app/models/face_group_centroids_cache.py**
   - SQLAlchemy model for L3 group centroid cache

### Files Modified
1. **backend/src/app/services/ai/face_embedder.py**
   - Added retry logic with exponential backoff for model download
   - Model validation after download (size checks, hash verification)
   - Circuit breaker pattern for fault tolerance
   - Health check and preload methods
   - Custom exceptions (ModelLoadError, ModelValidationError)

2. **services/gallery-service/src/config.py**
   - Added comprehensive AI provider configuration
   - Face detection settings (confidence thresholds, timeouts)
   - Face embedding and clustering configuration
   - Model download and circuit breaker settings

3. **backend/src/app/models/__init__.py**
   - Added imports for new cache models

### Key Improvements Implemented

#### Face Embedder (face_embedder.py)
- **Retry Logic**: 3 attempts with exponential backoff (2s base, 30s max)
- **Circuit Breaker**: Opens after 3 failures, 60s recovery timeout
- **Model Validation**: Size checks (50-200MB), optional SHA-256 hash verification
- **Timeout**: 5-minute timeout for model download
- **Health Monitoring**: get_health_status() method for monitoring

#### Cache Architecture
- **L1 Memory Cache**: 32MB default, LRU eviction, 5min TTL
- **L2 Redis Cache**: 256MB, 1hr TTL, distributed across instances
- **L3 Database Cache**: Unlimited size, 1-24hr TTL, persistent
- **Write-Through Pattern**: All layers updated on cache miss
- **Automatic Promotion**: L3→L2→L1 promotion on access

#### Cache Manager API
```python
# Cache lookup
result = await cache_manager.get_cached_detection(asset_id, workspace_id, image_hash)
if result.found:
    return result.data  # 50-200ms cache hit

# Cache write
await cache_manager.cache_detection(asset_id, workspace_id, image_hash, detection_data)

# Invalidation
await cache_manager.invalidate_asset(asset_id, workspace_id)
await cache_manager.invalidate_gallery(gallery_id, workspace_id)
await cache_manager.invalidate_workspace(workspace_id)

# Statistics
stats = await cache_manager.get_cache_stats(workspace_id)

# Warming
stats = await cache_manager.warm_cache_for_gallery(gallery_id, workspace_id, limit=100)
```

### Remaining Work

#### Sprint 1 (Pending)
- Fix initialization logic in face_detection_service.py
- Add consent seeding endpoint
- Add cache integration tests

#### Sprint 2 (Pending)
- Add cache-aware endpoints to faces.py
- Add client-side cache checking to frontend
- Add cache unit tests

#### Sprint 3 (Pending)
- Implement FaceCacheWarmer for background warming
- Add scheduled warmup jobs
- Implement similarity index cache
- Configure Redis cache

#### Sprint 4 (Pending)
- Load testing with cache
- Cache invalidation testing
- Performance benchmarking
- Production deployment
- Monitoring & alerting setup

### Technical Notes
- All SQLAlchemy interval expressions use PostgreSQL text syntax for compatibility
- Cache keys follow pattern: `asset:{workspace_id}:{asset_id}:{image_hash}`
- L1 cache uses Python dict with simple LRU (FIFO on capacity)
- L2 Redis operations include error handling for graceful degradation
- Database operations use proper workspace_id filtering for multi-tenant isolation

### Docker face-worker: restarts and in-flight jobs

The face detection worker runs in a separate container (`rawdrive-face-worker`). If it restarts while processing jobs, in-flight jobs are dropped and left in `processing` until the worker’s stale-job recovery (~3 min) resets them to `pending`.

**Always check evidence before assuming cause:**

- **Was it OOM?**  
  `docker inspect --format '{{.State.OOMKilled}}' rawdrive-face-worker`  
  If `true`, the kernel killed the container (exit code 137). Increase memory limit or reduce `CONCURRENT_JOBS`.
- **Exit code?**  
  `docker inspect --format '{{.State.ExitCode}}' rawdrive-face-worker`  
  `0` = clean shutdown (e.g. SIGTERM, `docker restart`, or graceful exit). `137` = OOM.
- **Manual restart?**  
  A `docker restart rawdrive-face-worker` (e.g. to pick up code changes) will also interrupt in-flight jobs; that is expected.

Compose uses a 4G memory limit and 180s health `start_period` for the face-worker as hardening; confirm actual restarts with the commands above.

**After any restart:** Stale jobs (status `processing` for &gt;3 minutes) are reset to `pending` by the worker and picked up again on the next poll.

