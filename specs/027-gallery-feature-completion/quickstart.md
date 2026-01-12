# Quickstart: Gallery Feature Completion

**Feature Branch**: `027-gallery-feature-completion`
**Created**: 2026-01-10

---

## Prerequisites

1. **RawDrive dev environment running** (Docker Compose)
2. **PostgreSQL migrations up to 0159** applied
3. **Redis** running for quota tracking

```bash
# Verify prerequisites
docker ps | grep rawdrive
curl http://localhost:8000/health/live
curl http://localhost:6379/ping  # Redis
```

---

## Quick Implementation Guide

### Step 1: Run Database Migration

```bash
# Create the migration file
docker exec rawdrive-backend alembic revision -m "gallery_feature_completion" --autogenerate

# Apply migration
docker exec rawdrive-backend alembic upgrade head
```

**Migration adds:**
- `galleries.daily_download_limit` (Integer, nullable)
- `galleries.audio_url` (String, 512 chars)
- `galleries.high_contrast_enabled` (Boolean)
- `magic_links.utm_params` (JSONB)
- `sub_galleries.parent_sub_gallery_id` (UUID FK)
- `sub_galleries.depth` (Integer, max 2)
- New table: `gallery_password_resets`

### Step 2: Backend API Endpoints

Add these endpoints to `backend/src/app/api/v1/public_galleries.py`:

```python
# Per-photo access code verification
@router.post("/galleries/{gallery_id}/assets/{asset_id}/verify-code")
async def verify_access_code(gallery_id: UUID, asset_id: UUID, body: VerifyCodeRequest):
    # Rate limited: 3 attempts per 5 minutes per IP
    pass

# Password reset request
@router.post("/galleries/{gallery_id}/password-reset/request")
async def request_password_reset(gallery_id: UUID, body: PasswordResetRequest):
    # Rate limited: 3 requests per hour per email
    pass

# Password reset verification
@router.post("/galleries/{gallery_id}/password-reset/verify")
async def verify_password_reset(gallery_id: UUID, body: VerifyResetRequest):
    pass
```

Add to `backend/src/app/api/v1/galleries.py`:

```python
# Daily download limit
@router.put("/galleries/{gallery_id}/download-limit")
async def set_download_limit(gallery_id: UUID, body: DownloadLimitRequest):
    # Requires gallery ownership
    pass

# Access code management
@router.put("/galleries/{gallery_id}/assets/{asset_id}/access-code")
async def set_access_code(gallery_id: UUID, asset_id: UUID, body: AccessCodeRequest):
    pass

@router.delete("/galleries/{gallery_id}/assets/{asset_id}/access-code")
async def remove_access_code(gallery_id: UUID, asset_id: UUID):
    pass
```

### Step 3: Redis Quota Tracking

Create `backend/src/app/services/download_quota_service.py`:

```python
from datetime import datetime, timezone

class DownloadQuotaService:
    def __init__(self, redis_client):
        self.redis = redis_client

    async def check_and_increment(
        self,
        gallery_id: str,
        client_id: str,
        limit: int
    ) -> tuple[bool, int]:
        """Returns (allowed, remaining)"""
        date_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        key = f"download_quota:{gallery_id}:{client_id}:{date_utc}"

        current = await self.redis.incr(key)
        if current == 1:
            # First download today - set TTL to midnight UTC
            await self.redis.expireat(key, self._next_midnight_utc())

        if current > limit:
            await self.redis.decr(key)  # Rollback
            return False, 0

        return True, limit - current
```

### Step 4: Frontend Components

Create these components in `frontend/src/components/features/gallery/`:

1. **SkipLinks.tsx** - Accessibility skip navigation
2. **Breadcrumbs.tsx** - Nested folder navigation
3. **AccessCodeModal.tsx** - Per-photo code entry
4. **PasswordResetModal.tsx** - Forgot password flow
5. **HighContrastToggle.tsx** - Accessibility theme switch

### Step 5: CSS Updates

Add to `frontend/src/index.css`:

```css
/* High Contrast Theme */
:root.high-contrast {
  --hc-background: #000000;
  --hc-text-primary: #ffffff;
  --hc-focus-ring: #00ffff;
}

/* RTL Support - use logical properties */
.gallery-nav {
  margin-inline-start: 1rem;  /* was: margin-left */
  padding-inline-end: 0.5rem; /* was: padding-right */
}

/* Skip Links */
.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  left: 0;
  z-index: 9999;
}
```

---

## Testing Checklist

### Unit Tests

```bash
# Backend
docker exec rawdrive-backend pytest tests/services/test_download_quota.py -v
docker exec rawdrive-backend pytest tests/api/test_access_codes.py -v

# Frontend
cd frontend && pnpm test -- AccessCodeModal
cd frontend && pnpm test -- Breadcrumbs
```

### Integration Tests

```bash
# Test download limits
curl -X PUT http://localhost:8000/api/v1/galleries/{id}/download-limit \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"limit": 5}'

# Verify limit enforcement after 5 downloads
curl -X POST http://localhost:8000/api/v1/public/galleries/{id}/downloads/{asset_id}
# Should return 429 after limit
```

### Manual Verification

- [ ] High contrast mode applies correctly
- [ ] Skip links appear on Tab press
- [ ] Breadcrumbs navigate nested sub-galleries
- [ ] Access code modal validates input
- [ ] Download counter shows remaining
- [ ] Password reset email arrives
- [ ] UTM params appear in share URLs

---

## Feature Priority Order

Implement in this order for incremental value:

1. **P1 (Critical UX)**: Per-photo access codes, daily download limits
2. **P2 (Accessibility)**: High contrast mode, skip links
3. **P3 (Enhanced)**: Nested sub-galleries, breadcrumbs, UTM tracking
4. **P4 (Polish)**: Slideshow audio, password reset, RTL refinements

---

## Common Issues

### Redis connection errors
```bash
# Check Redis is running
docker exec rawdrive-redis redis-cli ping
# Should return PONG
```

### Migration conflicts
```bash
# Check current revision
docker exec rawdrive-backend alembic current

# If conflicts, merge heads
docker exec rawdrive-backend alembic merge heads
```

### High contrast not applying
- Verify `document.documentElement.classList.add('high-contrast')`
- Check CSS custom properties are defined in `:root.high-contrast`

---

## API Contract References

See `specs/027-gallery-feature-completion/contracts/` for full OpenAPI specs:

- [access-codes.yaml](contracts/access-codes.yaml) - Per-photo protection
- [download-limits.yaml](contracts/download-limits.yaml) - Quota management
- [password-reset.yaml](contracts/password-reset.yaml) - Recovery flow
- [magic-links.yaml](contracts/magic-links.yaml) - UTM tracking

---

## Next Steps

After implementation:
1. Run full test suite: `pnpm test && docker exec rawdrive-backend pytest`
2. Update `docs/Features/GALLERY_REQUIREMENTS_ANALYSIS.md` status
3. Create PR for review
