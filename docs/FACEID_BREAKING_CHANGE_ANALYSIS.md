# FaceID Breaking Change Analysis
# v0.2.x (Working) → v0.3.6 (Broken)

**Date:** 2026-02-08
**Breaking Commit:** `5580a6fe` (Jan 22, 2026)
**Title:** "feat: Face audit remediation and biometric consent features"

---

## Summary

FaceID stopped working because a **biometric consent gate** was added as a GDPR compliance requirement in commit `5580a6fe` on January 22, 2026. This commit added the `require_biometric_consent` dependency to all face-related endpoints.

**Root Cause:** All face endpoints now return **403 Forbidden** until biometric consent is explicitly granted for the workspace.

---

## What Changed

### Before (Working - v0.2.x)

```python
@router.get("/galleries/{gallery_id}/faces")
async def list_gallery_faces(
    gallery_id: Annotated[UUID, Path(...)],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
):
    # Direct access - no consent check
    workspace_id = workspace_access["workspace_id"]
    faces = await face_repo.find_by_gallery_id(...)
```

**Behavior:** Face endpoints worked immediately after authentication ✅

---

### After (Broken - v0.3.6)

```python
from app.services.biometric_consent_service import require_biometric_consent

@router.get("/galleries/{gallery_id}/faces")
async def list_gallery_faces(
    _: None = Depends(require_biometric_consent),  # ← NEW BLOCKER
    gallery_id: Annotated[UUID, Path(...)],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
):
    # This code ONLY runs if consent is granted
    workspace_id = workspace_access["workspace_id"]
    faces = await face_repo.find_by_gallery_id(...)
```

**Behavior:** Returns **403 Forbidden** if consent not granted ❌

---

## Affected Endpoints

The `require_biometric_consent` dependency was added to **10 endpoints** in `faces.py`:

| Line | Endpoint | Method | Purpose |
|------|----------|--------|---------|
| 102 | `/galleries/{gallery_id}/faces` | GET | List faces in gallery |
| 144 | `/photos/{photo_id}/faces` | GET | List faces in photo |
| 179 | `/faces/{face_id}` | GET | Get face details |
| 206 | `/faces/{face_id}/identify` | POST | Assign face to group |
| 247 | `/faces/bulk-assign` | POST | Bulk assign faces |
| 279 | `/photos/{photo_id}/detect-faces` | POST | Trigger detection |
| 312 | `/faces/{face_id}/similar` | GET | Find similar faces |
| 341 | `/workspaces/{workspace_id}/faces/search` | POST | Similar face search |
| 370 | `/workspaces/{workspace_id}/photos/scan-faces` | POST | Scan gallery faces |
| 427 | `/workspaces/{workspace_id}/faces/stats` | GET | Detection stats |

Plus **6 endpoints** in `face_groups.py`:
- `/workspaces/{workspace_id}/face-groups`
- `/workspaces/{workspace_id}/face-groups/cluster-ungrouped`
- `/workspaces/{workspace_id}/face-groups/gallery/{gallery_id}`
- `/workspaces/{workspace_id}/face-groups/{group_id}`
- `/workspaces/{workspace_id}/face-groups/multi-merge`
- `/workspaces/{workspace_id}/face-groups/{group_id}/faces`

---

## Files Added in Breaking Commit

### New Service Files
| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/app/services/biometric_consent_service.py` | GDPR consent management | 795 |
| `backend/src/app/repositories/biometric_settings_repository.py` | Consent settings DB | 658 |
| `backend/src/app/repositories/face_rate_limit_repository.py` | Rate limiting | 579 |
| `backend/src/app/repositories/face_retention_repository.py` | Data retention | 725 |
| `backend/src/app/api/dependencies/face_rate_limit.py` | Rate limit dependency | 333 |
| `backend/src/app/services/face_group_cache_service.py` | Caching layer | 615 |
| `backend/src/app/services/face_retention_service.py` | Retention service | 662 |

### New API Endpoints
| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/app/api/v1/biometric_consent.py` | Consent management API | 560 |
| `backend/src/app/api/v1/face_rate_limits.py` | Rate limit API | 405 |
| `backend/src/app/api/v1/face_retention.py` | Retention API | 479 |

### New Database Tables
| Migration | Table | Purpose |
|-----------|-------|---------|
| `0165_add_biometric_consent_tables.py` | `workspace_biometric_settings` | Consent tracking |
| | `biometric_consent_audit_log` | Audit trail |

### New Frontend Components
| File | Purpose | Lines |
|------|---------|-------|
| `frontend/src/pages/workspace/settings/BiometricSettingsPanel.tsx` | Consent UI | 638 |
| `frontend/src/services/biometricConsentService.ts` | API client | 100 |
| `frontend/src/types/biometricConsent.ts` | TypeScript types | 97 |

---

## New Dependencies Added

### Import in `faces.py` (Line 46)
```python
from app.services.biometric_consent_service import require_biometric_consent
```

### Import in `face_groups.py`
```python
from app.services.biometric_consent_service import require_biometric_consent
from app.api.dependencies.face_rate_limit import (
    check_face_bulk_rate_limit,
    check_face_group_merge_rate_limit,
)
```

---

## The Consent Check Logic

From `biometric_consent_service.py`:

```python
async def require_biometric_consent(
    workspace_id: UUID,
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Verify workspace has granted biometric consent.
    Raises 403 if consent not granted.
    """
    settings = await biometric_settings_repo.get_by_workspace(workspace_id)

    if not settings or settings.consent_status != BiometricConsentStatus.GRANTED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Biometric consent not granted for this workspace",
        )
```

---

## How to Fix (3 Options)

### Option 1: Grant Consent via API (Recommended for GDPR compliance)

```bash
# Step 1: Grant consent
POST /api/v1/workspaces/{workspace_id}/biometric-consent
{
  "policy_version": "1.0",
  "auto_enable_detection": true
}

# Step 2: Trigger face detection
POST /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/scan-faces
```

### Option 2: Direct Database Insert (Quick Fix)

```sql
INSERT INTO workspace_biometric_settings (
    workspace_id,
    consent_status,
    face_detection_enabled,
    policy_version,
    consented_at
) VALUES (
    'your_workspace_id',
    'granted',
    true,
    '1.0',
    NOW()
);
```

### Option 3: Remove Consent Requirement (NOT RECOMMENDED)

⚠️ **Warning:** This violates GDPR Article 9 and should only be done for development/testing.

Edit `backend/src/app/api/v1/faces.py`:
```python
# Remove this line from all 10 endpoints:
_: None = Depends(require_biometric_consent),
```

And `backend/src/app/api/v1/face_groups.py`:
```python
# Remove this line from all 6 endpoints:
_: None = Depends(require_biometric_consent),
```

---

## Configuration Checklist

| Setting | Location | Current Value | Required |
|---------|----------|---------------|----------|
| `workspace_biometric_settings.consent_status` | Database | NULL (blocking) | 'granted' |
| `workspace_biometric_settings.face_detection_enabled` | Database | NULL | true |
| `DISABLE_FACE_WORKER` | `.env` | ? | Should be 'false' or unset |

---

## Timeline

| Date | Event | Status |
|------|-------|--------|
| Before 2025-12-XX | v0.2.x releases | ✅ FaceID working |
| 2026-01-22 | Commit `5580a6fe` merged | ⚠️ Consent gate added |
| 2026-01-22 | v0.3.0-v0.3.6 releases | ❌ FaceID blocked by consent |
| 2026-02-08 | This analysis | 🔍 Root cause identified |

---

## Verification Commands

```bash
# Check if consent was granted for your workspace
docker exec rawdrive-backend psql -U rawdrive -d rawdrive -c \
  "SELECT workspace_id, consent_status, face_detection_enabled, consented_at
   FROM workspace_biometric_settings;"

# Check face worker status
docker exec rawdrive-backend env | grep DISABLE_FACE_WORKER

# Test endpoint (should return 403 without consent)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/face-groups
```

---

## Related Documentation

- **Full Analysis:** `docs/FACEID_DEEP_DIVE_ANALYSIS.md`
- **Breaking Commit:** `git show 5580a6fe`
- **Biometric Consent API:** `backend/src/app/api/v1/biometric_consent.py`
- **Frontend Consent UI:** `frontend/src/pages/workspace/settings/BiometricSettingsPanel.tsx`

---

## Conclusion

The FaceID feature is **properly integrated** and **functionally correct**. It appears broken only because:

1. **GDPR compliance gate was added** (Jan 22, 2026)
2. **Biometric consent must be explicitly granted** (one-time action)
3. **No migration/data seeding was done** for existing workspaces

**Fix:** Grant biometric consent for your workspace, and FaceID will work again.

---

**Generated:** 2026-02-08
**Analysis by:** Claude Code
