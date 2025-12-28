# Quickstart: Smart Local Tagging Layer

**Feature**: 005-smart-tagging-cache
**Date**: 2025-12-28

---

## Prerequisites

Before implementing this feature, ensure:

1. **Database migrations up to date** (0040+)
2. **Face detection worker running** (existing infrastructure)
3. **AI provider credentials configured** (Cloud Vision and/or Gemini)
4. **Redis available** for caching

---

## Quick Implementation Guide

### Phase 1: Database Schema (Migrations)

Run migrations in order:

```bash
# From backend directory
cd backend

# Create migrations
alembic revision --autogenerate -m "0041_smart_tagging_extensions"
alembic revision --autogenerate -m "0042_asset_analysis"
alembic revision --autogenerate -m "0043_content_detection_jobs"
alembic revision --autogenerate -m "0044_face_groups_person_link"
alembic revision --autogenerate -m "0045_gallery_tagging_stats"

# Apply
alembic upgrade head
```

### Phase 2: Backend Services

Create/extend these services:

```python
# backend/src/app/services/content_detection_service.py
class ContentDetectionService:
    """Orchestrates content/vision tag analysis."""

    async def detect_content(self, asset_id: UUID, workspace_id: UUID) -> dict:
        """Analyze asset content and generate tags."""
        pass

    async def queue_detection(self, asset_id: UUID, workspace_id: UUID, priority: int = 5):
        """Queue asset for background content detection."""
        pass

# backend/src/app/services/content_detection_worker.py
class ContentDetectionWorker:
    """Background worker for content detection jobs (follows face_detection_worker pattern)."""
    pass

# backend/src/app/services/tagging_health_service.py
class TaggingHealthService:
    """Gallery and workspace tagging health metrics."""
    pass
```

Extend existing services:

```python
# Extend TagService
class TagService:
    async def add_ai_tags(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        tags: list[dict],  # [{"name": str, "confidence": float, "metadata": dict}]
        source: str,  # 'ai_vision', 'ai_gemini', 'ai_local'
    ) -> list[dict]:
        """Add AI-generated tags to an asset."""
        pass

    async def remove_ai_tags(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> int:
        """Remove all AI-generated tags from an asset (for re-analysis)."""
        pass

# Extend FaceClusterService
class FaceClusterService:
    async def assign_person(
        self,
        workspace_id: UUID,
        face_group_id: UUID,
        person_id: UUID,
    ) -> dict:
        """Link face group to a person for searchable naming."""
        pass
```

### Phase 3: API Endpoints

Add new routes:

```python
# backend/src/app/api/v1/smart_tagging.py
from fastapi import APIRouter

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["Smart Tagging"])

@router.get("/assets/{asset_id}/analysis")
async def get_asset_analysis(...): pass

@router.post("/assets/{asset_id}/reanalyze")
async def reanalyze_asset(...): pass

@router.post("/assets/reanalyze/bulk")
async def bulk_reanalyze(...): pass

@router.get("/galleries/{gallery_id}/tagging-health")
async def get_gallery_tagging_health(...): pass

@router.get("/tagging-health")
async def get_workspace_tagging_health(...): pass
```

Extend existing routes:

```python
# Extend backend/src/app/api/v1/tags.py
@router.get("/workspaces/{workspace_id}/assets/{asset_id}/tags")
async def get_asset_tags(
    ...,
    source: Optional[str] = Query(None, enum=["all", "manual", "ai"]),
): pass

@router.post("/workspaces/{workspace_id}/assets/tags/bulk")
async def bulk_tag_assets(...): pass

# Extend backend/src/app/api/v1/face_groups.py
@router.put("/workspaces/{workspace_id}/face-groups/{face_group_id}/name")
async def name_face_group(...): pass
```

### Phase 4: Worker Integration

Modify upload pipeline:

```python
# In asset upload commit handler
async def on_asset_committed(asset_id: UUID, workspace_id: UUID):
    # Create analysis record
    await create_asset_analysis(asset_id, workspace_id)

    # Queue content detection
    await content_detection_service.queue_detection(
        asset_id=asset_id,
        workspace_id=workspace_id,
        priority=5,  # Normal upload priority
    )

    # Face detection already queued by existing pipeline
```

Start content worker:

```python
# backend/src/app/workers/content_worker_main.py
async def main():
    worker = ContentDetectionWorker()
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
```

### Phase 5: Frontend Integration

Add React hooks:

```typescript
// frontend/src/hooks/useAssetTags.ts
export function useAssetTags(assetId: string) {
  return useQuery({
    queryKey: ['asset-tags', assetId],
    queryFn: () => api.get(`/assets/${assetId}/tags`),
  });
}

// frontend/src/hooks/useGalleryTaggingHealth.ts
export function useGalleryTaggingHealth(galleryId: string) {
  return useQuery({
    queryKey: ['gallery-tagging-health', galleryId],
    queryFn: () => api.get(`/galleries/${galleryId}/tagging-health`),
    refetchInterval: 60000, // Refresh every minute
  });
}

// frontend/src/hooks/useAssetSearch.ts
export function useAssetSearch(query: string, filters: SearchFilters) {
  return useQuery({
    queryKey: ['asset-search', query, filters],
    queryFn: () => api.get('/search', { params: { q: query, ...filters } }),
  });
}
```

Update components:

```typescript
// frontend/src/components/features/gallery/AssetTagPanel.tsx
// - Show manual vs AI tags with different styling
// - Allow adding/removing manual tags
// - Show confidence for AI tags

// frontend/src/components/features/gallery/TaggingHealthBadge.tsx
// - Show completion percentage
// - Progress bar for pending
// - Warning icon for failures

// frontend/src/components/features/gallery/GallerySearchBar.tsx
// - Extend to filter by tags and people
// - Support combined queries
```

---

## Configuration

### Environment Variables

```bash
# AI Provider (existing)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
GEMINI_API_KEY=your-api-key

# Content Detection Worker
CONTENT_DETECTION_BATCH_SIZE=10
CONTENT_DETECTION_POLL_INTERVAL=5
CONTENT_DETECTION_CONCURRENT_JOBS=5
CONTENT_DETECTION_JOB_TIMEOUT=60
CONTENT_DETECTION_MIN_CONFIDENCE=0.5

# Caching
TAGGING_HEALTH_CACHE_TTL=60  # seconds
```

### Feature Flags

```python
# backend/src/app/config/features.py
SMART_TAGGING_ENABLED = True
AI_CONTENT_DETECTION_ENABLED = True
AUTO_QUEUE_NEW_UPLOADS = True
```

---

## Testing

### Unit Tests

```python
# backend/tests/unit/test_content_detection_service.py
async def test_detect_content_returns_tags():
    """Content detection should return tag list."""
    pass

async def test_queue_detection_creates_job():
    """Queuing detection should create pending job."""
    pass

# backend/tests/unit/test_tag_service_ai.py
async def test_add_ai_tags_with_confidence():
    """AI tags should include confidence scores."""
    pass

async def test_remove_ai_tags_preserves_manual():
    """Removing AI tags should not affect manual tags."""
    pass
```

### Integration Tests

```python
# backend/tests/integration/test_smart_tagging_flow.py
async def test_upload_to_search_flow():
    """Test complete flow: upload → detection → tag → search."""
    # 1. Upload asset
    # 2. Wait for content detection
    # 3. Verify tags created
    # 4. Search by tag name
    # 5. Asset appears in results
    pass

async def test_face_naming_to_search():
    """Test face naming enables person search."""
    # 1. Upload asset with face
    # 2. Wait for face detection
    # 3. Name face group
    # 4. Search by person name
    # 5. Asset appears in results
    pass
```

---

## Monitoring

### Key Metrics

```python
# Prometheus metrics to add
content_detection_jobs_total{status}  # Counter
content_detection_duration_seconds    # Histogram
ai_tags_created_total{provider}       # Counter
tagging_health_completion_ratio       # Gauge per gallery
```

### Health Checks

```python
# /health/content-worker
{
    "status": "healthy",
    "pending_jobs": 42,
    "processing_jobs": 3,
    "last_completed": "2025-12-28T10:30:00Z"
}
```

### Alerts

- `ContentDetectionQueueBacklog > 1000` - Too many pending jobs
- `ContentDetectionFailureRate > 10%` - High failure rate
- `AIProviderCircuitBreakerOpen` - Provider unavailable

---

## Rollout Plan

### Phase 1: Silent Launch
- Enable for internal workspaces only
- Monitor metrics and fix issues

### Phase 2: Beta
- Enable for opt-in workspaces
- Gather user feedback

### Phase 3: General Availability
- Enable for all new uploads
- Backfill existing galleries on request

---

## Common Issues

### No Tags Appearing

1. Check content detection job status in database
2. Verify AI provider credentials
3. Check worker logs for errors
4. Ensure asset has valid image data

### Search Not Finding Tags

1. Verify tags exist in `asset_tags` table
2. Check source filter in query
3. Ensure search indexes are up to date

### Slow Health Dashboard

1. Check materialized view refresh schedule
2. Consider caching in Redis
3. Review index usage on large workspaces
