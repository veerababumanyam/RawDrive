# Quickstart: Face Detection Audit Remediation

**Feature**: `002-face-audit-remediation`
**Date**: 2026-01-21

## Overview

This guide helps developers quickly get started implementing the face detection audit remediation features. The implementation addresses five audit findings:

| ID | Finding | Priority |
|----|---------|----------|
| COM-001 | Biometric consent tracking | P1 |
| SEC-001 | Face operation rate limiting | P2 |
| SEC-002 | Generic error messages | P3 |
| COM-002 | Embedding retention policy | P4 |
| PERF-001 | Face group query caching | P5 |

---

## Prerequisites

### Development Environment
```bash
# Ensure services are running
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Verify face-related services
curl http://localhost:8000/health/live  # Backend
curl http://localhost:6379/ping         # Redis (via redis-cli)
```

### Required Knowledge
- RawDrive 3-layer architecture (API → Service → Repository)
- FastAPI dependency injection (`Depends()`)
- Redis caching patterns (see `services/gallery-service/src/cache/`)
- Alembic migrations

---

## Implementation Order

### 1. Start with SEC-002 (Generic Error Messages)

**Easiest, lowest risk, immediate security value.**

**Files to modify:**
- `backend/src/app/middleware/face_error_handler.py`
- `backend/src/app/api/v1/faces.py` (review raise sites)
- `backend/src/app/api/v1/face_groups.py` (review raise sites)

**Pattern:**
```python
# Before (UNSAFE)
raise HTTPException(
    status_code=404,
    detail=f"Face {face_id} not found"  # Exposes face_id
)

# After (SAFE)
raise FaceNotFoundError(face_id=face_id)  # ID logged internally only

# In face_error_handler.py - sanitize before response
def _sanitize_message(code: str, detail: str) -> str:
    """Remove internal identifiers from error messages."""
    GENERIC_MESSAGES = {
        "FACE_NOT_FOUND": "The requested resource was not found.",
        "FACE_GROUP_NOT_FOUND": "The requested resource was not found.",
        "WORKSPACE_ACCESS_DENIED": "Access denied.",
    }
    return GENERIC_MESSAGES.get(code, "An error occurred.")
```

**Test:**
```bash
# Should return generic message, not face ID
curl -X GET "http://localhost:8000/api/v1/workspaces/{ws}/faces/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"error": {"code": "RESOURCE_NOT_FOUND", "message": "The requested resource was not found."}}
```

---

### 2. Add PERF-001 (Face Group Caching)

**Quick win, improves performance, low risk.**

**Files to modify:**
- `backend/src/app/repositories/face_group_repository.py`
- `backend/src/app/api/v1/face_groups.py` (add invalidation)
- `backend/src/app/db/redis.py` (use existing client)

**Pattern:**
```python
# In face_group_repository.py
from app.db.redis import get_redis_client

class FaceGroupRepository:
    CACHE_TTL = 120  # 2 minutes

    async def find_by_gallery_id_with_stats(
        self,
        workspace_id: UUID,
        gallery_id: UUID,
        limit: int,
        offset: int,
    ) -> list[dict]:
        redis = await get_redis_client()
        cache_key = f"face_groups:{workspace_id}:{gallery_id}:{limit}:{offset}"

        # Try cache first
        cached = await redis.get(cache_key)
        if cached:
            return json.loads(cached)

        # Cache miss - query database
        result = await self._query_face_groups(workspace_id, gallery_id, limit, offset)

        # Cache result
        await redis.setex(cache_key, self.CACHE_TTL, json.dumps(result, default=str))
        return result

    async def invalidate_cache(self, workspace_id: UUID, gallery_id: UUID = None):
        """Invalidate face group caches."""
        redis = await get_redis_client()
        pattern = f"face_groups:{workspace_id}:{gallery_id or '*'}:*"
        keys = await redis.keys(pattern)
        if keys:
            await redis.delete(*keys)
```

**Invalidation points in face_groups.py:**
```python
@router.post("/face-groups/merge")
async def merge_face_groups(...):
    result = await face_group_service.merge(...)
    # Invalidate cache after mutation
    await face_group_repo.invalidate_cache(workspace_id)
    return result
```

---

### 3. Implement SEC-001 (Rate Limiting)

**Medium complexity, critical for security.**

**Files to modify:**
- `backend/src/app/services/rate_limit_service.py` (add face types)
- `backend/src/app/middleware/rate_limit.py` (extend)
- `infrastructure/docker/traefik/dynamic.yaml` (add middleware)

**Add rate limit types:**
```python
# In rate_limit_service.py
class RateLimitType(str, Enum):
    # ... existing types ...
    FACE_SEARCH = "face_search"      # 20/min
    FACE_DETECT = "face_detect"      # 1000/day
    FACE_BULK = "face_bulk"          # 30/min

# Add configurations
RATE_LIMIT_CONFIGS = {
    # ... existing ...
    RateLimitType.FACE_SEARCH: RateLimitConfig(requests=20, window_seconds=60),
    RateLimitType.FACE_DETECT: RateLimitConfig(requests=1000, window_seconds=86400),
    RateLimitType.FACE_BULK: RateLimitConfig(requests=30, window_seconds=60),
}
```

**Apply in API endpoint:**
```python
# In faces.py
from app.services.rate_limit_service import RateLimitService, RateLimitType

@router.post("/faces/search")
async def search_faces(
    workspace_access: WorkspaceAccessDep,
    rate_limiter: RateLimitService = Depends(),
):
    # Check rate limit
    workspace_id = workspace_access["workspace_id"]
    result = await rate_limiter.check_rate_limit(
        identifier=str(workspace_id),
        limit_type=RateLimitType.FACE_SEARCH,
    )
    if not result.allowed:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(result.retry_after)},
        )
    # ... proceed with search
```

**Traefik configuration:**
```yaml
# In dynamic.yaml
middlewares:
  rate-limit-face:
    rateLimit:
      average: 20
      burst: 40
      period: 1s
      sourceCriterion:
        requestHeaderName: X-Workspace-ID
```

---

### 4. Implement COM-001 (Biometric Consent)

**Higher complexity, requires database migration.**

**Step 1: Create migration**
```bash
cd backend
alembic revision -m "add_workspace_biometric_settings"
```

**Migration content:**
```python
# In migration file
def upgrade():
    op.create_table(
        'workspace_biometric_settings',
        sa.Column('workspace_id', sa.UUID(), primary_key=True),
        sa.Column('face_detection_enabled', sa.Boolean(), default=False),
        sa.Column('consent_required', sa.Boolean(), default=True),
        sa.Column('consent_version', sa.String(20), default='1.0.0'),
        sa.Column('consent_document_url', sa.Text(), nullable=True),
        sa.Column('auto_detect_on_upload', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id']),
    )
```

**Step 2: Create model**
```python
# backend/src/app/models/workspace_biometric_settings.py
from sqlalchemy import Column, UUID, Boolean, String, Text, DateTime, ForeignKey
from app.db.base import Base

class WorkspaceBiometricSettings(Base):
    __tablename__ = "workspace_biometric_settings"

    workspace_id = Column(UUID, ForeignKey("workspaces.workspace_id"), primary_key=True)
    face_detection_enabled = Column(Boolean, default=False)
    consent_required = Column(Boolean, default=True)
    consent_version = Column(String(20), default="1.0.0")
    consent_document_url = Column(Text, nullable=True)
    auto_detect_on_upload = Column(Boolean, default=False)
```

**Step 3: Create service**
```python
# backend/src/app/services/biometric_consent_service.py
class BiometricConsentService:
    async def check_consent_required(self, workspace_id: UUID, user_id: UUID) -> bool:
        """Check if user has required consent for face operations."""
        settings = await self.get_workspace_settings(workspace_id)
        if not settings.consent_required:
            return True  # Consent not required

        consent = await self.get_active_consent(workspace_id, user_id)
        return consent is not None and consent.status == "active"

    async def block_if_no_consent(self, workspace_id: UUID, user_id: UUID):
        """Raise error if consent is required but not granted."""
        if not await self.check_consent_required(workspace_id, user_id):
            raise ConsentRequiredError(
                "Biometric consent required. Please grant consent in workspace settings."
            )
```

**Step 4: Add consent check to face detection**
```python
# In face_detection_service.py
async def process_photo(self, workspace_id: UUID, user_id: UUID, ...):
    # Check consent before processing
    await self.consent_service.block_if_no_consent(workspace_id, user_id)

    # Proceed with detection...
```

---

### 5. Implement COM-002 (Retention Policy)

**Requires scheduled worker, medium complexity.**

**Step 1: Add fields to privacy settings**
```python
# Migration
op.add_column('workspace_privacy_settings',
    sa.Column('face_embedding_retention_days', sa.Integer(), default=2555)
)
```

**Step 2: Create retention worker**
```python
# backend/src/app/workers/face_retention_worker.py
from celery import shared_task

@shared_task
def cleanup_expired_embeddings():
    """Nightly job to delete embeddings past retention period."""
    workspaces = get_all_workspaces()

    for workspace in workspaces:
        settings = get_privacy_settings(workspace.id)
        retention_days = settings.face_embedding_retention_days

        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        # Find and delete expired faces (batch processing)
        deleted = delete_faces_older_than(workspace.id, cutoff_date)

        # Log for audit
        audit_service.log_event(
            event_type=AuditEventType.FACE_RETENTION_CLEANUP_COMPLETED,
            workspace_id=workspace.id,
            details={"faces_deleted": deleted, "cutoff_date": cutoff_date.isoformat()},
        )
```

**Step 3: Schedule in Celery beat**
```python
# In celeryconfig.py
beat_schedule = {
    'face-retention-cleanup': {
        'task': 'app.workers.face_retention_worker.cleanup_expired_embeddings',
        'schedule': crontab(hour=3, minute=0),  # 3 AM UTC daily
    },
}
```

---

## Testing Checklist

### SEC-002 (Error Messages)
- [ ] Face not found returns generic message
- [ ] Group not found returns generic message
- [ ] Cross-workspace access returns generic message
- [ ] Correlation ID present for debugging

### PERF-001 (Caching)
- [ ] Face groups cached on first request
- [ ] Subsequent requests served from cache
- [ ] Cache invalidated on group mutation
- [ ] TTL expires after 2 minutes

### SEC-001 (Rate Limiting)
- [ ] Face search limited to 20/min
- [ ] Detection limited to 1000/day
- [ ] 429 response includes Retry-After header
- [ ] Different workspaces have independent limits

### COM-001 (Consent)
- [ ] Detection blocked without consent
- [ ] Consent can be granted via API
- [ ] Consent can be withdrawn
- [ ] Withdrawal schedules embedding deletion
- [ ] Audit log captures consent events

### COM-002 (Retention)
- [ ] Retention period configurable per workspace
- [ ] Nightly job runs successfully
- [ ] Embeddings deleted after retention period
- [ ] Audit log captures deletions

---

## Common Pitfalls

1. **Forgetting cache invalidation** - Every mutation to face groups must invalidate cache
2. **Rate limit key collision** - Use `workspace_id` not `user_id` for workspace-scoped limits
3. **Consent check location** - Check at service layer, not API layer, to catch all paths
4. **Retention batch size** - Process deletions in batches (1000) to avoid timeouts
5. **Error message leakage** - Review ALL HTTPException raises, not just 404s

---

## References

- [Feature Spec](./spec.md)
- [Research](./research.md)
- [Data Model](./data-model.md)
- [API Contracts](./contracts/)
- [Audit Document](../../docs/audits/FACEID_SERVICE_AUDIT_2026-01-21.md)
