# Research: User Profile Settings

**Feature**: 002-user-profile-settings
**Date**: 2025-12-27
**Status**: Complete

## Research Summary

This document captures technical decisions and rationale for implementing the User Profile Settings feature in RawDrive.

---

## 1. TOTP Library Selection

### Decision: `pyotp`

### Rationale
- Industry-standard Python library for TOTP (RFC 6238) and HOTP (RFC 4226)
- Minimal dependencies, well-maintained, widely used
- Simple API: `pyotp.TOTP(secret).verify(code)` and `pyotp.TOTP(secret).provisioning_uri()`
- Compatible with Google Authenticator, Authy, 1Password, and all standard authenticator apps

### Alternatives Considered
| Library | Rejected Because |
|---------|-----------------|
| `python-otp` | Less maintained, fewer users |
| `oath-toolkit` | Requires C bindings, heavier dependency |
| Custom implementation | Security risk, unnecessary complexity |

### Integration Notes
- Add `pyotp>=2.9` to `backend/pyproject.toml` dependencies
- TOTP secrets stored encrypted in PostgreSQL using pgcrypto
- QR code generation via `pyotp.TOTP.provisioning_uri()` rendered as SVG on frontend

---

## 2. Password Change Security

### Decision: Current password verification + session invalidation

### Rationale
- Industry standard: Require current password before allowing change
- Security best practice: Invalidate all other sessions after password change
- User notification: Email alert sent on password change (SOC 2 compliance)
- Existing infrastructure: RawDrive already uses Argon2id hashing via `argon2-cffi`

### Implementation Pattern
```python
# Existing pattern in auth_service.py
from app.utils.security import verify_password, hash_password

async def change_password(user_id, current_password, new_password):
    # 1. Verify current password
    # 2. Validate new password meets policy
    # 3. Hash new password with Argon2id
    # 4. Update database
    # 5. Terminate all other sessions
    # 6. Send email notification
    # 7. Audit log
```

### Password Policy
- Minimum 12 characters (NIST SP 800-63B recommendation)
- At least one uppercase, one lowercase, one number, one special character
- No common passwords (check against breached password list optional future enhancement)
- No reuse of last 3 passwords (optional future enhancement)

---

## 3. IP Geolocation for Sessions

### Decision: MaxMind GeoLite2 (free) with optional upgrade path to GeoIP2

### Rationale
- GeoLite2 provides country/city-level accuracy sufficient for session display
- Free tier available, paid tier for higher accuracy
- Well-maintained Python library: `geoip2`
- Database file updated monthly (automated download recommended)

### Alternatives Considered
| Service | Rejected Because |
|---------|-----------------|
| ip-api.com | Rate limits, API dependency, privacy concerns |
| ipstack | Paid only, API dependency |
| ip2location | Less accurate free tier |

### Implementation Notes
- Add `geoip2>=4.7` to dependencies
- Store GeoLite2 database in backend or fetch on startup
- Cache lookup results in Redis (24-hour TTL)
- Fallback to "Unknown location" if lookup fails

---

## 4. Avatar Storage Strategy

### Decision: Reuse existing R2/BYOS storage with user-specific prefix

### Rationale
- RawDrive already has robust storage abstraction (R2 + BYOS support)
- Avatar key format: `users/{user_id}/avatar/{filename}` (consistent with asset patterns)
- Generate thumbnails: 64x64 (small), 128x128 (medium), 256x256 (large)
- Serve via presigned URLs (same as gallery assets)

### Implementation Notes
- Max file size: 5MB
- Supported formats: JPG, PNG, WebP
- Frontend crop using existing `react-easy-crop` dependency
- Backend validation: magic bytes check, dimension limits (max 4096x4096)

---

## 5. Notification Preferences Schema

### Decision: JSONB column on users table

### Rationale
- Flexible schema for future notification types
- Single read/write operation for all preferences
- PostgreSQL JSONB supports efficient partial updates
- No additional tables required

### Schema Design
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

### Alternative: Normalized Table
Rejected because:
- More complex queries for read/write all preferences
- Additional join operations
- Overkill for ~8 toggles per user

---

## 6. Data Export Implementation

### Decision: Async background job with BullMQ

### Rationale
- Export can be time-consuming (large galleries, many photos)
- User doesn't need to wait - receive email when ready
- Existing BullMQ infrastructure in RawDrive
- JSON format for machine readability (GDPR compliance)

### Export Contents
- User profile data
- Workspace memberships
- Galleries (metadata only)
- Client records (if workspace owner)
- Activity history (last 90 days)
- Notification preferences

### Implementation Notes
- Job queue: `data-export` queue in BullMQ
- Output: ZIP file with JSON files per category
- Storage: Temporary signed URL (7-day expiry)
- Rate limit: 1 export per user per 24 hours

---

## 7. Account Deletion Workflow

### Decision: Soft delete with 14-day grace period + scheduled hard delete

### Rationale
- GDPR compliance: Right to erasure
- User protection: Prevent accidental deletion
- Industry standard grace period (14 days matches major platforms)
- Scheduled job processes deletions daily

### State Machine
```
active → deletion_requested → deleted (after 14 days)
                ↓
          login_reactivates → active
```

### Data Handling
- Grace period: Soft delete flag, all data retained
- After grace period:
  - Delete: Profile data, preferences, sessions
  - Anonymize: Audit logs (replace user_id with "deleted_user")
  - Transfer: Workspace ownership (if applicable)
  - Retain: Billing records (legal requirement)

---

## 8. Database Schema Extensions

### Decision: Extend existing users table + new tables for 2FA and deletion

### New Columns on `users` Table
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Kolkata';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT '{"analytics_enabled": true, "public_profile_enabled": true}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_changed_at TIMESTAMPTZ;
```

### New Table: `user_totp_settings`
```sql
CREATE TABLE user_totp_settings (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    totp_enabled BOOLEAN DEFAULT FALSE,
    totp_secret_encrypted BYTEA,  -- Encrypted with app key
    backup_codes_hashed TEXT[],   -- Argon2 hashed
    totp_enabled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New Table: `account_deletion_requests`
```sql
CREATE TABLE account_deletion_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    scheduled_deletion_at TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pending'  -- pending, cancelled, completed
);
```

### New Table: `data_export_requests`
```sql
CREATE TABLE data_export_requests (
    export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    download_url TEXT,
    expires_at TIMESTAMPTZ
);
```

---

## 9. Frontend Component Strategy

### Decision: New settings pages with shared components

### Page Structure
| Route | Page Component | Description |
|-------|---------------|-------------|
| `/workspace/settings/profile` | ProfileSettingsPage | Name, email, avatar, bio |
| `/workspace/settings/security` | SecuritySettingsPage | Password, 2FA, sessions |
| `/workspace/settings/notifications` | NotificationSettingsPage | Email/in-app toggles |
| `/workspace/settings/privacy` | PrivacySettingsPage | Analytics, public profile, export |
| `/workspace/settings/account` | DangerZonePage | Delete account |

### Shared Components
- `AvatarUploader`: Image upload with crop (uses react-easy-crop)
- `TwoFactorSetup`: Step wizard for 2FA enrollment
- `SessionList`: Active sessions with terminate action
- `DeleteAccountModal`: Confirmation flow with password

### Form Handling
- React Hook Form for all forms (consistent with RawDrive patterns)
- Zod validation schemas matching backend Pydantic models
- Optimistic updates for toggles (notification preferences)

---

## 10. API Endpoint Design

### Decision: Extend `/api/v1/users/me` + new `/api/v1/users/me/settings/*`

### Endpoint Structure
```
Profile:
GET    /api/v1/users/me                    # Get full profile
PATCH  /api/v1/users/me                    # Update profile fields
POST   /api/v1/users/me/avatar             # Upload avatar
DELETE /api/v1/users/me/avatar             # Remove avatar

Security:
POST   /api/v1/users/me/password           # Change password
GET    /api/v1/users/me/sessions           # List sessions (existing)
DELETE /api/v1/users/me/sessions/{id}      # Terminate session (existing)
DELETE /api/v1/users/me/sessions           # Terminate all other (existing)
POST   /api/v1/users/me/2fa/setup          # Begin 2FA setup
POST   /api/v1/users/me/2fa/verify         # Verify and enable 2FA
DELETE /api/v1/users/me/2fa                # Disable 2FA
POST   /api/v1/users/me/2fa/backup-codes   # Regenerate backup codes

Notifications:
GET    /api/v1/users/me/notifications      # Get preferences
PATCH  /api/v1/users/me/notifications      # Update preferences

Privacy:
GET    /api/v1/users/me/privacy            # Get settings
PATCH  /api/v1/users/me/privacy            # Update settings
POST   /api/v1/users/me/export             # Request data export
GET    /api/v1/users/me/export/{id}        # Check export status

Account:
POST   /api/v1/users/me/delete             # Request deletion
DELETE /api/v1/users/me/delete             # Cancel deletion request
```

---

## Research Conclusion

All technical unknowns resolved. Ready for Phase 1: Design & Contracts.

**Key Dependencies to Add**:
- Backend: `pyotp>=2.9`, `geoip2>=4.7`
- Frontend: No new dependencies (using existing react-easy-crop)

**Migration Required**: Yes - new columns and tables needed

**Estimated Complexity**: Medium-High (multiple new services, UI components, background jobs)
