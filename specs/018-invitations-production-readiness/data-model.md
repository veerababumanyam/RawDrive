# Data Model: Digital Invitations Production Readiness

**Feature Branch**: `018-invitations-production-readiness`
**Created**: 2026-01-01

## Overview

This document defines the data entities required for production readiness enhancements. Most entities extend the existing `invitation_guests` table or add new supporting tables.

---

## Entities

### 1. RSVP Response (extends invitation_guests)

The existing `invitation_guests` table already has RSVP-related fields. We add edit token support.

**New Fields on invitation_guests**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| edit_token | VARCHAR(64) | UNIQUE, NULLABLE | Token for guest to edit their RSVP |
| edit_token_expires_at | TIMESTAMPTZ | NULLABLE | Token expiration (30 days from creation) |

**Existing RSVP Fields** (no changes):
- `status` (pending, invited, viewed, rsvp_yes, rsvp_no, rsvp_maybe)
- `rsvp_at` (TIMESTAMPTZ)
- `rsvp_response` (JSONB - dietary, message, etc.)

**State Transitions**:
```
pending → invited → viewed → rsvp_yes/rsvp_no/rsvp_maybe
                 ↓           ↑ (can change via edit token)
              expired ← ─────┘
```

**Validation Rules**:
- edit_token must be unique across all guests
- edit_token_expires_at must be future when token is created
- plus_ones must be 0-10 range

---

### 2. Invitation View

Tracks page views for analytics. New table.

**Entity: invitation_views**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| view_id | UUID | PK, DEFAULT gen_random_uuid() | Unique view identifier |
| workspace_id | UUID | NOT NULL, FK → workspaces | Workspace for isolation |
| invitation_id | UUID | NOT NULL, FK → digital_invitations | Invitation being viewed |
| visitor_hash | VARCHAR(64) | NOT NULL | SHA256 of visitor fingerprint |
| device_type | VARCHAR(20) | NULLABLE | desktop, mobile, tablet, unknown |
| browser | VARCHAR(50) | NULLABLE | Chrome, Safari, Firefox, etc. |
| os | VARCHAR(50) | NULLABLE | Windows, macOS, iOS, Android, etc. |
| referrer | VARCHAR(255) | NULLABLE | Referring URL (truncated) |
| viewed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | View timestamp |

**Relationships**:
- invitation_views → digital_invitations (many-to-one)
- invitation_views → workspaces (many-to-one)

**Indexes**:
- `idx_views_analytics` ON (invitation_id, viewed_at)
- `idx_views_unique_visitors` ON (invitation_id, visitor_hash)

**Validation Rules**:
- visitor_hash must be exactly 64 characters (SHA256 hex)
- device_type if present must be one of: desktop, mobile, tablet, unknown

---

### 3. Audit Event

Immutable audit trail for compliance. New table.

**Entity: audit_events**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| event_id | UUID | PK, DEFAULT gen_random_uuid() | Unique event identifier |
| workspace_id | UUID | NOT NULL | Workspace context |
| actor_id | UUID | NOT NULL | User who performed action |
| action | VARCHAR(50) | NOT NULL | Action type (see below) |
| resource_type | VARCHAR(50) | NOT NULL | Entity type affected |
| resource_id | UUID | NOT NULL | Entity identifier |
| changes | JSONB | NULLABLE | Before/after values for updates |
| metadata | JSONB | NULLABLE | Additional context |
| ip_address | VARCHAR(45) | NULLABLE | Client IP (v4 or v6) |
| user_agent | TEXT | NULLABLE | Client user agent |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event timestamp |

**Action Types**:
| Action | Description |
|--------|-------------|
| guest.create | Single guest created |
| guest.update | Guest information updated |
| guest.delete | Guest deleted |
| guest.bulk_import | Batch import from CSV |
| guest.bulk_invite | Bulk invitation sent |
| rsvp.submit | Guest submitted RSVP |
| rsvp.update | Guest modified RSVP |
| invitation.view | Invitation page viewed (optional) |

**Resource Types**:
- guest
- invitation
- rsvp

**Relationships**:
- Workspace-scoped (no FK to prevent deletion issues)
- References actor_id but no FK (audit must persist even if user deleted)

**Indexes**:
- `idx_audit_workspace_time` ON (workspace_id, created_at DESC)
- `idx_audit_resource` ON (resource_type, resource_id)
- `idx_audit_actor` ON (actor_id, created_at DESC)

**Special Constraints**:
- Table is append-only (no UPDATE/DELETE permissions for app user)
- Partitioned by month for efficient archival

---

### 4. Email Send Status

Tracks individual email delivery status. New table.

**Entity: email_send_log**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| send_id | UUID | PK, DEFAULT gen_random_uuid() | Unique send identifier |
| workspace_id | UUID | NOT NULL, FK → workspaces | Workspace for isolation |
| invitation_id | UUID | NOT NULL, FK → digital_invitations | Related invitation |
| guest_id | UUID | NOT NULL, FK → invitation_guests | Recipient guest |
| batch_id | UUID | NULLABLE | Bulk send batch identifier |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'queued' | Send status |
| provider | VARCHAR(20) | NOT NULL | Email provider used |
| provider_message_id | VARCHAR(100) | NULLABLE | Provider's message ID |
| error_message | TEXT | NULLABLE | Error details if failed |
| retry_count | INT | NOT NULL, DEFAULT 0 | Number of retry attempts |
| queued_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When queued |
| sent_at | TIMESTAMPTZ | NULLABLE | When successfully sent |
| failed_at | TIMESTAMPTZ | NULLABLE | When permanently failed |

**Status Values**:
| Status | Description |
|--------|-------------|
| queued | Waiting to be sent |
| sending | Currently being processed |
| sent | Successfully delivered to provider |
| delivered | Confirmed delivery (via webhook) |
| bounced | Email bounced |
| failed | Permanently failed |

**Relationships**:
- email_send_log → invitation_guests (many-to-one)
- email_send_log → digital_invitations (many-to-one)

**Indexes**:
- `idx_send_batch` ON (batch_id) WHERE batch_id IS NOT NULL
- `idx_send_guest` ON (guest_id, queued_at DESC)
- `idx_send_status` ON (status, queued_at) WHERE status = 'queued'

---

## Database Migrations

### Migration 0074: Add RSVP Edit Tokens

```sql
-- Migration: 0074_rsvp_edit_tokens.py

ALTER TABLE invitation_guests
ADD COLUMN IF NOT EXISTS edit_token VARCHAR(64),
ADD COLUMN IF NOT EXISTS edit_token_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_guests_edit_token
ON invitation_guests(edit_token) WHERE edit_token IS NOT NULL;
```

### Migration 0075: Invitation Views Table

```sql
-- Migration: 0075_invitation_views.py

CREATE TABLE IF NOT EXISTS invitation_views (
    view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id),
    visitor_hash VARCHAR(64) NOT NULL,
    device_type VARCHAR(20),
    browser VARCHAR(50),
    os VARCHAR(50),
    referrer VARCHAR(255),
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_views_analytics ON invitation_views(invitation_id, viewed_at);
CREATE INDEX idx_views_unique ON invitation_views(invitation_id, visitor_hash);
```

### Migration 0076: Audit Events Table

```sql
-- Migration: 0076_audit_events.py

CREATE TABLE IF NOT EXISTS audit_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    actor_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    changes JSONB,
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_workspace_time ON audit_events(workspace_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_actor ON audit_events(actor_id, created_at DESC);

-- Revoke modification permissions
REVOKE UPDATE, DELETE ON audit_events FROM rawdrive_app;
```

### Migration 0077: Email Send Log Table

```sql
-- Migration: 0077_email_send_log.py

CREATE TABLE IF NOT EXISTS email_send_log (
    send_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id),
    guest_id UUID NOT NULL REFERENCES invitation_guests(guest_id),
    batch_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    provider VARCHAR(20) NOT NULL,
    provider_message_id VARCHAR(100),
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ
);

CREATE INDEX idx_send_batch ON email_send_log(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_send_guest ON email_send_log(guest_id, queued_at DESC);
CREATE INDEX idx_send_status ON email_send_log(status, queued_at) WHERE status = 'queued';
```

---

## Entity Relationships Diagram

```
┌─────────────────────┐
│     workspaces      │
│  (existing table)   │
└──────────┬──────────┘
           │
           │ 1:N
           ▼
┌─────────────────────┐        ┌─────────────────────┐
│ digital_invitations │◄───────│   invitation_views  │
│   (existing table)  │  1:N   │    (new table)      │
└──────────┬──────────┘        └─────────────────────┘
           │
           │ 1:N
           ▼
┌─────────────────────┐        ┌─────────────────────┐
│  invitation_guests  │◄───────│   email_send_log    │
│ (extended: tokens)  │  1:N   │    (new table)      │
└─────────────────────┘        └─────────────────────┘

┌─────────────────────┐
│    audit_events     │  (workspace-scoped, no FKs)
│    (new table)      │
└─────────────────────┘
```

---

## Query Patterns

### Analytics: Unique Visitors Count
```sql
SELECT COUNT(DISTINCT visitor_hash) as unique_visitors
FROM invitation_views
WHERE invitation_id = $1
  AND viewed_at >= $2
  AND viewed_at < $3;
```

### Analytics: RSVP Statistics
```sql
SELECT
    COUNT(*) as total_guests,
    COUNT(*) FILTER (WHERE status IN ('rsvp_yes', 'rsvp_no', 'rsvp_maybe')) as responded,
    COUNT(*) FILTER (WHERE status = 'rsvp_yes') as attending,
    COUNT(*) FILTER (WHERE status = 'rsvp_no') as not_attending,
    COUNT(*) FILTER (WHERE status = 'rsvp_maybe') as maybe,
    COALESCE(SUM(plus_ones) FILTER (WHERE status = 'rsvp_yes'), 0) as total_plus_ones
FROM invitation_guests
WHERE workspace_id = $1 AND invitation_id = $2;
```

### Audit: Recent Events for Workspace
```sql
SELECT event_id, action, resource_type, resource_id, created_at
FROM audit_events
WHERE workspace_id = $1
ORDER BY created_at DESC
LIMIT 50;
```

### Bulk Invite: Batch Status
```sql
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'sent') as sent,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status = 'queued') as pending
FROM email_send_log
WHERE batch_id = $1;
```
