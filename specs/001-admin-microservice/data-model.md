# Data Model: Admin Microservice

**Feature**: Admin Microservice
**Date**: 2025-12-27
**Status**: Complete

This document defines all database entities for the Admin Microservice with their fields, relationships, validation rules, and state transitions.

---

## Entity Relationship Diagram

```
┌─────────────────────────┐     ┌─────────────────────────┐
│   admin_platform_admins │────┤   admin_sessions        │
│   (identity)            │     │   (with device binding) │
└───────────┬─────────────┘     └─────────────────────────┘
            │
            │ 1:N
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   admin_invites         │     │   admin_delegations     │
│   (pending invitations) │     │   (permission sharing)  │
└─────────────────────────┘     └─────────────────────────┘
            │
            │ N:M
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   admin_role_permissions│────┤admin_platform_permissions│
│   (role assignments)    │     │   (canonical list)      │
└─────────────────────────┘     └─────────────────────────┘

┌─────────────────────────┐     ┌─────────────────────────┐
│ admin_support_sessions  │     │admin_break_glass_sessions│
│ (workspace access)      │     │   (emergency access)    │
└─────────────────────────┘     └─────────────────────────┘

┌─────────────────────────┐     ┌─────────────────────────┐
│   admin_audit_logs      │     │   admin_feature_flags   │
│   (partitioned by month)│     │   (feature toggles)     │
└─────────────────────────┘     └───────────┬─────────────┘
                                            │
                                            ▼
                                ┌─────────────────────────┐
                                │ admin_feature_flag_rules│
                                │   (targeting rules)     │
                                └─────────────────────────┘
```

---

## Core Identity Entities

### admin_platform_admins

Platform administrator identity, linked to user accounts but with separate admin-specific attributes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| admin_id | UUID | PK, DEFAULT gen_random_uuid() | Primary identifier |
| user_id | UUID | NOT NULL, FK users(user_id), UNIQUE | Link to main user account |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Email (denormalized for queries) |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Account status |
| mfa_enabled | BOOLEAN | NOT NULL, DEFAULT false | MFA requirement |
| mfa_secret_encrypted | TEXT | NULL | Encrypted TOTP secret |
| backup_codes_hashed | TEXT[] | NULL | Bcrypt-hashed backup codes |
| usual_country | VARCHAR(2) | NULL | Expected login country for anomaly detection |
| training_completed | BOOLEAN | NOT NULL, DEFAULT false | Onboarding gate (FR-102) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| created_by | UUID | FK admin_platform_admins(admin_id) | Creator admin |
| last_login_at | TIMESTAMPTZ | NULL | Last successful login |
| disabled_at | TIMESTAMPTZ | NULL | Disable timestamp |
| disabled_by | UUID | FK admin_platform_admins(admin_id) | Who disabled |
| offboarded_at | TIMESTAMPTZ | NULL | Offboarding timestamp (FR-104) |

**Indexes**:
- `idx_admin_email` ON (email)
- `idx_admin_status` ON (status)
- `idx_admin_last_login` ON (last_login_at) WHERE status = 'active'

**Status Values**: `pending_mfa`, `active`, `suspended`, `disabled`, `offboarded`

**State Transitions**:
```
pending_mfa -> active (MFA setup complete)
active -> suspended (temporary suspension)
suspended -> active (reinstatement)
active -> disabled (permanent disable)
active -> offboarded (offboarding complete)
```

---

### admin_invites

Pending admin invitations with one-time tokens.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| invite_id | UUID | PK, DEFAULT gen_random_uuid() | Primary identifier |
| email | VARCHAR(255) | NOT NULL | Invitee email |
| role_template | VARCHAR(50) | NOT NULL | Initial role template |
| token_hash | VARCHAR(255) | NOT NULL, UNIQUE | SHA-256 of invite token |
| created_by | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Inviting admin |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| expires_at | TIMESTAMPTZ | NOT NULL | Token expiration (24 hours) |
| accepted_at | TIMESTAMPTZ | NULL | Acceptance timestamp |
| accepted_by | UUID | FK admin_platform_admins(admin_id) | Created admin account |

**Indexes**:
- `idx_invite_token` ON (token_hash)
- `idx_invite_email_pending` ON (email) WHERE accepted_at IS NULL

**Validation Rules**:
- Token expires in 24 hours
- One active invite per email
- Accepted invite cannot be reused (EC-007)

---

### admin_platform_permissions

Canonical list of all platform permissions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| permission_id | SERIAL | PK | Auto-increment identifier |
| name | VARCHAR(100) | NOT NULL, UNIQUE | Permission string (e.g., platform:admins:write) |
| description | TEXT | NULL | Human-readable description |
| category | VARCHAR(50) | NOT NULL | Permission category for grouping |
| is_sensitive | BOOLEAN | NOT NULL, DEFAULT false | Requires step-up auth (FR-087) |

**Seed Data** (partial):
```sql
INSERT INTO admin_platform_permissions (name, description, category, is_sensitive) VALUES
('platform:admins:read', 'View admin accounts', 'admin_management', false),
('platform:admins:write', 'Manage admin accounts', 'admin_management', true),
('platform:support_access:start', 'Start support sessions', 'support', false),
('platform:break_glass:request', 'Request break-glass access', 'emergency', true),
('platform:break_glass:approve', 'Approve break-glass requests', 'emergency', true),
('platform:feature_flags:write', 'Manage feature flags', 'configuration', true),
('platform:audit:read', 'View audit logs', 'compliance', false),
('platform:audit:export', 'Export audit logs', 'compliance', false),
('platform:moderation:action', 'Take moderation actions', 'content', false),
('platform:dsar:process', 'Process DSAR requests', 'compliance', true),
('platform:delegations:manage', 'Manage permission delegations', 'admin_management', true);
```

---

### admin_role_permissions

Role-to-permission mapping with support for system roles and custom roles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| role_id | UUID | PK (composite), FK platform_roles(role_id) | Role identifier |
| permission_id | INTEGER | PK (composite), FK admin_platform_permissions(permission_id) | Permission identifier |
| granted_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When permission was granted |
| granted_by | UUID | FK admin_platform_admins(admin_id) | Who granted |

**System Role Templates**:
- `super_admin` - All permissions
- `platform_admin` - All except break_glass:approve and admins:write
- `support_admin` - Support access and user/workspace read
- `billing_admin` - Subscription and billing operations
- `content_moderator` - Moderation queue and actions
- `security_admin` - Audit, feature flags, platform config
- `observability_admin` - Logs, metrics, traces access
- `auditor_readonly` - Audit read and export only
- `product_admin` - Feature flags and analytics

---

## Session Entities

### admin_sessions

Active admin sessions with device binding (FR-086).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| session_id | UUID | PK, DEFAULT gen_random_uuid() | Session identifier |
| admin_id | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Admin owner |
| device_fingerprint_hash | VARCHAR(64) | NOT NULL | SHA-256 of device fingerprint |
| ip_network | CIDR | NOT NULL | /24 network of original IP |
| user_agent | TEXT | NULL | Browser user agent |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Session start |
| expires_at | TIMESTAMPTZ | NOT NULL | Max 4 hours from creation |
| last_activity_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last request timestamp |
| mfa_verified_at | TIMESTAMPTZ | NULL | Last MFA verification (for step-up) |
| terminated_at | TIMESTAMPTZ | NULL | Early termination |
| termination_reason | VARCHAR(50) | NULL | Why session ended |

**Indexes**:
- `idx_session_admin` ON (admin_id, expires_at) WHERE terminated_at IS NULL
- `idx_session_expiry` ON (expires_at) WHERE terminated_at IS NULL

**Note**: Redis is primary storage; this table is for audit and self-service listing (FR-091).

---

### admin_support_sessions

Time-boxed workspace access sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| session_id | UUID | PK, DEFAULT gen_random_uuid() | Session identifier |
| admin_id | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Support admin |
| workspace_id | UUID | NOT NULL | Target workspace |
| justification | TEXT | NOT NULL | Ticket ID or reason |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Session status |
| requires_approval | BOOLEAN | NOT NULL, DEFAULT false | Enterprise workspace |
| approved_by | UUID | FK users(user_id) | Workspace owner approval |
| approved_at | TIMESTAMPTZ | NULL | Approval timestamp |
| started_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Session start |
| expires_at | TIMESTAMPTZ | NOT NULL | Configurable max duration |
| ended_at | TIMESTAMPTZ | NULL | Actual end time |
| ended_by | UUID | FK admin_platform_admins(admin_id) | Who ended |
| end_reason | VARCHAR(50) | NULL | expired, manual, forced |

**Indexes**:
- `idx_support_admin_active` ON (admin_id, expires_at) WHERE status = 'active'
- `idx_support_workspace` ON (workspace_id, started_at)

**Status Values**: `pending_approval`, `active`, `expired`, `ended`, `rejected`

---

### admin_break_glass_sessions

Emergency access with dual control.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| session_id | UUID | PK, DEFAULT gen_random_uuid() | Session identifier |
| initiator_id | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Requesting admin |
| approver_id | UUID | FK admin_platform_admins(admin_id) | Approving admin |
| reason | TEXT | NOT NULL | Emergency justification |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | Request status |
| requested_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Request timestamp |
| approved_at | TIMESTAMPTZ | NULL | Approval timestamp |
| expires_at | TIMESTAMPTZ | NULL | 1 hour from approval |
| ended_at | TIMESTAMPTZ | NULL | Actual end |
| actions_summary | JSONB | NULL | Summary of actions taken |
| post_incident_report_id | UUID | FK admin_incident_reports(report_id) | Required report |

**Indexes**:
- `idx_break_glass_pending` ON (status, requested_at) WHERE status = 'pending'
- `idx_break_glass_initiator` ON (initiator_id, requested_at)

**Status Values**: `pending`, `approved`, `rejected`, `active`, `expired`, `completed`

**Validation**:
- Approver cannot be initiator
- Max 1 hour duration (no extension)
- Post-incident report required within 24 hours of session end

---

## Delegation Entities

### admin_delegations

Time-boxed permission delegation (FR-095-097).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| delegation_id | UUID | PK, DEFAULT gen_random_uuid() | Delegation identifier |
| delegator_id | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Permission owner |
| delegate_id | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Recipient admin |
| permissions | VARCHAR(100)[] | NOT NULL | Delegated permission list |
| reason | TEXT | NULL | Delegation reason (e.g., "vacation coverage") |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Delegation status |
| start_at | TIMESTAMPTZ | NOT NULL | Effective start |
| end_at | TIMESTAMPTZ | NOT NULL | Automatic expiration |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| revoked_at | TIMESTAMPTZ | NULL | Early revocation |
| revoked_by | UUID | FK admin_platform_admins(admin_id) | Who revoked |

**Indexes**:
- `idx_delegation_delegate_active` ON (delegate_id, end_at) WHERE status = 'active'
- `idx_delegation_delegator` ON (delegator_id, created_at)

**Constraints**:
- Max 30 days duration
- Cannot delegate permissions you don't have
- Delegator and delegate must be different admins

---

## Audit & Compliance Entities

### admin_audit_logs (Partitioned)

Immutable audit trail for all admin actions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| log_id | UUID | PK, DEFAULT gen_random_uuid() | Log entry identifier |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Event timestamp |
| admin_id | UUID | NOT NULL | Acting admin |
| admin_email | VARCHAR(255) | NOT NULL | Email (denormalized) |
| action | VARCHAR(100) | NOT NULL | Action type |
| resource_type | VARCHAR(50) | NOT NULL | Target resource type |
| resource_id | VARCHAR(255) | NULL | Target resource ID |
| before_state | JSONB | NULL | State before action |
| after_state | JSONB | NULL | State after action |
| ip_address | INET | NULL | Request IP |
| user_agent | TEXT | NULL | Browser user agent |
| request_id | VARCHAR(100) | NULL | Correlation ID |
| session_type | VARCHAR(20) | NOT NULL, DEFAULT 'normal' | normal/support/break_glass |
| session_id | UUID | NULL | Related session ID |
| success | BOOLEAN | NOT NULL, DEFAULT true | Action result |
| error_message | TEXT | NULL | Error if failed |

**Partitioning**: Range by `created_at`, monthly partitions

**Indexes** (per partition):
- `idx_audit_admin_created` ON (admin_id, created_at)
- `idx_audit_action_created` ON (action, created_at)
- `idx_audit_resource` ON (resource_type, resource_id, created_at)

**Retention**: 2 years online, 7 years archived (FR-105)

---

### admin_dsar_requests

GDPR/CCPA data subject requests (FR-098-101).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| dsar_id | UUID | PK, DEFAULT gen_random_uuid() | Request identifier |
| request_type | VARCHAR(20) | NOT NULL | access, erasure, portability |
| subject_email | VARCHAR(255) | NOT NULL | Data subject email |
| subject_verified | BOOLEAN | NOT NULL, DEFAULT false | Identity verified |
| status | VARCHAR(30) | NOT NULL, DEFAULT 'pending_verification' | Request status |
| submitted_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Submission timestamp |
| sla_deadline | TIMESTAMPTZ | NOT NULL | 30 days from submission |
| assigned_to | UUID | FK admin_platform_admins(admin_id) | Assigned processor |
| completed_at | TIMESTAMPTZ | NULL | Completion timestamp |
| export_url | TEXT | NULL | Presigned URL for export |
| export_expires_at | TIMESTAMPTZ | NULL | Export URL expiration |
| notes | TEXT | NULL | Processing notes |

**Indexes**:
- `idx_dsar_status_deadline` ON (status, sla_deadline) WHERE status NOT IN ('completed', 'cancelled')
- `idx_dsar_subject` ON (subject_email, submitted_at)

**Status Values**: `pending_verification`, `verified`, `in_progress`, `pending_review`, `completed`, `cancelled`

---

## Feature Management Entities

### admin_feature_flags

Feature toggle configuration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| flag_id | UUID | PK, DEFAULT gen_random_uuid() | Flag identifier |
| key | VARCHAR(100) | NOT NULL, UNIQUE | Flag key (e.g., "new_gallery_ui") |
| name | VARCHAR(200) | NOT NULL | Human-readable name |
| description | TEXT | NULL | Flag description |
| enabled | BOOLEAN | NOT NULL, DEFAULT false | Global enabled state |
| rollout_percentage | INTEGER | DEFAULT 0, CHECK (0-100) | Percentage rollout |
| error_threshold_percent | INTEGER | NULL | Auto-rollback threshold |
| auto_rollback | BOOLEAN | NOT NULL, DEFAULT false | Enable auto-rollback |
| scheduled_enable_at | TIMESTAMPTZ | NULL | Scheduled activation |
| scheduled_disable_at | TIMESTAMPTZ | NULL | Scheduled deactivation |
| version | INTEGER | NOT NULL, DEFAULT 1 | Optimistic lock version |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| created_by | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Creator |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update |
| updated_by | UUID | FK admin_platform_admins(admin_id) | Last updater |

**Indexes**:
- `idx_flag_key` ON (key)
- `idx_flag_scheduled` ON (scheduled_enable_at) WHERE scheduled_enable_at IS NOT NULL

---

### admin_feature_flag_rules

Targeting rules for feature flags.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| rule_id | UUID | PK, DEFAULT gen_random_uuid() | Rule identifier |
| flag_id | UUID | NOT NULL, FK admin_feature_flags(flag_id) | Parent flag |
| rule_type | VARCHAR(30) | NOT NULL | user_id, workspace_id, plan_code, attribute |
| operator | VARCHAR(20) | NOT NULL | equals, in, contains, regex |
| value | JSONB | NOT NULL | Target values |
| enabled | BOOLEAN | NOT NULL, DEFAULT true | Rule result if matched |
| priority | INTEGER | NOT NULL, DEFAULT 0 | Evaluation order |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |

**Indexes**:
- `idx_rule_flag` ON (flag_id, priority)

---

## Moderation Entities

### admin_moderation_queue

Flagged content awaiting review.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| queue_id | UUID | PK, DEFAULT gen_random_uuid() | Queue item identifier |
| content_type | VARCHAR(50) | NOT NULL | asset, gallery, workspace, user |
| content_id | UUID | NOT NULL | Target content ID |
| workspace_id | UUID | NOT NULL | Owning workspace |
| flagged_reason | VARCHAR(100) | NOT NULL | Flag reason code |
| flagged_by | VARCHAR(50) | NOT NULL | ai, user_report, system |
| severity | VARCHAR(20) | NOT NULL, DEFAULT 'medium' | low, medium, high, critical |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | Queue status |
| submitted_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Flag timestamp |
| assigned_to | UUID | FK admin_platform_admins(admin_id) | Assigned moderator |
| reviewed_at | TIMESTAMPTZ | NULL | Review timestamp |
| reviewed_by | UUID | FK admin_platform_admins(admin_id) | Reviewer |
| action_taken | VARCHAR(50) | NULL | approved, removed, warned, escalated |
| notes | TEXT | NULL | Moderator notes |

**Indexes**:
- `idx_moderation_pending` ON (status, severity, submitted_at) WHERE status = 'pending'
- `idx_moderation_workspace` ON (workspace_id, submitted_at)

---

## Notification Entities

### admin_notification_preferences

Per-admin notification settings (FR-106-109).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| admin_id | UUID | PK, FK admin_platform_admins(admin_id) | Admin identifier |
| email_enabled | BOOLEAN | NOT NULL, DEFAULT true | Email notifications |
| email_address | VARCHAR(255) | NULL | Override email |
| sms_enabled | BOOLEAN | NOT NULL, DEFAULT false | SMS notifications |
| sms_number | VARCHAR(20) | NULL | Phone number |
| slack_enabled | BOOLEAN | NOT NULL, DEFAULT false | Slack notifications |
| slack_webhook | TEXT | NULL | Webhook URL (encrypted) |
| mute_start_hour | INTEGER | NULL, CHECK (0-23) | Mute start (FR-109) |
| mute_end_hour | INTEGER | NULL, CHECK (0-23) | Mute end |
| timezone | VARCHAR(50) | NOT NULL, DEFAULT 'UTC' | Admin timezone (NFR-026) |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update |

**Note**: Critical alerts (break-glass, anomaly) bypass mute settings (FR-107).

---

## Bulk Operations Entities

### admin_bulk_operations

Tracking for mass admin actions (EC-014).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| operation_id | UUID | PK, DEFAULT gen_random_uuid() | Operation identifier |
| admin_id | UUID | NOT NULL, FK admin_platform_admins(admin_id) | Initiating admin |
| operation_type | VARCHAR(50) | NOT NULL | bulk_suspend, bulk_export, etc. |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | Operation status |
| total_count | INTEGER | NOT NULL | Total items to process |
| processed_count | INTEGER | NOT NULL, DEFAULT 0 | Items processed |
| success_count | INTEGER | NOT NULL, DEFAULT 0 | Successful items |
| error_count | INTEGER | NOT NULL, DEFAULT 0 | Failed items |
| errors | JSONB | NULL | Error details |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Start timestamp |
| completed_at | TIMESTAMPTZ | NULL | Completion timestamp |
| cancelled_at | TIMESTAMPTZ | NULL | Cancellation timestamp |
| cancelled_by | UUID | FK admin_platform_admins(admin_id) | Who cancelled |

**Status Values**: `pending`, `processing`, `completed`, `cancelled`, `failed`

---

## Configuration Entities

### admin_platform_config

Encrypted platform-wide settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| config_id | UUID | PK, DEFAULT gen_random_uuid() | Config identifier |
| key | VARCHAR(100) | NOT NULL, UNIQUE | Configuration key |
| value_encrypted | TEXT | NOT NULL | AES-256 encrypted value |
| category | VARCHAR(50) | NOT NULL | ai, email, payment, platform |
| is_sensitive | BOOLEAN | NOT NULL, DEFAULT false | Mask in UI |
| version | INTEGER | NOT NULL, DEFAULT 1 | Optimistic lock version |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update |
| updated_by | UUID | FK admin_platform_admins(admin_id) | Last updater |

---

## Lifecycle Entities

### admin_training_completions

Training gate tracking (FR-102).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| admin_id | UUID | PK (composite), FK admin_platform_admins(admin_id) | Admin identifier |
| training_module | VARCHAR(100) | PK (composite) | Module identifier |
| completed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Completion timestamp |
| score | INTEGER | NULL | Assessment score |
| certificate_url | TEXT | NULL | Certificate URL |

---

## Migration Notes

### Tables to Migrate
- Existing support session data from main backend (if any)
- Existing admin role assignments from `user_platform_roles`

### New Tables (admin_* prefix)
All new tables use `admin_` prefix for clear schema separation.

### Foreign Key Strategy
- Hard FKs to `users` table (shared database)
- Self-referential FKs within admin tables
- No FKs to other backend tables (use IDs, validate via API)

### Partitioning Setup
```sql
-- Monthly partition creation (run via cron job)
CREATE TABLE admin_audit_logs_2025_01 PARTITION OF admin_audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
```

---

## Summary

| Entity | Purpose | Phase |
|--------|---------|-------|
| admin_platform_admins | Admin identity | 1 |
| admin_invites | Invitation flow | 1 |
| admin_platform_permissions | Permission catalog | 1 |
| admin_role_permissions | Role assignments | 1 |
| admin_sessions | Active sessions | 1 |
| admin_support_sessions | Workspace access | 2 |
| admin_break_glass_sessions | Emergency access | 2 |
| admin_delegations | Permission sharing | 2 |
| admin_audit_logs | Immutable audit trail | 1 |
| admin_feature_flags | Feature toggles | 4 |
| admin_feature_flag_rules | Targeting rules | 4 |
| admin_moderation_queue | Content review | 4 |
| admin_dsar_requests | Compliance requests | 3 |
| admin_notification_preferences | Alert settings | 2 |
| admin_bulk_operations | Mass actions | 2 |
| admin_platform_config | System settings | 4 |
| admin_training_completions | Onboarding gates | 2 |

**Total**: 17 new tables, 0 modified existing tables
