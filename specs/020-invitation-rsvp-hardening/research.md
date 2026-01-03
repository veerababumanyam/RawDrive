# Research Findings: Invitation RSVP System Hardening

**Feature**: 020-invitation-rsvp-hardening
**Date**: 2026-01-03
**Status**: Complete

## Executive Summary

This document consolidates research findings for implementing security fixes and missing features in the Invitation RSVP system. All technical decisions have been resolved based on existing codebase patterns and best practices.

---

## 1. Workspace Isolation Fix

### Decision
Remove dangerous alias methods from `rsvp_repository.py` and enforce `workspace_id` parameter in all data access methods.

### Rationale
- The `delete()` alias method (lines 887-889) bypasses workspace isolation by not requiring `workspace_id`
- This violates CLAUDE.md's critical multi-tenant data isolation rule
- Similar pattern exists in the microservice `_get_guest_record` method (rsvp_service.py:449-461)

### Implementation Approach
1. **Remove alias methods**: Delete `delete()`, `update()` aliases that don't require `workspace_id`
2. **Fix microservice method**: Add `workspace_id` parameter to `_get_guest_record` query
3. **Add type safety**: Use Python type hints to enforce required parameters

### Alternatives Considered
| Alternative | Rejected Because |
|------------|------------------|
| Keep aliases but add validation | Still allows calling pattern that appears safe but isn't |
| Add workspace_id as optional | Default values can be forgotten in caller code |

### Code Pattern
```python
# BEFORE (dangerous)
async def delete(self, rsvp_id: UUID):
    return await self.delete_rsvp(rsvp_id)

# AFTER (safe - remove alias entirely, use only the workspace-scoped method)
async def delete_rsvp(self, workspace_id: UUID, rsvp_id: UUID) -> bool:
    """Delete RSVP. Always requires workspace_id for tenant isolation."""
    ...
```

---

## 2. Duplicate RSVP Prevention

### Decision
Add database unique constraint on `(invitation_id, guest_email)` combined with application-level check.

### Rationale
- Race condition exists in current implementation (invitation_rsvp_service.py:131-140)
- Two concurrent requests can both pass `find_by_email` check before either creates record
- Database constraint provides atomic guarantee
- Application check provides user-friendly error message

### Implementation Approach
1. **Database migration**: Add unique constraint (idempotent with `IF NOT EXISTS`)
2. **Handle existing duplicates**: First run cleanup query to remove any existing duplicates
3. **Application error handling**: Catch unique constraint violation and return friendly message

### Migration Strategy
```sql
-- Step 1: Identify duplicates (run first to assess impact)
SELECT invitation_id, guest_email, COUNT(*)
FROM invitation_rsvps
GROUP BY invitation_id, guest_email
HAVING COUNT(*) > 1;

-- Step 2: Remove duplicates keeping oldest (manual review recommended)
DELETE FROM invitation_rsvps a USING (
  SELECT MIN(rsvp_id) as keep_id, invitation_id, guest_email
  FROM invitation_rsvps
  GROUP BY invitation_id, guest_email
  HAVING COUNT(*) > 1
) b
WHERE a.invitation_id = b.invitation_id
  AND a.guest_email = b.guest_email
  AND a.rsvp_id != b.keep_id;

-- Step 3: Add constraint
ALTER TABLE invitation_rsvps
ADD CONSTRAINT uq_invitation_guest_email
UNIQUE (invitation_id, guest_email);
```

### Alternatives Considered
| Alternative | Rejected Because |
|------------|------------------|
| Application-level locking only | Redis distributed lock adds complexity, still has edge cases |
| SELECT FOR UPDATE | Requires long-running transaction, potential deadlocks |
| Optimistic locking with version | Requires schema change, doesn't prevent first duplicate |

---

## 3. PII Removal from Logs

### Decision
Replace email addresses with RSVP IDs in all log statements following existing SOC 2 patterns.

### Rationale
- Current code logs `email: data.guest_email` (invitation_rsvp_service.py:189-192)
- CLAUDE.md explicitly prohibits logging PII
- SOC 2 compliance requires PII filtering

### Implementation Approach
1. **Replace email with rsvp_id**: Log identifiers only
2. **Add correlation IDs**: Use existing request ID pattern for tracing
3. **Audit log separately**: PII can go to audit service (designed for compliance)

### Code Pattern
```python
# BEFORE (SOC 2 violation)
logger.info(
    "RSVP confirmation email queued",
    extra={"rsvp_id": str(rsvp_id), "email": data.guest_email}
)

# AFTER (compliant)
logger.info(
    "RSVP confirmation email queued",
    extra={"rsvp_id": str(rsvp_id), "invitation_id": str(invitation_id)}
)
```

---

## 4. Audit Logging Implementation

### Decision
Extend existing `AuditService` with RSVP-specific event types and integrate into RSVP service methods.

### Rationale
- AuditService already exists with Loki backend (zero-latency async)
- 50+ event types already defined
- Pattern established for workspace-scoped audit logging

### Event Types to Add
```python
class AuditEventType(str, Enum):
    # Invitation Events (new)
    INVITATION_CREATED = "invitation.created"
    INVITATION_PUBLISHED = "invitation.published"
    INVITATION_ARCHIVED = "invitation.archived"
    INVITATION_DELETED = "invitation.deleted"

    # RSVP Events (new)
    RSVP_SUBMITTED = "rsvp.submitted"
    RSVP_UPDATED = "rsvp.updated"
    RSVP_DELETED = "rsvp.deleted"
    RSVP_EDIT_TOKEN_USED = "rsvp.edit_token_used"
    RSVP_EDIT_TOKEN_INVALID = "rsvp.edit_token_invalid"
    RSVP_EXPORTED = "rsvp.exported"
```

### Integration Points
| Location | Event | Data |
|----------|-------|------|
| `invitation_rsvp_service.submit_rsvp()` | RSVP_SUBMITTED | invitation_id, rsvp_id |
| `invitation_rsvp_service.update_rsvp_by_token()` | RSVP_UPDATED | invitation_id, rsvp_id, changed_fields |
| `invitation_rsvp_service.delete_rsvp()` | RSVP_DELETED | invitation_id, rsvp_id, deleted_by |
| Token validation | RSVP_EDIT_TOKEN_USED/INVALID | invitation_id, token_hash |
| Export endpoints | RSVP_EXPORTED | invitation_id, format, count |

---

## 5. Email Service Implementation

### Decision
Use existing `TaskQueue` infrastructure with SendGrid integration for email delivery.

### Rationale
- TaskQueue already handles background jobs with retry logic
- SendGrid integration exists via notification templates
- Non-blocking pattern ensures RSVP submission isn't delayed by email

### Implementation Approach

**Task Types** (already defined in codebase):
- `send_rsvp_confirmation` - Guest confirmation with edit link
- `send_rsvp_host_notification` - Host immediate notification
- `queue_rsvp_for_digest` - Host daily digest batching

**Auto-Deletion Warning** (new implementation needed):
```python
# In invitation_auto_deletion_service.py
async def send_deletion_warning(invitation_id: UUID, days_until_deletion: int):
    """Send warning emails to all RSVPs for an invitation."""
    rsvps = await rsvp_repo.list_by_invitation(invitation_id)

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
```

### Email Templates Required
| Template | Trigger | Content |
|----------|---------|---------|
| `rsvp_confirmation` | RSVP submitted | Thank you, edit link, event details |
| `deletion_warning_7day` | 7 days before auto-delete | Warning, event details, action required |
| `deletion_warning_24hr` | 24 hours before auto-delete | Urgent warning, final reminder |

---

## 6. PDF Export Implementation

### Decision
Server-side PDF generation using WeasyPrint (Python) with existing export endpoint pattern.

### Rationale
- WeasyPrint is already a backend dependency
- Server-side generation ensures consistent formatting
- Follows existing CSV export pattern

### Implementation Approach
```python
# In invitation_exports.py
@router.get("/workspaces/{workspace_id}/invitations/{invitation_id}/rsvps/export/pdf")
async def export_rsvps_pdf(
    workspace_id: UUID,
    invitation_id: UUID,
    current_user: User = Depends(get_current_user)
):
    """Export RSVPs as formatted PDF."""
    # 1. Verify workspace access
    # 2. Fetch RSVPs with pagination (all)
    # 3. Render HTML template with data
    # 4. Convert to PDF via WeasyPrint
    # 5. Return as file download
```

### Template Structure
```html
<!DOCTYPE html>
<html>
<head>
    <style>
        /* Print-friendly styles */
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f4f4f4; }
        .header { margin-bottom: 20px; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{ invitation.title }} - Guest List</h1>
        <p>Generated: {{ now }}</p>
    </div>
    <div class="stats">
        <div>Total: {{ stats.total }}</div>
        <div>Confirmed: {{ stats.confirmed }}</div>
        <div>Declined: {{ stats.declined }}</div>
    </div>
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Party Size</th>
                <th>Response Date</th>
            </tr>
        </thead>
        <tbody>
            {% for rsvp in rsvps %}
            <tr>
                <td>{{ rsvp.guest_name }}</td>
                <td>{{ rsvp.guest_email }}</td>
                <td>{{ rsvp.status }}</td>
                <td>{{ rsvp.party_size }}</td>
                <td>{{ rsvp.created_at | dateformat }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>
</body>
</html>
```

### Alternatives Considered
| Alternative | Rejected Because |
|------------|------------------|
| Client-side PDF (jsPDF) | Inconsistent formatting, large bundle size |
| Puppeteer/Playwright | Heavy dependencies, complex setup |
| ReportLab | Less HTML template friendly, steeper learning curve |

---

## 7. Error Boundary Implementation

### Decision
Create `InvitationErrorBoundary` component wrapping RSVPDashboard following existing patterns.

### Rationale
- CLAUDE.md requires error boundaries for major sections
- Existing `ErrorBoundary` component pattern in codebase
- Prevents full page crash on component errors

### Implementation Pattern
```tsx
// InvitationErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import { AppButton } from '@/components/ui/AppButton';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class InvitationErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to monitoring service (no PII)
    console.error('InvitationErrorBoundary caught error:', {
      error: error.message,
      componentStack: errorInfo.componentStack
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center p-8 text-center"
        >
          <AlertTriangle className="h-12 w-12 text-warning mb-4" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Something went wrong
          </h2>
          <p className="text-text-secondary mb-4">
            We encountered an error loading this content.
          </p>
          <AppButton onClick={this.handleRetry}>
            Try Again
          </AppButton>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## 8. View Tracking Index

### Decision
Add compound index on `(invitation_id, visitor_hash, viewed_at DESC)` for view deduplication.

### Rationale
- Current query (view_service.py:209-219) lacks efficient index
- View deduplication query runs frequently (every page view)
- Index supports the exact WHERE clause pattern

### Migration
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS
idx_invitation_views_dedup
ON invitation_views (invitation_id, visitor_hash, viewed_at DESC);
```

---

## Summary of Decisions

| Area | Decision | Confidence |
|------|----------|------------|
| Workspace Isolation | Remove alias methods, enforce workspace_id | High |
| Duplicate Prevention | Database unique constraint + app check | High |
| PII Logging | Replace email with rsvp_id in logs | High |
| Audit Logging | Extend AuditService with RSVP events | High |
| Email Service | Use TaskQueue + SendGrid | High |
| PDF Export | Server-side WeasyPrint | Medium |
| Error Boundary | Class component pattern | High |
| View Index | Compound index on dedup columns | High |

All decisions align with existing codebase patterns and RawDrive Constitution requirements.
