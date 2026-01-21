# Data Model: Face Detection Audit Remediation

**Feature**: `002-face-audit-remediation`
**Date**: 2026-01-21
**Status**: Draft

## Overview

This document defines the data model extensions and new entities required to implement biometric consent tracking, rate limiting configuration, data retention policy, and cache management for the face detection system.

---

## 1. Entity Definitions

### 1.1 WorkspaceBiometricSettings (New)

Workspace-level configuration for biometric processing features.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `workspace_id` | UUID | PK, FK to workspaces | Workspace identifier |
| `face_detection_enabled` | Boolean | Default: false | Master toggle for face detection |
| `consent_required` | Boolean | Default: true | Require explicit consent before processing |
| `consent_version` | String(20) | Default: "1.0.0" | Current consent document version |
| `consent_document_url` | Text | Nullable | URL to consent policy document |
| `auto_detect_on_upload` | Boolean | Default: false | Auto-trigger detection on photo upload |
| `created_at` | Timestamp | Auto | Record creation time |
| `updated_at` | Timestamp | Auto-update | Last modification time |

**Relationships**:
- One-to-one with `workspaces`

**Indexes**:
- Primary: `workspace_id`

---

### 1.2 BiometricConsent (Extension to user_consents)

Tracks explicit consent for biometric processing per user per workspace.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `consent_id` | UUID | PK | Unique consent record |
| `workspace_id` | UUID | FK to workspaces, NOT NULL | Workspace scope |
| `user_id` | UUID | FK to users, NOT NULL | User granting consent |
| `consent_type` | String(50) | Enum | Type: `biometric_processing`, `face_detection` |
| `status` | String(30) | Enum | Status: `active`, `withdrawn`, `expired` |
| `consent_granted` | Boolean | NOT NULL | Whether consent was granted |
| `document_version` | String(20) | NOT NULL | Policy version consented to |
| `document_hash` | String(64) | Nullable | SHA-256 of document |
| `ip_address` | INET | Nullable | IP at consent time |
| `user_agent` | Text | Nullable | Browser/client info |
| `country_code` | String(2) | Nullable | GeoIP country |
| `capture_method` | String(30) | Enum | Method: `checkbox`, `toggle`, `api` |
| `capture_source` | String(50) | NOT NULL | Where: `settings`, `onboarding`, `upload_flow` |
| `withdrawn_at` | Timestamp | Nullable | When consent was revoked |
| `withdrawal_reason` | Text | Nullable | User-provided reason |
| `withdrawal_ip_address` | INET | Nullable | IP at withdrawal time |
| `created_at` | Timestamp | Auto | Record creation time |
| `updated_at` | Timestamp | Auto-update | Last modification time |

**Relationships**:
- Many-to-one with `users`
- Many-to-one with `workspaces`

**Indexes**:
- Primary: `consent_id`
- Unique: `(workspace_id, user_id, consent_type, document_version)`
- Index: `(workspace_id, status)` for active consent lookups
- Index: `(user_id, consent_type)` for user consent history

**Constraints**:
- `consent_type` IN (`biometric_processing`, `face_detection`, `face_recognition`)
- `status` IN (`active`, `withdrawn`, `expired`, `superseded`)
- `capture_method` IN (`checkbox`, `button`, `toggle`, `api`, `implicit`)

---

### 1.3 FaceRateLimitConfig (New)

Per-workspace rate limit overrides for face operations.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `workspace_id` | UUID | PK, FK to workspaces | Workspace identifier |
| `search_requests_per_minute` | Integer | Default: 20, Range: 1-100 | Face search limit |
| `detection_requests_per_day` | Integer | Default: 1000, Range: 1-10000 | Detection trigger limit |
| `bulk_operations_per_minute` | Integer | Default: 30, Range: 1-100 | Bulk assign/merge limit |
| `enabled` | Boolean | Default: true | Whether limits are enforced |
| `created_at` | Timestamp | Auto | Record creation time |
| `updated_at` | Timestamp | Auto-update | Last modification time |

**Relationships**:
- One-to-one with `workspaces`

**Indexes**:
- Primary: `workspace_id`

---

### 1.4 FaceRetentionPolicy (Extension to workspace_privacy_settings)

Adds face embedding retention configuration to existing privacy settings.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `face_embedding_retention_days` | Integer | Default: 2555 (7 years), Range: 30-2555 | Embedding retention period |
| `retention_policy_version` | String(20) | Default: "1.0.0" | Policy version for audit |
| `last_cleanup_at` | Timestamp | Nullable | Last retention cleanup run |
| `embeddings_deleted_count` | Integer | Default: 0 | Total embeddings deleted |

**Note**: These fields extend the existing `workspace_privacy_settings` table.

---

### 1.5 FaceEmbeddingRetentionJob (New)

Tracks retention cleanup job executions for audit compliance.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `job_id` | UUID | PK | Unique job identifier |
| `workspace_id` | UUID | FK to workspaces, Nullable | Null for global cleanup |
| `status` | String(20) | Enum | Status: `pending`, `running`, `completed`, `failed` |
| `started_at` | Timestamp | Nullable | Job start time |
| `completed_at` | Timestamp | Nullable | Job completion time |
| `faces_scanned` | Integer | Default: 0 | Total faces evaluated |
| `faces_deleted` | Integer | Default: 0 | Faces deleted this run |
| `embeddings_deleted` | Integer | Default: 0 | Embeddings deleted |
| `bytes_freed` | BigInteger | Default: 0 | Storage reclaimed |
| `error_message` | Text | Nullable | Error details if failed |
| `created_at` | Timestamp | Auto | Record creation time |

**Relationships**:
- Many-to-one with `workspaces` (optional)

**Indexes**:
- Primary: `job_id`
- Index: `(workspace_id, created_at DESC)` for job history
- Index: `(status, created_at)` for pending job lookup

---

## 2. State Transitions

### 2.1 BiometricConsent Status

```
                 ┌──────────────┐
                 │   PENDING    │ (not in spec - consent either exists or doesn't)
                 └──────────────┘
                        │
                        ▼
┌──────────────┐  grant   ┌──────────────┐
│              │ ◄──────  │              │
│    ACTIVE    │          │   (created)  │
│              │          │              │
└──────────────┘          └──────────────┘
        │
        │ revoke
        ▼
┌──────────────┐
│  WITHDRAWN   │
└──────────────┘
        │
        │ re-grant (new version)
        ▼
┌──────────────┐
│  SUPERSEDED  │ (old record when new consent granted)
└──────────────┘
```

**Transitions**:
- `active` → `withdrawn`: User revokes consent
- `active` → `superseded`: New consent version granted
- `withdrawn` → `active`: User re-grants consent (new record created)

### 2.2 FaceEmbeddingRetentionJob Status

```
┌──────────────┐
│   PENDING    │
└──────────────┘
        │
        │ worker picks up
        ▼
┌──────────────┐
│   RUNNING    │
└──────────────┘
        │
        ├──────────────┐
        │ success      │ error
        ▼              ▼
┌──────────────┐  ┌──────────────┐
│  COMPLETED   │  │    FAILED    │
└──────────────┘  └──────────────┘
```

---

## 3. Validation Rules

### 3.1 BiometricConsent Validation

| Rule | Description |
|------|-------------|
| `workspace_user_unique` | Only one active consent per user per workspace per consent_type |
| `document_version_format` | Must be semantic version (X.Y.Z) |
| `withdrawal_requires_active` | Can only withdraw from `active` status |
| `ip_address_required_for_gdpr` | IP must be captured if `country_code` is EU |

### 3.2 FaceRateLimitConfig Validation

| Rule | Description |
|------|-------------|
| `search_limit_range` | 1-100 requests per minute |
| `detection_limit_range` | 1-10000 requests per day |
| `bulk_limit_range` | 1-100 requests per minute |

### 3.3 FaceRetentionPolicy Validation

| Rule | Description |
|------|-------------|
| `retention_minimum` | At least 30 days (legal requirement) |
| `retention_maximum` | At most 2555 days (7 years) |
| `cannot_reduce_below_existing` | Cannot reduce retention below existing face ages without consent |

---

## 4. Audit Event Types

New audit event types for compliance tracking:

| Event Type | Trigger | Details Captured |
|------------|---------|------------------|
| `BIOMETRIC_CONSENT_GRANTED` | User grants consent | `consent_type`, `document_version`, `capture_method` |
| `BIOMETRIC_CONSENT_WITHDRAWN` | User revokes consent | `consent_type`, `withdrawal_reason` |
| `BIOMETRIC_SETTINGS_CHANGED` | Admin changes settings | `changed_fields`, `old_values`, `new_values` |
| `FACE_RETENTION_CLEANUP_STARTED` | Cleanup job starts | `job_id`, `workspace_id` |
| `FACE_RETENTION_CLEANUP_COMPLETED` | Cleanup job completes | `job_id`, `faces_deleted`, `bytes_freed` |
| `FACE_RATE_LIMIT_EXCEEDED` | Rate limit hit | `limit_type`, `current_count`, `limit_value` |

---

## 5. Cache Structures

### 5.1 Face Group Cache (Redis)

**Key Pattern**: `face_groups:{workspace_id}:{gallery_id}:{page}:{limit}:{sort}`

**Value Structure** (JSON):
```json
{
  "groups": [
    {
      "id": "uuid",
      "name": "Person Name",
      "face_count": 15,
      "representative_thumbnail": "url",
      "created_at": "iso-timestamp"
    }
  ],
  "total_count": 42,
  "cached_at": "iso-timestamp"
}
```

**TTL**: 120 seconds (2 minutes)

### 5.2 Rate Limit Cache (Redis)

**Key Pattern**: `ratelimit:face:{operation}:{workspace_id}:{window_start}`

**Value Type**: Sorted Set (timestamps as scores for sliding window)

**TTL**: `window_seconds + 10` (auto-cleanup buffer)

### 5.3 Consent Cache (Redis)

**Key Pattern**: `consent:biometric:{workspace_id}:{user_id}`

**Value Structure** (JSON):
```json
{
  "has_active_consent": true,
  "consent_type": "face_detection",
  "document_version": "1.0.0",
  "granted_at": "iso-timestamp"
}
```

**TTL**: 300 seconds (5 minutes) - short due to consent sensitivity

---

## 6. Migration Strategy

### Phase 1: Schema Migration
1. Add `workspace_biometric_settings` table
2. Add fields to `workspace_privacy_settings`
3. Add `face_embedding_retention_jobs` table
4. Reuse existing `user_consents` table with new `consent_type` values

### Phase 2: Data Backfill
1. Create default `WorkspaceBiometricSettings` for all workspaces (disabled by default)
2. Set default retention period (2555 days / 7 years)
3. No consent backfill - existing faces grandfathered

### Phase 3: Index Creation
1. Create indexes after data load
2. Analyze tables for query optimization

---

## 7. Entity Relationship Diagram

```
┌─────────────────────┐       ┌─────────────────────┐
│     workspaces      │       │       users         │
├─────────────────────┤       ├─────────────────────┤
│ workspace_id (PK)   │       │ user_id (PK)        │
│ ...                 │       │ ...                 │
└─────────────────────┘       └─────────────────────┘
         │                              │
         │ 1:1                          │ 1:N
         ▼                              │
┌─────────────────────┐                 │
│ workspace_biometric │                 │
│ _settings           │                 │
├─────────────────────┤                 │
│ workspace_id (PK,FK)│                 │
│ face_detection_     │                 │
│   enabled           │                 │
│ consent_required    │                 │
│ ...                 │                 │
└─────────────────────┘                 │
         │                              │
         │ 1:N                          │
         ▼                              ▼
┌─────────────────────────────────────────────────┐
│              biometric_consents                  │
│        (extends user_consents pattern)           │
├──────────────────────────────────────────────────┤
│ consent_id (PK)                                  │
│ workspace_id (FK) ─────────────────────────────► │
│ user_id (FK) ───────────────────────────────────►│
│ consent_type                                     │
│ status                                           │
│ ...                                              │
└──────────────────────────────────────────────────┘

┌─────────────────────┐       ┌─────────────────────┐
│ face_rate_limit_    │       │ face_embedding_     │
│ config              │       │ retention_jobs      │
├─────────────────────┤       ├─────────────────────┤
│ workspace_id (PK,FK)│       │ job_id (PK)         │
│ search_requests_    │       │ workspace_id (FK)   │
│   per_minute        │       │ status              │
│ detection_requests_ │       │ faces_deleted       │
│   per_day           │       │ ...                 │
│ ...                 │       └─────────────────────┘
└─────────────────────┘

┌─────────────────────┐
│ workspace_privacy_  │
│ settings (extended) │
├─────────────────────┤
│ workspace_id (PK,FK)│
│ ...existing fields..│
│ face_embedding_     │ ◄── NEW
│   retention_days    │
│ retention_policy_   │ ◄── NEW
│   version           │
└─────────────────────┘
```
