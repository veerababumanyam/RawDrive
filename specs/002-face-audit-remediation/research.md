# Research: Face Detection Audit Remediation

**Feature**: `002-face-audit-remediation`
**Date**: 2026-01-21
**Status**: Complete

## Research Summary

This document consolidates research findings for implementing the audit remediation requirements: biometric consent tracking (COM-001), rate limiting (SEC-001), generic error messages (SEC-002), data retention policy (COM-002), and face group caching (PERF-001).

---

## 1. Biometric Consent Tracking (COM-001)

### Decision: Extend Existing Consent Infrastructure

**Rationale**: RawDrive has a comprehensive consent tracking system in `user_consents` table that already handles GDPR-compliant consent with full audit trails.

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| New standalone table | Duplicates existing patterns, inconsistent with codebase |
| Workspace settings only | Lacks per-user consent tracking required by GDPR Art. 9 |
| Frontend-only consent | No audit trail, not compliant |

### Existing Patterns to Reuse

**Consent Model** (`backend/migrations/versions/0099_user_consents.py`):
- `consent_type`: Add `biometric_processing`, `face_detection`, `face_recognition`
- Full audit trail: `ip_address`, `user_agent`, `country_code`, `capture_method`
- Withdrawal tracking: `withdrawn_at`, `withdrawal_reason`, `withdrawal_ip_address`
- Version tracking: `document_version`, `document_hash`

**Workspace Settings Pattern** (`backend/src/app/models/workspace_*_settings.py`):
- Add `WorkspaceBiometricSettings` model following existing patterns
- Fields: `biometric_enabled`, `face_detection_enabled`, `consent_required`

**Audit Service** (`backend/src/app/services/audit_service.py`):
- Add new event types: `BIOMETRIC_CONSENT_GRANTED`, `BIOMETRIC_CONSENT_WITHDRAWN`
- Use existing `log_event()` method with workspace context

### Key Files
- `backend/src/app/models/workspace.py` (extend)
- `backend/src/app/services/audit_service.py` (add event types)
- `backend/migrations/versions/0099_user_consents.py` (reference pattern)
- `frontend/src/pages/workspace/settings/WorkspaceSettingsHub.tsx` (add tab)

---

## 2. Rate Limiting for Face Operations (SEC-001)

### Decision: Multi-Layer Rate Limiting (Traefik + FastAPI Middleware)

**Rationale**: RawDrive uses a proven multi-layer approach with Traefik for gateway-level limits and FastAPI middleware for fine-grained per-endpoint limits.

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Traefik only | Cannot do per-workspace/user limits |
| FastAPI only | Missing gateway-level DDoS protection |
| Custom rate limiter | Reinvents existing patterns |

### Existing Patterns to Reuse

**Traefik Configuration** (`infrastructure/docker/traefik/dynamic.yaml`):
```yaml
rate-limit-ai:
  rateLimit:
    average: 5
    burst: 10
    period: 1s
```
- Add `rate-limit-face` middleware with similar config

**FastAPI Rate Limiter** (`services/gallery-service/src/middleware/rate_limiter.py`):
- Already has face-search limit: `"/api/v1/public/galleries/*/face-search": "20/minute"`
- Uses sliding window algorithm with Redis sorted sets
- Client identification: user ID → visitor ID → IP address

**Rate Limit Service** (`backend/src/app/services/rate_limit_service.py`):
- Add `FACE_SEARCH`, `FACE_DETECT` to `RateLimitType` enum
- Configure limits: `FACE_SEARCH: (20, 60)`, `FACE_DETECT: (1000, 86400)`

### Recommended Limits
| Operation | Limit | Window | Identifier |
|-----------|-------|--------|------------|
| Face similarity search | 20 req | 1 minute | workspace_id |
| Face detection trigger | 1000 req | 1 day | workspace_id |
| Bulk face assign | 30 req | 1 minute | user_id |
| Face group merge | 10 req | 1 minute | user_id |

### Key Files
- `infrastructure/docker/traefik/dynamic.yaml` (add middleware)
- `backend/src/app/services/rate_limit_service.py` (add types)
- `backend/src/app/middleware/rate_limit.py` (extend)

---

## 3. Generic Error Messages (SEC-002)

### Decision: Modify Exception Handlers to Obfuscate IDs

**Rationale**: Current error messages expose face IDs and workspace IDs. The existing error handler architecture supports message transformation without changing business logic.

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Change all raise sites | Too many locations (50+), error-prone |
| Remove IDs from exceptions | Breaks logging and debugging |
| HTTP 403 for everything | Hides useful error codes |

### Current Pattern (UNSAFE)
```python
# faces.py:177-180
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=f"Face {face_id} not found",  # Exposes face_id
)
```

### Target Pattern (SAFE)
```python
# Keep internal exception with ID for logging
raise FaceNotFoundError(face_id=face_id)  # ID logged internally

# Error handler transforms to generic message
{
    "error": {
        "code": "RESOURCE_NOT_FOUND",
        "message": "The requested resource was not found.",
        "correlation_id": "uuid-for-support"
    }
}
```

### Implementation Approach
1. Modify `face_error_handler.py` to sanitize messages before response
2. Keep IDs in structured logging (correlation_id enables debugging)
3. Use consistent error codes without revealing resource existence

### Key Files
- `backend/src/app/middleware/face_error_handler.py` (modify)
- `backend/src/app/services/face_exceptions.py` (keep IDs internal)
- `backend/src/app/api/v1/faces.py` (review raise sites)
- `backend/src/app/api/v1/face_groups.py` (review raise sites)

---

## 4. Data Retention Policy (COM-002)

### Decision: Scheduled Celery Worker + Workspace Configuration

**Rationale**: RawDrive uses Celery for background jobs and has workspace-level settings patterns. Retention can follow the existing `data_retention_days` pattern in `WorkspacePrivacySettings`.

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Database triggers | Complex, hard to audit |
| Real-time deletion | Performance impact on writes |
| External cron job | Outside RawDrive architecture |

### Existing Patterns to Reuse

**Workspace Privacy Settings** (`backend/src/app/models/workspace_privacy_settings.py`):
- `data_retention_days`: Already exists for general data
- Add `face_embedding_retention_days` field

**Compliance Models** (`backend/src/app/models/compliance.py`):
- `RetentionPolicy` class with execution tracking
- Supports exemptions and legal holds

**Cascade Delete Service** (`backend/src/app/services/face_cascade_delete_service.py`):
- Existing service for workspace data deletion
- Extend for retention-based cleanup

### Retention Cleanup Flow
1. Celery beat schedules nightly `cleanup_expired_embeddings` task
2. Query faces where `created_at < (now - retention_days)`
3. Filter out faces under legal hold
4. Batch delete with audit logging
5. Update workspace statistics

### Key Files
- `backend/src/app/models/workspace_privacy_settings.py` (extend)
- `backend/src/app/services/face_cascade_delete_service.py` (extend)
- `backend/src/app/workers/` (add retention worker)
- `backend/src/app/services/audit_service.py` (add event types)

---

## 5. Face Group Query Caching (PERF-001)

### Decision: Redis Caching with Pattern-Based Invalidation

**Rationale**: RawDrive has established Redis caching patterns in gallery-service with decorator-based caching and pattern deletion for invalidation.

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| In-memory cache | Not shared across instances |
| Database materialized views | Complex to invalidate |
| CDN edge caching | Requires public endpoints |

### Existing Patterns to Reuse

**Cache Decorator** (`services/gallery-service/src/cache/redis_client.py`):
```python
@cache_response(key_template="gallery:{gallery_id}", ttl=300)
async def get_gallery(gallery_id: str) -> GalleryData:
    pass
```

**Cache Invalidation Pattern**:
```python
await redis_client.delete_pattern(f"face_groups:{workspace_id}:*")
```

### Cache Key Design
| Cache | Key Pattern | TTL | Invalidate On |
|-------|-------------|-----|---------------|
| Face groups list | `face_groups:{workspace_id}:{gallery_id}:{page}:{limit}` | 2 min | Group CRUD |
| Face group detail | `face_group:{group_id}` | 2 min | Group update |
| Face group stats | `face_group_stats:{workspace_id}:{gallery_id}` | 2 min | Any face change |
| Merge suggestions | `face_merge_suggestions:{workspace_id}` | 5 min | Merge/split ops |

### Invalidation Events
- `POST /face-groups` → Delete `face_groups:{workspace_id}:*`
- `PUT /face-groups/{id}` → Delete `face_group:{id}`, `face_groups:{workspace_id}:*`
- `POST /face-groups/merge` → Delete all face group caches for workspace
- Face assignment → Delete `face_group_stats:{workspace_id}:*`

### Key Files
- `backend/src/app/db/redis.py` (existing client)
- `backend/src/app/repositories/face_group_repository.py` (add caching)
- `backend/src/app/api/v1/face_groups.py` (add invalidation)

---

## 6. Technical Dependencies

### Required Infrastructure
| Component | Version | Status | Notes |
|-----------|---------|--------|-------|
| Redis | 7.x | Available | Used throughout platform |
| PostgreSQL | 16 | Available | With pgvector extension |
| Celery | 5.x | Available | Background workers |
| Traefik | v3 | Available | Gateway |

### Shared Packages
| Package | Usage |
|---------|-------|
| `@rawdrive/shared-types` | Extend with consent types |
| `@rawdrive/shared-constants` | Add rate limit constants |

### Database Migrations Required
1. Add `face_detection_consent` column to workspace settings
2. Add `face_embedding_retention_days` column to privacy settings
3. No new tables needed (reuse existing consent infrastructure)

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Consent flow disrupts existing users | Medium | High | Grandfather existing workspaces with implicit consent |
| Rate limits too restrictive | Medium | Medium | Start with lenient limits, monitor and adjust |
| Cache invalidation misses | Low | Medium | Conservative TTL (2 min) limits stale data impact |
| Retention job timeout | Low | High | Batch processing with checkpoints |

---

## 8. References

### Audit Document
- `docs/audits/FACEID_SERVICE_AUDIT_2026-01-21.md`

### Key Codebase Files
| Category | Files |
|----------|-------|
| Face APIs | `backend/src/app/api/v1/faces.py`, `face_groups.py` |
| Face Services | `backend/src/app/services/face_*.py` (8 files) |
| Face Repositories | `backend/src/app/repositories/face_*.py` (3 files) |
| Consent Model | `backend/migrations/versions/0099_user_consents.py` |
| Audit Service | `backend/src/app/services/audit_service.py` |
| Rate Limiting | `backend/src/app/services/rate_limit_service.py` |
| Error Handler | `backend/src/app/middleware/face_error_handler.py` |
| Redis Client | `backend/src/app/db/redis.py` |
| Traefik Config | `infrastructure/docker/traefik/dynamic.yaml` |

### RawDrive Best Practices
- `.claude/reference/security-best-practices.md`
- `.claude/reference/coding-standards.md`
- `.claude/reference/postgresql-best-practices.md`
