# Data Model: Invitation RSVP System Hardening

**Feature**: 020-invitation-rsvp-hardening
**Date**: 2026-01-03
**Status**: Complete

## Overview

This document describes database schema changes required for the Invitation RSVP System Hardening feature. Changes are additive and backward-compatible.

---

## Existing Tables (Reference)

### `invitation_rsvps`

Primary table for guest RSVP responses. **No schema changes required**, only constraint addition.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `rsvp_id` | UUID | NO | Primary key |
| `invitation_id` | UUID | NO | FK to digital_invitations |
| `workspace_id` | UUID | NO | FK to workspaces (tenant isolation) |
| `guest_name` | VARCHAR(255) | NO | Guest display name |
| `guest_email` | VARCHAR(255) | NO | Guest email address |
| `guest_phone` | VARCHAR(50) | YES | Optional phone number |
| `attending` | BOOLEAN | YES | Attendance confirmation |
| `party_size` | INTEGER | NO | Number of guests (default 1) |
| `party_names` | TEXT[] | YES | Names of additional guests |
| `dietary_preferences` | TEXT | YES | Food restrictions |
| `message` | TEXT | YES | Message to hosts |
| `custom_answers` | JSONB | YES | Custom form responses |
| `source` | VARCHAR(50) | NO | web, qr_code, whatsapp, email_link, personal_link |
| `status` | VARCHAR(50) | NO | pending, confirmed, declined, maybe, cancelled |
| `edit_token_hash` | VARCHAR(64) | YES | SHA-256 hash of edit token |
| `token_expires_at` | TIMESTAMP | YES | Token expiration (30 days) |
| `ip_address` | INET | YES | Submitter IP for audit |
| `user_agent` | TEXT | YES | Browser user agent |
| `created_at` | TIMESTAMP | NO | Record creation time |
| `updated_at` | TIMESTAMP | NO | Last modification time |

### `digital_invitations`

Parent table for invitations. **No changes required**.

### `invitation_events`

Existing event tracking table. **No changes required** - audit events go to AuditService/Loki.

### `invitation_views`

View tracking for analytics. **Index addition required**.

---

## Schema Changes

### 1. Unique Constraint on `invitation_rsvps`

**Purpose**: Prevent duplicate RSVP submissions atomically.

```sql
-- Migration: 20260103_add_rsvp_unique_constraint.sql

-- Step 1: Check for existing duplicates (run manually first)
-- SELECT invitation_id, guest_email, COUNT(*) as count
-- FROM invitation_rsvps
-- GROUP BY invitation_id, guest_email
-- HAVING COUNT(*) > 1;

-- Step 2: Remove duplicates if any exist (keep oldest)
DELETE FROM invitation_rsvps a
USING (
    SELECT MIN(rsvp_id) as keep_id, invitation_id, LOWER(guest_email) as email_lower
    FROM invitation_rsvps
    GROUP BY invitation_id, LOWER(guest_email)
    HAVING COUNT(*) > 1
) b
WHERE a.invitation_id = b.invitation_id
  AND LOWER(a.guest_email) = b.email_lower
  AND a.rsvp_id != b.keep_id;

-- Step 3: Add unique constraint (case-insensitive on email)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
uq_invitation_rsvps_invitation_email
ON invitation_rsvps (invitation_id, LOWER(guest_email));

-- Note: Using functional index for case-insensitive matching
```

**Rollback**:
```sql
DROP INDEX IF EXISTS uq_invitation_rsvps_invitation_email;
```

---

### 2. Index on `invitation_views` for Deduplication

**Purpose**: Optimize view deduplication queries.

```sql
-- Migration: 20260103_add_views_dedup_index.sql

CREATE INDEX CONCURRENTLY IF NOT EXISTS
idx_invitation_views_dedup
ON invitation_views (invitation_id, visitor_hash, viewed_at DESC);
```

**Rollback**:
```sql
DROP INDEX IF EXISTS idx_invitation_views_dedup;
```

---

## Audit Event Types

Added to `AuditService` enum (no database schema change - Loki labels).

```python
class AuditEventType(str, Enum):
    # Existing events...

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

---

## Entity Relationships

```
┌──────────────────────┐       ┌──────────────────────┐
│   workspaces         │       │   users              │
│   ──────────────     │       │   ──────────────     │
│   workspace_id (PK)  │◄──────│   workspace_id (FK)  │
└──────────────────────┘       └──────────────────────┘
          │
          │ 1:N
          ▼
┌──────────────────────┐
│  digital_invitations │
│  ──────────────────  │
│  invitation_id (PK)  │
│  workspace_id (FK)   │
│  created_by_user_id  │
│  title, event_type   │
│  status, rsvp_settings│
└──────────────────────┘
          │
          │ 1:N
          ▼
┌──────────────────────┐       ┌──────────────────────┐
│  invitation_rsvps    │       │  invitation_views    │
│  ──────────────────  │       │  ──────────────────  │
│  rsvp_id (PK)        │       │  view_id (PK)        │
│  invitation_id (FK)  │       │  invitation_id (FK)  │
│  workspace_id (FK)   │       │  visitor_hash        │
│  guest_name, email   │       │  viewed_at           │
│  status, party_size  │       │  [NEW INDEX]         │
│  [NEW UNIQUE INDEX]  │       └──────────────────────┘
└──────────────────────┘
```

---

## Validation Rules

### RSVP Submission
| Field | Rule | Error Message |
|-------|------|---------------|
| guest_email | Required, valid email format | "Valid email address required" |
| guest_email | Unique per invitation (case-insensitive) | "You have already RSVP'd to this invitation" |
| guest_name | Required, 1-255 chars, sanitized | "Name is required" |
| party_size | 1-20 (configurable per invitation) | "Party size must be between 1 and {max}" |
| status | Enum: pending, confirmed, declined, maybe | "Invalid RSVP status" |

### Workspace Isolation
| Operation | Rule |
|-----------|------|
| Create RSVP | `invitation.workspace_id` used (not client-provided) |
| Read RSVP | Query must include `workspace_id` from auth context |
| Update RSVP | Verify `rsvp.workspace_id` matches auth context |
| Delete RSVP | Verify `rsvp.workspace_id` matches auth context |

---

## State Transitions

### RSVP Status Flow

```
                    ┌──────────┐
                    │ pending  │ ◄── Initial state (no response yet)
                    └────┬─────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐
    │confirmed │   │ declined │   │  maybe   │
    └────┬─────┘   └────┬─────┘   └────┬─────┘
         │               │               │
         │               │               │
         └───────────────┼───────────────┘
                         ▼
                   ┌──────────┐
                   │cancelled │ ◄── Guest explicitly cancels
                   └──────────┘
```

**Transition Rules**:
- Any status can transition to any other status (guest can change mind)
- `cancelled` is typically final but can be reversed
- Status changes logged to audit trail with before/after values

---

## Migration Checklist

- [ ] Run duplicate check query on production (read-only)
- [ ] Schedule maintenance window if duplicates exist
- [ ] Apply duplicate cleanup (if needed)
- [ ] Apply unique constraint migration
- [ ] Apply views index migration
- [ ] Verify migrations in staging
- [ ] Deploy to production
- [ ] Monitor for constraint violations in logs
