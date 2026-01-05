# Self-Service Features

> **Business Feature Documentation** | RawDrive Platform
> 
> **Purpose**: Enable users to manage their accounts independently, reducing administrative overhead and support tickets while ensuring GDPR/CCPA compliance.

---

## Executive Summary

RawDrive provides comprehensive self-service capabilities that empower users to manage their accounts, security settings, and data without requiring administrator intervention. These features reduce support costs, improve user satisfaction, and ensure regulatory compliance.

### Business Value

| Metric | Impact |
|--------|--------|
| Support Ticket Reduction | 40-60% fewer account-related tickets |
| User Satisfaction | Self-service availability 24/7 |
| Compliance | GDPR Article 17 (Right to Erasure) compliant |
| Security | User-controlled 2FA and session management |
| Data Portability | GDPR Article 20 compliant data export |

### Implementation Status

| Feature | Status | Backend | Frontend |
|---------|--------|---------|----------|
| Profile Management | ✅ Implemented | `users.py` | `ProfileSettingsPage.tsx` |
| Avatar Management | ✅ Implemented | `user_avatar_service.py` | `ProfileSettingsPage.tsx` |
| Password Change | ✅ Implemented | `auth_service.py` | `ProfileSettingsPage.tsx` |
| Password Reset | ⚠️ TODO | Endpoints exist, not implemented | `ForgotPasswordPage.tsx` |
| Email Change | ✅ Implemented | `auth_service.py` | `ProfileSettingsPage.tsx` |
| Email Verification | ✅ Implemented | `email_verification_service.py` | - |
| Two-Factor Auth (2FA) | ✅ Implemented | `totp_service.py` | `ProfileSettingsPage.tsx` |
| Session Management | ✅ Implemented | `session_service.py` | `ProfileSettingsPage.tsx` |
| Notification Preferences | ✅ Implemented | `notification_service.py` | `NotificationSettingsPage.tsx` |
| Privacy Settings | ✅ Implemented | `privacy_service.py` | `ProfileSettingsPage.tsx` |
| Data Export | ⚠️ Partial | `data_export_service.py` | - |
| Account Deletion | ✅ Implemented | `account_deletion_service.py` | `ProfileSettingsPage.tsx` |

---

## Feature Details

### 1. Profile Management

**Business Value**: Users can update their professional information without support intervention.

**Capabilities**:
- Display name management
- Job title and professional bio
- Phone number and contact info
- Timezone preferences (IANA format)
- Language preferences (12 Indian languages + English)

**API Endpoints**:
```
GET  /api/v1/users/me           # Get extended profile
PATCH /api/v1/users/me          # Update profile fields
```

**Updatable Fields**:
| Field | Validation | Example |
|-------|------------|---------|
| `display_name` | 1-100 chars | "Priya Sharma Photography" |
| `job_title` | Max 100 chars | "Wedding Photographer" |
| `phone` | Max 50 chars | "+91 98765 43210" |
| `timezone` | IANA timezone | "Asia/Kolkata" |
| `bio` | Max 500 chars | "Capturing moments since 2015..." |
| `preferred_language` | Language code | "hi-IN", "en-IN" |

**Technical Implementation**:
- Backend: `backend/src/app/api/v1/users.py` (lines 90-250)
- Frontend: `frontend/src/pages/settings/ProfileSettingsPage.tsx`
- Audit logging for all profile changes

---

### 2. Avatar Management

**Business Value**: Professional profile images enhance brand identity and client trust.

**Capabilities**:
- Upload avatar (JPEG, PNG, WebP up to 5MB)
- Automatic cropping and resizing
- Multiple size variants (512px, 256px, 128px, 64px)
- Delete avatar
- Stream avatar bytes (CORS-friendly)

**API Endpoints**:
```
POST   /api/v1/users/me/avatar           # Upload new avatar
DELETE /api/v1/users/me/avatar           # Remove avatar
GET    /api/v1/users/me/avatar           # Get avatar URL (redirect)
GET    /api/v1/users/me/avatar/stream    # Stream avatar bytes
GET    /api/v1/users/me/avatar/{size}    # Get specific size URL
```

**Size Variants**:
| Size | Dimensions | Use Case |
|------|------------|----------|
| `original` | 512x512 | Profile page |
| `medium` | 256x256 | Comments, activity |
| `small` | 128x128 | Navigation, lists |
| `tiny` | 64x64 | Compact views |

**Technical Implementation**:
- Backend: `backend/src/app/services/user_avatar_service.py`
- Storage: Cloudflare R2 with CDN delivery
- Processing: Automatic square crop, WebP optimization

---

### 3. Password Management

#### 3.1 Password Change (✅ Implemented)

**Business Value**: Users can update passwords without support tickets.

**Security Features**:
- Current password verification required
- Automatic invalidation of other sessions
- Audit logging for compliance
- Password strength validation (min 8 chars)

**API Endpoint**:
```
POST /api/v1/users/me/password
```

**Request Schema**:
```json
{
  "current_password": "string",
  "new_password": "string (min 8 chars)"
}
```

**Technical Implementation**:
- Backend: `backend/src/app/api/v1/users.py` (lines 750-800)
- Password hashing: bcrypt with 12 rounds
- Session invalidation: All sessions except current

#### 3.2 Password Reset (✅ Specified - Ready for Implementation)

**Business Value**: Critical self-service feature for account recovery.

**Current State**:
- Frontend UI exists: `frontend/src/pages/public/ForgotPasswordPage.tsx`
- API endpoints exist but return "not yet implemented"

**API Endpoints**:
```
POST /api/v1/auth/forgot-password    # Request reset email
POST /api/v1/auth/reset-password     # Reset with token
```

**Implementation Specification**:
1.  **Token Generation**:
    - Use `secrets.token_urlsafe(64)` for high entropy.
    - Token hash (SHA-256) stored in DB; plain token sent via email.
2.  **Email Delivery**:
    - Use `SendGridService` (template ID: `d-password-reset`).
    - Localized template based on user's `preferred_language`.
3.  **Security Controls**:
    - **Expiry**: 60 minutes hard limit.
    - **One-Time Use**: Token deleted immediately upon successful reset.
    - **Rate Limit**: 3 requests / hour / email + IP.
    - **Leaking**: Always return "202 Accepted" even if email not found (prevent user enumeration).

**Database Schema**:
```sql
CREATE TABLE password_reset_tokens (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of the token
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address INET, -- Requesting IP
  user_agent TEXT
);
CREATE INDEX idx_pwd_reset_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_pwd_reset_user_id ON password_reset_tokens(user_id);
```

---

### 4. Email Management

#### 4.1 Email Change (✅ Implemented)

**Business Value**: Users can update email without losing account access.

**Security Features**:
- Current password verification required
- Verification email sent to new address
- Change only completes after verification
- Prevents email hijacking

**API Endpoint**:
```
POST /api/v1/users/me/email
```

**Request Schema**:
```json
{
  "new_email": "string",
  "password": "string"
}
```

**Flow**:
1. User submits new email + current password
2. Password verified
3. Verification token generated
4. Email sent to new address
5. User clicks verification link
6. Email updated in database

**Technical Implementation**:
- Backend: `backend/src/app/api/v1/users.py` (lines 500-580)
- Service: `backend/src/app/services/auth_service.py`

#### 4.2 Email Verification (✅ Implemented)

**Business Value**: Ensures valid email addresses for communication.

**Capabilities**:
- Token-based verification (24-hour expiry)
- Resend with cooldown (60 seconds)
- Automatic cleanup of expired tokens

**API Endpoints**:
```
POST /api/v1/auth/verify-email       # Verify with token
POST /api/v1/auth/resend-verification # Resend verification email
```

**Technical Implementation**:
- Service: `backend/src/app/services/email_verification_service.py`
- Token storage: PostgreSQL + Redis cache
- Token length: 64 bytes URL-safe

**Error Handling**:
| Error | Code | HTTP Status |
|-------|------|-------------|
| Token expired | `TOKEN_EXPIRED` | 410 |
| Token invalid | `TOKEN_INVALID` | 400 |
| Token already used | `TOKEN_ALREADY_USED` | 409 |
| Email already verified | `EMAIL_ALREADY_VERIFIED` | 409 |
| Resend cooldown | `RESEND_COOLDOWN` | 429 |

---

### 5. Two-Factor Authentication (2FA)

**Business Value**: Enhanced account security, enterprise compliance requirement.

**Capabilities**:
- TOTP-based authentication (RFC 6238)
- QR code for authenticator app setup
- Backup codes for recovery (10 codes)
- Enable/disable with verification

**API Endpoints**:
```
GET    /api/v1/users/me/2fa              # Get 2FA status
POST   /api/v1/users/me/2fa/setup        # Initialize setup
POST   /api/v1/users/me/2fa/verify       # Verify and enable
DELETE /api/v1/users/me/2fa              # Disable 2FA
POST   /api/v1/users/me/2fa/backup-codes # Regenerate backup codes
```

**Setup Flow**:
1. User initiates setup → receives secret + QR code
2. User scans QR with authenticator app
3. User enters 6-digit code to verify
4. 2FA enabled, backup codes generated
5. Backup codes displayed once (user must save)

**Technical Implementation**:
- Service: `backend/src/app/services/totp_service.py`
- Algorithm: TOTP with 30-second window
- Backup codes: 10 single-use codes, bcrypt hashed

**Security Considerations**:
- Disable requires both password AND current TOTP code
- Backup code regeneration requires password
- All 2FA events audit logged

---

### 6. Session Management

**Business Value**: Users can monitor and control account access across devices.

**Capabilities**:
- List all active sessions
- View session details (device, IP, location)
- Terminate individual sessions
- Terminate all other sessions ("logout everywhere")
- Current session indicator

**API Endpoints**:
```
GET    /api/v1/users/me/sessions              # List sessions
DELETE /api/v1/users/me/sessions/{session_id} # Terminate specific
DELETE /api/v1/users/me/sessions              # Terminate all others
```

**Session Information**:
| Field | Description |
|-------|-------------|
| `session_id` | Unique identifier |
| `device_info` | Browser/device name |
| `ip_address` | Connection IP |
| `user_agent` | Full user agent string |
| `created_at` | Session start time |
| `last_used_at` | Last activity time |
| `is_current` | Whether this is current session |

**Technical Implementation**:
- Service: `backend/src/app/services/session_service.py`
- Storage: PostgreSQL `sessions` table + Redis for active sessions
- Token invalidation: Immediate via Redis

---

### 7. Notification Preferences

**Business Value**: Users control communication frequency, reducing unsubscribes.

**Capabilities**:
- Email notification toggles
- In-app notification toggles
- Category-based preferences
- Partial updates supported

**API Endpoints**:
```
GET   /api/v1/users/me/notifications    # Get preferences
PATCH /api/v1/users/me/notifications    # Update preferences
```

**Notification Categories**:
| Category | Description | Default |
|----------|-------------|---------|
| `gallery_activity` | Views, downloads, comments | ✅ On |
| `client_interactions` | Client messages, selections | ✅ On |
| `system_alerts` | Security, billing, maintenance | ✅ On |
| `marketing` | Product updates, tips, promotions | ❌ Off |

**Request Schema**:
```json
{
  "email": {
    "gallery_activity": true,
    "marketing": false
  },
  "in_app": {
    "client_interactions": true
  }
}
```

**Technical Implementation**:
- Service: `backend/src/app/services/notification_service.py`
- Frontend: `frontend/src/pages/settings/NotificationSettingsPage.tsx`

---

### 8. Privacy Settings

**Business Value**: GDPR/CCPA compliance, user trust.

**Capabilities**:
- Analytics opt-out
- Public profile visibility toggle

**API Endpoints**:
```
GET   /api/v1/users/me/privacy    # Get settings
PATCH /api/v1/users/me/privacy    # Update settings
```

**Settings**:
| Setting | Description | Default |
|---------|-------------|---------|
| `analytics_enabled` | Allow usage analytics | ✅ On |
| `public_profile_enabled` | Show public profile page | ✅ On |

**Technical Implementation**:
- Service: `backend/src/app/services/privacy_service.py`

---

### 9. Data Export (GDPR Article 20) (✅ Specified - Ready for Implementation)

**Business Value**: Regulatory compliance, user trust, data portability.

**Capabilities**:
- Request full data export
- Async processing (background worker)
- Secure download link (R2 presigned URL)

**Export Schema (JSON Structure)**:
The export will be a ZIP file containing `rawdrive_export.json` and associated media summaries.

```json
{
  "version": "1.0",
  "generated_at": "2026-01-05T10:00:00Z",
  "user": {
    "profile": { ... },
    "security": { "2fa_enabled": true, "sessions_active": 2 }
  },
  "workspaces": [
    {
      "id": "uuid",
      "galleries": [
        {
          "title": "Wedding",
          "asset_count": 500,
          "public_url": "..."
        }
      ]
    }
  ],
  "activity_log": [ ... ]
}
```

**Implementation Specification**:
1.  **Trigger**: `POST /api/v1/users/me/export` enqueues job `process_data_export` in `default` queue.
2.  **Worker**:
    - Aggregates data from `users`, `galleries`, `assets`, `audit_logs`.
    - Generates JSON file.
    - Uploads to `s3://rawdrive-exports/{user_id}/{export_id}.zip` (Lifecycle rule: 7 days).
3.  **Completion**:
    - Updates job status in DB.
    - Sends email with Download Link.

**API Endpoints**:
```
POST /api/v1/users/me/export    # Request export (202 Accepted)
GET  /api/v1/users/me/export    # Get export status
```

---

### 10. Account Deletion (GDPR Article 17)

**Business Value**: Regulatory compliance, user rights, trust.

**Capabilities**:
- Request account deletion with password verification
- 30-day grace period for recovery
- Cancel deletion during grace period
- GDPR-compliant data anonymization
- Audit trail for compliance

**API Endpoints**:
```
POST   /api/v1/users/me/deletion    # Request deletion (202 Accepted)
GET    /api/v1/users/me/deletion    # Get deletion status
DELETE /api/v1/users/me/deletion    # Cancel deletion request
```

**Deletion Flow**:
```
Day 0:  User requests deletion (password verified)
        → Account soft-deleted, access disabled
        → Confirmation email sent

Day 7:  Recovery reminder email

Day 25: Final recovery warning email

Day 30: Grace period ends
        → Worker processes deletion
        → Data anonymized
        → Personal data permanently deleted
        → Audit log retained for compliance
```

**Request Schema**:
```json
{
  "password": "string",
  "reason": "optional string for analytics"
}
```

**Response Schema**:
```json
{
  "deletion_id": "uuid",
  "status": "pending|cancelled|processing|completed|failed",
  "requested_at": "ISO datetime",
  "scheduled_deletion_at": "ISO datetime",
  "days_until_deletion": 30,
  "can_cancel": true,
  "message": "Account deletion scheduled..."
}
```

**Technical Implementation**:
- Service: `backend/src/app/services/account_deletion_service.py`
- Worker: Background job processes deletions after grace period
- Anonymization: Email hashed, names replaced, PII removed
- Retained: Audit logs, anonymized billing records

**Data Handling**:
| Data Type | Action |
|-----------|--------|
| User profile | Anonymized |
| Photos/videos | Permanently deleted |
| Galleries | Permanently deleted |
| Client data | Permanently deleted |
| Sessions | Deleted |
| 2FA settings | Deleted |
| Refresh tokens | Deleted |
| Audit logs | Retained (anonymized user reference) |
| Billing records | Retained (anonymized) |

---

## Security Considerations

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Password reset request | 3 | 1 hour |
| Account deletion | 10 | 15 minutes |
| Email verification resend | 1 | 60 seconds |
| Data export | 1 | 24 hours |

### Audit Logging

All self-service actions are logged:
- `USER_PROFILE_UPDATED`
- `USER_AVATAR_UPLOADED`
- `USER_AVATAR_DELETED`
- `USER_EMAIL_CHANGE_REQUESTED`
- `USER_SETTINGS_UPDATED`
- `USER_2FA_ENABLED`
- `USER_2FA_DISABLED`
- `USER_DELETION_REQUESTED`
- `USER_DELETION_CANCELLED`
- `USER_DELETION_COMPLETED`
- `DATA_EXPORT_REQUESTED`

### Password Verification

Critical actions require password confirmation:
- Account deletion
- 2FA disable
- Backup code regeneration
- Email change

---

## Integration Points

| Feature | Integration |
|---------|-------------|
| Authentication | JWT tokens, session management |
| Notifications | Email service (SendGrid) |
| Storage | Avatar storage (Cloudflare R2) |
| Audit | Audit service for compliance |
| Billing | Subscription status affects features |

---

## Frontend Components

| Component | Path | Features |
|-----------|------|----------|
| Profile Settings | `frontend/src/pages/settings/ProfileSettingsPage.tsx` | Profile, avatar, password, 2FA, sessions, deletion |
| Notification Settings | `frontend/src/pages/settings/NotificationSettingsPage.tsx` | Email/in-app preferences |
| Forgot Password | `frontend/src/pages/public/ForgotPasswordPage.tsx` | Password reset request |

---

## Recommendations for Completion

### Priority 1: Password Reset Flow
1. Create `password_reset_tokens` table migration
2. Implement `PasswordResetService` with token generation
3. Integrate SendGrid for reset emails
4. Connect frontend `ForgotPasswordPage.tsx` to API
5. Add rate limiting and audit logging

### Priority 2: Data Export Enhancement
1. Complete export job worker implementation
2. Add progress tracking
3. Implement download URL generation
4. Add email notification on completion

### Priority 3: Enhanced Session Management
1. Add geolocation for session display
2. Implement suspicious login detection
3. Add session activity timeline

---

## Related Documentation

- **Technical Spec**: `docs/Features/AUTHENTICATION_AND_SECURITY.md`
- **Data Retention**: `docs/Features/DATA_RETENTION_AND_CUSTOMER_REMOVAL.md`
- **Auth Architecture**: `docs/Business_Features/09_AUTHENTICATION_AUTHORIZATION.md`
- **Audit & Compliance**: `docs/Business_Features/13_AUDIT_COMPLIANCE.md`

---

## Document Metadata

**Last Updated**: January 5, 2026  
**Version**: 1.0  
**Owner**: RawDrive Product Team  
**Status**: Active
