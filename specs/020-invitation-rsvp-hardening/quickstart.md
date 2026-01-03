# Quickstart: Invitation RSVP System Hardening

**Feature**: 020-invitation-rsvp-hardening
**Date**: 2026-01-03

## Prerequisites

Before starting development on this feature, ensure you have:

- [x] Docker running (`npm run docker:dev:up`)
- [x] Backend environment configured (`.env` file)
- [x] Frontend dependencies installed (`cd frontend && npm install`)
- [x] Backend dependencies installed (`cd backend && pip install -r requirements.txt`)
- [x] Database migrations up to date (`cd backend && alembic upgrade head`)

## Quick Setup

```bash
# 1. Switch to feature branch
git checkout 020-invitation-rsvp-hardening

# 2. Start development environment
npm run docker:dev:up
npm run dev:all

# 3. Run existing tests to establish baseline
cd backend && pytest tests/unit/services/test_invitation_rsvp_service.py -v
cd frontend && npm test -- --filter RSVPDashboard
```

## Development Guide

### Phase 1: Security Fixes (Start Here)

**Priority**: Critical - Must complete before other phases

#### 1.1 Fix Repository Workspace Isolation

**File**: `backend/src/app/repositories/rsvp_repository.py`

```python
# REMOVE these dangerous alias methods (lines ~887-889):
async def delete(self, rsvp_id: UUID):
    """REMOVE: Alias without workspace_id."""
    return await self.delete_rsvp(rsvp_id)

async def update(self, rsvp_id: UUID, data: dict):
    """REMOVE: Alias without workspace_id."""
    return await self.update_rsvp(rsvp_id, data)

# KEEP and ensure workspace_id is required:
async def delete_rsvp(self, workspace_id: UUID, rsvp_id: UUID) -> bool:
    """Delete RSVP with workspace isolation."""
    ...

async def update_rsvp(self, workspace_id: UUID, rsvp_id: UUID, data: dict) -> Optional[dict]:
    """Update RSVP with workspace isolation."""
    ...
```

**Test**: `pytest tests/unit/repositories/test_rsvp_repository.py -v`

#### 1.2 Fix Microservice Guest Lookup

**File**: `backend/src/app/services/rsvp_service.py` (lines ~449-461)

```python
# BEFORE (vulnerable):
async def _get_guest_record(self, guest_id: UUID) -> Optional[dict]:
    query = "SELECT * FROM invitation_guests WHERE guest_id = $1::uuid"
    row = await self.pool.fetchrow(query, guest_id)
    ...

# AFTER (secure):
async def _get_guest_record(self, workspace_id: UUID, guest_id: UUID) -> Optional[dict]:
    query = """
        SELECT g.* FROM invitation_guests g
        JOIN digital_invitations i ON g.invitation_id = i.invitation_id
        WHERE g.guest_id = $1::uuid AND i.workspace_id = $2::uuid
    """
    row = await self.pool.fetchrow(query, guest_id, workspace_id)
    ...
```

#### 1.3 Add Database Constraint

**Migration file**: `backend/src/app/db/migrations/20260103_add_rsvp_unique_constraint.sql`

```sql
-- Check for duplicates first (run manually in staging)
SELECT invitation_id, LOWER(guest_email), COUNT(*)
FROM invitation_rsvps
GROUP BY invitation_id, LOWER(guest_email)
HAVING COUNT(*) > 1;

-- Add unique constraint (case-insensitive)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
uq_invitation_rsvps_invitation_email
ON invitation_rsvps (invitation_id, LOWER(guest_email));
```

#### 1.4 Remove PII from Logs

**File**: `backend/src/app/services/invitation_rsvp_service.py`

```python
# BEFORE (lines ~189-192):
logger.info(
    "RSVP confirmation email queued",
    extra={"rsvp_id": str(rsvp_id), "email": data.guest_email}  # PII!
)

# AFTER:
logger.info(
    "RSVP confirmation email queued",
    extra={"rsvp_id": str(rsvp_id), "invitation_id": str(invitation_id)}
)
```

**Search for all PII logging**: `grep -rn "guest_email\|guest_name" backend/src/app/services/ | grep logger`

---

### Phase 2: Audit Logging

**File**: `backend/src/app/services/audit_service.py`

Add new event types to `AuditEventType` enum:

```python
class AuditEventType(str, Enum):
    # ... existing types ...

    # Invitation Events
    INVITATION_CREATED = "invitation.created"
    INVITATION_PUBLISHED = "invitation.published"
    INVITATION_ARCHIVED = "invitation.archived"
    INVITATION_DELETED = "invitation.deleted"

    # RSVP Events
    RSVP_SUBMITTED = "rsvp.submitted"
    RSVP_UPDATED = "rsvp.updated"
    RSVP_DELETED = "rsvp.deleted"
    RSVP_EDIT_TOKEN_USED = "rsvp.edit_token_used"
    RSVP_EDIT_TOKEN_INVALID = "rsvp.edit_token_invalid"
    RSVP_EXPORTED = "rsvp.exported"
```

**Integration in service** (`invitation_rsvp_service.py`):

```python
from app.services.audit_service import get_audit_service, AuditEventType

async def submit_rsvp(...):
    # ... existing logic ...
    rsvp = await self.rsvp_repo.create(rsvp_data)

    # Add audit logging
    await get_audit_service().log_event(
        event_type=AuditEventType.RSVP_SUBMITTED,
        workspace_id=str(workspace_id),
        resource_type="rsvp",
        resource_id=str(rsvp["rsvp_id"]),
        data={"invitation_id": str(invitation_id), "source": data.source}
    )

    return rsvp
```

---

### Phase 3: Email Notifications

**File**: `backend/src/app/services/invitation_auto_deletion_service.py` (line ~441)

```python
# BEFORE (TODO comment):
# TODO: Implement actual email sending via SendGrid/SES/etc.
logger.info("Auto-delete warning email sent", ...)

# AFTER:
from app.services.task_queue import get_task_queue, TaskPriority

async def send_deletion_warning(self, invitation_id: UUID, days_until_deletion: int):
    """Send warning emails to all RSVPs."""
    rsvps = await self.rsvp_repo.list_by_invitation(invitation_id)
    task_queue = get_task_queue()

    for rsvp in rsvps:
        await task_queue.enqueue_task(
            task_type="send_deletion_warning",
            payload={
                "rsvp_id": str(rsvp["rsvp_id"]),
                "invitation_id": str(invitation_id),
                "days_until_deletion": days_until_deletion,
                "guest_email": rsvp["guest_email"],
                "guest_name": rsvp["guest_name"]
            },
            priority=TaskPriority.NORMAL
        )

    logger.info(
        "Auto-delete warning emails queued",
        extra={"invitation_id": str(invitation_id), "count": len(rsvps)}
    )
```

---

### Phase 4: Dashboard Improvements

#### 4.1 Error Boundary

**New file**: `frontend/src/components/ErrorBoundary/InvitationErrorBoundary.tsx`

See [research.md](./research.md#7-error-boundary-implementation) for full implementation.

**Usage in RSVPDashboard**:

```tsx
// RSVPDashboard.tsx
import { InvitationErrorBoundary } from '@/components/ErrorBoundary/InvitationErrorBoundary';

export const RSVPDashboard = () => {
  return (
    <InvitationErrorBoundary onRetry={() => queryClient.invalidateQueries(['rsvps'])}>
      <RSVPDashboardContent />
    </InvitationErrorBoundary>
  );
};
```

#### 4.2 PDF Export

**File**: `frontend/src/components/features/invitations/RSVPExport.tsx`

```tsx
// Replace "coming soon" toast with actual API call
const handleExportPDF = async () => {
  try {
    setIsExporting(true);
    const response = await api.get(
      `/workspaces/${workspaceId}/invitations/${invitationId}/rsvps/export/pdf`,
      { responseType: 'blob' }
    );
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `guest-list-${new Date().toISOString().split('T')[0]}.pdf`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('PDF exported successfully', 'success');
  } catch (error) {
    showToast('Failed to export PDF', 'error');
  } finally {
    setIsExporting(false);
  }
};
```

---

## Testing Checklist

### Security Tests (95% coverage required)

```bash
# Run security-focused tests
cd backend
pytest tests/unit/repositories/test_rsvp_repository.py -v
pytest tests/integration/test_rsvp_workspace_isolation.py -v
pytest tests/unit/services/test_invitation_rsvp_service.py -v --cov=src/app/services/invitation_rsvp_service --cov-fail-under=95
```

### Service Tests (85% coverage required)

```bash
cd backend
pytest tests/unit/services/ -v --cov=src/app/services --cov-fail-under=85
```

### UI Tests (70% coverage required)

```bash
cd frontend
npm test -- --filter RSVPDashboard --coverage
```

---

## Common Issues

### 1. "Duplicate key violates unique constraint"

After adding the unique constraint, you may see this error if duplicates existed.

**Fix**: Run the duplicate cleanup query before deploying:

```sql
DELETE FROM invitation_rsvps a USING (...) -- See data-model.md
```

### 2. "Module not found: AuditEventType"

If you get import errors for new audit types, ensure you've added them to the enum in `audit_service.py`.

### 3. "PDF export returns 500"

Check that WeasyPrint dependencies are installed:

```bash
# macOS
brew install pango cairo

# Ubuntu
apt-get install python3-cffi libpango-1.0-0 libpangocairo-1.0-0
```

---

## Verification Commands

After completing implementation, run these to verify:

```bash
# 1. All tests pass
npm run test:backend
npm run test:frontend

# 2. No PII in logs
grep -rn "guest_email\|guest_name" backend/src/app/services/ | grep -v "# " | grep logger

# 3. Linting passes
npm run lint

# 4. Build succeeds
npm run build
```

---

## Resources

- [Specification](./spec.md)
- [Research Findings](./research.md)
- [Data Model](./data-model.md)
- [API Contracts](./contracts/api-changes.yaml)
- [RawDrive Constitution](../../.specify/memory/constitution.md)
