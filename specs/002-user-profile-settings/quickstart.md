# Quickstart: User Profile Settings

**Feature**: 002-user-profile-settings
**Date**: 2025-12-27

## Overview

This document provides a quickstart guide for implementing the User Profile Settings feature. It covers the key implementation steps, dependencies, and critical paths.

## Prerequisites

Before starting implementation, ensure:

1. **Backend dependencies installed**:
   ```bash
   cd backend
   # Add new dependencies to pyproject.toml
   uv add pyotp>=2.9 geoip2>=4.7
   ```

2. **Database is up to date**:
   ```bash
   npm run docker:dev:up  # Start PostgreSQL and Redis
   ```

3. **GeoLite2 database downloaded** (for session location):
   - Download from MaxMind: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data
   - Place `GeoLite2-City.mmdb` in `backend/data/geoip/`

## Implementation Order

### Phase 1: Database Migration (Day 1)

**File**: `backend/migrations/versions/0037_user_profile_settings.py`

```python
"""User profile settings schema extensions.

Revision ID: 0037
Create Date: 2025-12-27
"""

from alembic import op

revision = "0037"
down_revision = "0036"  # Update to actual previous migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Extend users table
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS job_title VARCHAR(100),
        ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
        ADD COLUMN IF NOT EXISTS bio TEXT,
        ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": {"gallery_activity": true, "client_interactions": true, "system_alerts": true, "marketing": false}, "in_app": {"gallery_activity": true, "client_interactions": true, "system_alerts": true, "marketing": true}}',
        ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"analytics_enabled": true, "public_profile_enabled": true}',
        ADD COLUMN IF NOT EXISTS last_password_changed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
    """)

    # 2. Create TOTP settings table
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_totp_settings (
            user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
            totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            totp_secret_encrypted BYTEA,
            backup_codes_hashed TEXT[],
            totp_enabled_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)

    # 3. Create data export requests table
    op.execute("""
        CREATE TABLE IF NOT EXISTS data_export_requests (
            export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ,
            download_url TEXT,
            expires_at TIMESTAMPTZ
        );
    """)

    # 4. Create account deletion requests table
    op.execute("""
        CREATE TABLE IF NOT EXISTS account_deletion_requests (
            request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id),
            requested_at TIMESTAMPTZ DEFAULT NOW(),
            scheduled_deletion_at TIMESTAMPTZ NOT NULL,
            cancelled_at TIMESTAMPTZ,
            processed_at TIMESTAMPTZ,
            status VARCHAR(20) NOT NULL DEFAULT 'pending'
        );
    """)

    # 5. Add location to sessions table
    op.execute("""
        ALTER TABLE sessions
        ADD COLUMN IF NOT EXISTS location JSONB;
    """)

    # 6. Create indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_deletion ON users(deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;")
    op.execute("CREATE INDEX IF NOT EXISTS idx_data_export_user ON data_export_requests(user_id, status);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_account_deletion_pending ON account_deletion_requests(scheduled_deletion_at) WHERE status = 'pending';")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_account_deletion_pending;")
    op.execute("DROP INDEX IF EXISTS idx_data_export_user;")
    op.execute("DROP INDEX IF EXISTS idx_users_deletion;")
    op.execute("ALTER TABLE sessions DROP COLUMN IF EXISTS location;")
    op.execute("DROP TABLE IF EXISTS account_deletion_requests;")
    op.execute("DROP TABLE IF EXISTS data_export_requests;")
    op.execute("DROP TABLE IF EXISTS user_totp_settings;")
    op.execute("""
        ALTER TABLE users
        DROP COLUMN IF EXISTS avatar_url,
        DROP COLUMN IF EXISTS job_title,
        DROP COLUMN IF EXISTS phone,
        DROP COLUMN IF EXISTS timezone,
        DROP COLUMN IF EXISTS bio,
        DROP COLUMN IF EXISTS notification_preferences,
        DROP COLUMN IF EXISTS privacy_settings,
        DROP COLUMN IF EXISTS last_password_changed_at,
        DROP COLUMN IF EXISTS deletion_requested_at;
    """)
```

Run migration:
```bash
cd backend && npm run db:migrate
```

### Phase 2: Backend Services (Days 2-4)

#### 2.1 TOTP Service

**File**: `backend/src/app/services/totp_service.py`

Key methods:
- `generate_secret()` → Returns base32 secret
- `get_provisioning_uri(secret, email)` → Returns otpauth:// URI
- `verify_code(secret, code)` → Returns bool
- `generate_backup_codes(count=8)` → Returns list of codes
- `hash_backup_code(code)` → Returns Argon2 hash
- `verify_backup_code(code, hashed_codes)` → Returns bool, remaining codes

#### 2.2 Notification Service

**File**: `backend/src/app/services/notification_service.py`

Key methods:
- `get_preferences(user_id)` → Returns NotificationPreferences
- `update_preferences(user_id, updates)` → Returns updated preferences
- `should_send_notification(user_id, category, channel)` → Returns bool

#### 2.3 Data Export Service

**File**: `backend/src/app/services/data_export_service.py`

Key methods:
- `request_export(user_id)` → Creates export request, enqueues job
- `get_export_status(user_id)` → Returns latest export request
- `generate_export(export_id)` → Background job: collects data, creates ZIP

#### 2.4 Account Deletion Service

**File**: `backend/src/app/services/account_deletion_service.py`

Key methods:
- `request_deletion(user_id, password)` → Creates deletion request
- `cancel_deletion(user_id)` → Cancels pending request
- `process_scheduled_deletions()` → Cron job: processes expired grace periods

### Phase 3: API Endpoints (Days 3-5)

#### 3.1 Extend Users API

**File**: `backend/src/app/api/v1/users.py`

Extend existing endpoints:
- `GET /users/me` → Add new profile fields to response
- `PATCH /users/me` → Handle new profile fields

#### 3.2 New User Settings API

**File**: `backend/src/app/api/v1/user_settings.py`

New router with endpoints:
- Password: `POST /users/me/password`
- 2FA: `POST /users/me/2fa/setup`, `POST /users/me/2fa/verify`, etc.
- Notifications: `GET/PATCH /users/me/notifications`
- Privacy: `GET/PATCH /users/me/privacy`
- Export: `POST/GET /users/me/export`
- Deletion: `POST/DELETE /users/me/delete`

### Phase 4: Frontend Pages (Days 5-8)

#### 4.1 Profile Settings Page

**File**: `frontend/src/pages/workspace/settings/ProfileSettingsPage.tsx`

Components:
- Profile form (display_name, job_title, phone, timezone, bio)
- Avatar uploader with crop
- Email change section

#### 4.2 Security Settings Page

**File**: `frontend/src/pages/workspace/settings/SecuritySettingsPage.tsx`

Components:
- Change password form
- 2FA setup wizard
- Active sessions list

#### 4.3 Notification Settings Page

**File**: `frontend/src/pages/workspace/settings/NotificationSettingsPage.tsx`

Components:
- Notification category toggles (email/in-app)
- Save confirmation

#### 4.4 Privacy Settings Page

**File**: `frontend/src/pages/workspace/settings/PrivacySettingsPage.tsx`

Components:
- Analytics toggle
- Public profile toggle
- Data export button
- Privacy policy links

#### 4.5 Danger Zone Page

**File**: `frontend/src/pages/workspace/settings/DangerZonePage.tsx`

Components:
- Delete account modal with confirmation

### Phase 5: Integration & Testing (Days 7-9)

#### 5.1 Backend Tests

```bash
cd backend && pytest tests/unit/services/test_totp_service.py -v
cd backend && pytest tests/integration/api/test_user_settings.py -v
```

#### 5.2 Frontend Tests

```bash
cd frontend && npm test -- ProfileSettingsPage
```

## Critical Implementation Notes

### Security Checklist

- [ ] TOTP secrets encrypted at rest (pgcrypto)
- [ ] Backup codes hashed with Argon2id
- [ ] Password change invalidates all other sessions
- [ ] 2FA disable requires password + TOTP code
- [ ] Rate limit on export requests (1/24h)
- [ ] Password policy enforced on backend (not just frontend)
- [ ] Email change requires password verification
- [ ] Account deletion requires email + password confirmation

### Audit Logging

Add audit log entries for:
- Password changed
- 2FA enabled/disabled
- Session terminated
- Data export requested
- Account deletion requested/cancelled

### Performance Considerations

- Cache notification preferences in Redis (5 min TTL)
- Lazy load session location (fetch on demand, not on list)
- Avatar upload: process thumbnails async via BullMQ

## Routes Configuration

Add to `frontend/src/router/routes.tsx`:

```typescript
// Settings sub-routes
{
  path: 'settings/profile',
  element: <LazyPage component={ProfileSettingsPage} />,
},
{
  path: 'settings/security',
  element: <LazyPage component={SecuritySettingsPage} />,
},
{
  path: 'settings/notifications',
  element: <LazyPage component={NotificationSettingsPage} />,
},
{
  path: 'settings/privacy',
  element: <LazyPage component={PrivacySettingsPage} />,
},
{
  path: 'settings/account',
  element: <LazyPage component={DangerZonePage} />,
},
```

## Environment Variables

No new environment variables required. Feature uses existing:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `R2_*` - Storage for avatars
- `JWT_*` - Token signing

## Next Steps

After completing implementation:

1. Run `/speckit.tasks` to generate detailed task breakdown
2. Create GitHub issues from tasks
3. Implement in priority order (P1 → P2 → P3)
4. Code review each component before merge
5. QA testing before release
