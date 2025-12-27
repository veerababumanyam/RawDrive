# Data Model: User Profile Settings

**Feature**: 002-user-profile-settings
**Date**: 2025-12-27

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           users                                  │
│ (extended with new columns)                                     │
├─────────────────────────────────────────────────────────────────┤
│ user_id              UUID PK                                    │
│ email                VARCHAR(255) UNIQUE NOT NULL               │
│ display_name         VARCHAR(255) NOT NULL                      │
│ preferred_language   VARCHAR(10) DEFAULT 'en-IN'                │
│ email_verified       BOOLEAN DEFAULT FALSE                      │
│ email_verified_at    TIMESTAMPTZ                                │
│ avatar_url           VARCHAR(500)           [NEW]               │
│ job_title            VARCHAR(100)           [NEW]               │
│ phone                VARCHAR(50)            [NEW]               │
│ timezone             VARCHAR(50)            [NEW]               │
│ bio                  TEXT                   [NEW]               │
│ notification_prefs   JSONB                  [NEW]               │
│ privacy_settings     JSONB                  [NEW]               │
│ last_password_at     TIMESTAMPTZ            [NEW]               │
│ deletion_requested   TIMESTAMPTZ            [NEW]               │
│ created_at           TIMESTAMPTZ DEFAULT NOW()                  │
│ updated_at           TIMESTAMPTZ DEFAULT NOW()                  │
│ disabled_at          TIMESTAMPTZ                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┬─────────────────────┐
         │                 │                 │                     │
         ▼                 ▼                 ▼                     ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│user_totp_settings│ │data_export_reqs │ │account_deletion │ │    sessions     │
│                 │ │                 │ │    _requests    │ │   (existing)    │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│user_id     PK,FK│ │export_id    PK  │ │request_id   PK  │ │session_id   PK  │
│totp_enabled     │ │user_id      FK  │ │user_id      FK  │ │user_id      FK  │
│totp_secret_enc  │ │status           │ │requested_at     │ │workspace_id FK  │
│backup_codes_hash│ │requested_at     │ │scheduled_at     │ │refresh_hash     │
│enabled_at       │ │completed_at     │ │cancelled_at     │ │device_info      │
│created_at       │ │download_url     │ │processed_at     │ │ip_address       │
│updated_at       │ │expires_at       │ │status           │ │user_agent       │
└─────────────────┘ └─────────────────┘ └─────────────────┘ │location   [NEW] │
                                                            │created_at       │
                                                            │last_used_at     │
                                                            │expires_at       │
                                                            │revoked_at       │
                                                            └─────────────────┘
```

## Entity Definitions

### 1. User (Extended)

**Purpose**: Core user identity with profile, preferences, and settings

**New Fields**:

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| avatar_url | VARCHAR(500) | Optional | URL to profile photo (presigned R2 URL) |
| job_title | VARCHAR(100) | Optional, max 100 chars | Professional title |
| phone | VARCHAR(50) | Optional, E.164 format | Contact phone number |
| timezone | VARCHAR(50) | IANA timezone string | User's timezone (e.g., "Asia/Kolkata") |
| bio | TEXT | Optional, max 500 chars | Short biography |
| notification_preferences | JSONB | NOT NULL, default {} | Email/in-app notification toggles |
| privacy_settings | JSONB | NOT NULL, default {} | Analytics, public profile toggles |
| last_password_changed_at | TIMESTAMPTZ | Optional | Last password change timestamp |
| deletion_requested_at | TIMESTAMPTZ | Optional | When deletion was requested |

**Notification Preferences Schema**:
```json
{
  "email": {
    "gallery_activity": true,
    "client_interactions": true,
    "system_alerts": true,
    "marketing": false
  },
  "in_app": {
    "gallery_activity": true,
    "client_interactions": true,
    "system_alerts": true,
    "marketing": true
  }
}
```

**Privacy Settings Schema**:
```json
{
  "analytics_enabled": true,
  "public_profile_enabled": true
}
```

**Validation Rules**:
- display_name: 1-100 characters, trimmed, no HTML
- email: Valid email format (RFC 5321)
- phone: E.164 format when provided
- timezone: Valid IANA timezone identifier
- bio: Maximum 500 characters

---

### 2. User TOTP Settings

**Purpose**: Store two-factor authentication configuration per user

**Table**: `user_totp_settings`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| user_id | UUID | PK, FK users.user_id ON DELETE CASCADE | User reference |
| totp_enabled | BOOLEAN | NOT NULL, default FALSE | Whether 2FA is active |
| totp_secret_encrypted | BYTEA | Optional | AES-256-GCM encrypted TOTP secret |
| backup_codes_hashed | TEXT[] | Optional | Argon2-hashed backup codes |
| totp_enabled_at | TIMESTAMPTZ | Optional | When 2FA was enabled |
| created_at | TIMESTAMPTZ | NOT NULL, default NOW() | Record creation |
| updated_at | TIMESTAMPTZ | NOT NULL, default NOW() | Last update |

**State Transitions**:
```
[no record] → setup_initiated (secret generated) → enabled (verified)
    enabled → disabled (requires password + code)
```

**Validation Rules**:
- totp_secret: 20 bytes (160 bits) base32 encoded
- backup_codes: 8 codes, 8 characters each, alphanumeric
- Can only enable after successful code verification

---

### 3. Data Export Request

**Purpose**: Track GDPR data export requests

**Table**: `data_export_requests`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| export_id | UUID | PK, default gen_random_uuid() | Request identifier |
| user_id | UUID | FK users.user_id ON DELETE CASCADE | Requesting user |
| status | VARCHAR(20) | NOT NULL, default 'pending' | Current status |
| requested_at | TIMESTAMPTZ | NOT NULL, default NOW() | Request timestamp |
| completed_at | TIMESTAMPTZ | Optional | Completion timestamp |
| download_url | TEXT | Optional | Presigned URL for download |
| expires_at | TIMESTAMPTZ | Optional | When download link expires |

**Status Values**: `pending`, `processing`, `completed`, `failed`, `expired`

**State Transitions**:
```
pending → processing → completed → expired
          processing → failed
```

**Validation Rules**:
- One active request per user at a time
- Rate limit: 1 request per 24 hours per user
- Download link expires after 7 days

---

### 4. Account Deletion Request

**Purpose**: Track account deletion requests with grace period

**Table**: `account_deletion_requests`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| request_id | UUID | PK, default gen_random_uuid() | Request identifier |
| user_id | UUID | FK users.user_id | User requesting deletion |
| requested_at | TIMESTAMPTZ | NOT NULL, default NOW() | Request timestamp |
| scheduled_deletion_at | TIMESTAMPTZ | NOT NULL | When deletion will occur |
| cancelled_at | TIMESTAMPTZ | Optional | If user cancelled |
| processed_at | TIMESTAMPTZ | Optional | When deletion completed |
| status | VARCHAR(20) | NOT NULL, default 'pending' | Current status |

**Status Values**: `pending`, `cancelled`, `completed`

**State Transitions**:
```
pending → cancelled (user logs in during grace period)
pending → completed (after 14 days, user didn't cancel)
```

**Validation Rules**:
- scheduled_deletion_at = requested_at + 14 days
- Only one pending request per user
- Cancellation requires login (implicit via session validation)

---

### 5. Session (Extended)

**Purpose**: Track active login sessions with location data

**Modified Table**: `sessions` (add `location` column)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| location | JSONB | Optional | Geolocation data from IP |

**Location Schema**:
```json
{
  "country": "India",
  "country_code": "IN",
  "city": "Mumbai",
  "region": "Maharashtra"
}
```

---

## Indexes

```sql
-- User lookups
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_deletion_requested ON users(deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;

-- TOTP settings
CREATE INDEX idx_user_totp_user ON user_totp_settings(user_id);

-- Export requests
CREATE INDEX idx_data_export_user_status ON data_export_requests(user_id, status);
CREATE INDEX idx_data_export_expires ON data_export_requests(expires_at) WHERE status = 'completed';

-- Deletion requests
CREATE INDEX idx_account_deletion_user ON account_deletion_requests(user_id) WHERE status = 'pending';
CREATE INDEX idx_account_deletion_scheduled ON account_deletion_requests(scheduled_deletion_at) WHERE status = 'pending';
```

---

## Migration Strategy

**Migration File**: `0037_user_profile_settings.py`

**Order of Operations**:
1. Add new columns to users table (nullable or with defaults)
2. Create user_totp_settings table
3. Create data_export_requests table
4. Create account_deletion_requests table
5. Add location column to sessions table
6. Create indexes
7. Set default values for existing users' notification_preferences and privacy_settings

**Rollback Safety**: All additions are nullable or have defaults, allowing safe rollback.
