# Research: Fix Gallery PIN and Password Persistence

**Feature**: 007-fix-gallery-pin-password
**Date**: 2025-12-28

## Research Questions

### 1. Credential Storage Strategy

**Question**: How should we store credentials to enable both verification (hashing) and reveal (retrievable plaintext)?

**Decision**: Store encrypted plaintext alongside hash

**Rationale**:
- **Security**: Using existing `EncryptionService` with AES-256-GCM and workspace-scoped key derivation
- **Separation of concerns**: Hashes for verification (existing flow), encrypted plaintext for reveal (new flow)
- **Backward compatibility**: Existing `password_hash` and `pin_hash` columns remain unchanged
- **Key management**: Leverage existing HKDF-SHA256 key derivation with master key rotation support

**Alternatives Considered**:

| Alternative | Rejected Because |
|-------------|------------------|
| Store plaintext only (no hash) | Breaks existing verification flow; less secure for verification |
| Use reversible encryption only | Adds complexity; no benefit over dual storage |
| No reveal feature (masked only) | User explicitly requested reveal functionality |

### 2. Database Schema Design

**Question**: What columns should be added to the galleries table?

**Decision**: Add 4 new columns with encryption metadata

```sql
password_encrypted BYTEA,      -- AES-256-GCM encrypted password
password_iv       VARCHAR(24), -- Base64-encoded 12-byte IV
pin_encrypted     BYTEA,       -- AES-256-GCM encrypted PIN
pin_iv            VARCHAR(24)  -- Base64-encoded 12-byte IV
```

**Rationale**:
- IV stored per-credential for proper GCM semantics (unique nonce per encryption)
- Auth tag included in ciphertext (standard AESGCM pattern in Python cryptography library)
- BYTEA for binary data storage (PostgreSQL native type)
- VARCHAR(24) for base64-encoded 12-byte IV

**Alternatives Considered**:

| Alternative | Rejected Because |
|-------------|------------------|
| Single JSONB column with all encryption data | More complex to query; harder to migrate |
| Store IV in ciphertext (prepended) | Harder to extract for debugging; less explicit |
| Use TEXT with base64 encoding | Adds encoding/decoding overhead on every operation |

### 3. API Endpoint Design

**Question**: How should the credential retrieval endpoint be structured?

**Decision**: New endpoint `GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/credentials`

**Rationale**:
- Separate endpoint for credentials (not embedded in gallery detail response)
- Requires explicit action to reveal credentials (security best practice)
- Allows fine-grained audit logging of credential access
- Keeps gallery detail response lightweight

**Response Schema**:
```json
{
  "password": "string | null",  // Plaintext if set, null if not set
  "pin": "string | null",       // Plaintext if set, null if not set
  "has_password": true,         // Quick check without revealing
  "has_pin": true               // Quick check without revealing
}
```

**Alternatives Considered**:

| Alternative | Rejected Because |
|-------------|------------------|
| Include credentials in gallery detail response | Always loads credentials; no audit separation |
| Query parameter on gallery detail | Mixes concerns; harder to audit |
| Separate endpoints per credential type | Over-engineering for simple use case |

### 4. Frontend State Management

**Question**: How should the frontend manage credential state?

**Decision**: Lazy-load credentials on eye toggle click

**Rationale**:
- Credentials not loaded on component mount (security best practice)
- API call only when user explicitly requests reveal
- Loading state shown during fetch
- Credentials cached in component state after first load

**State Flow**:
```
Initial: hasPassword=true, password=null, isLoading=false
User clicks eye: isLoading=true, fetch credentials
Fetch complete: password="secret123", isLoading=false, showPassword=true
User clicks eye again: showPassword=false (password still cached)
```

**Alternatives Considered**:

| Alternative | Rejected Because |
|-------------|------------------|
| Load credentials on mount | Security risk; unnecessary network calls |
| Never cache credentials | Poor UX; repeated API calls on toggle |
| Store in global state (Redux/Context) | Over-engineering; component-local is sufficient |

### 5. Migration Strategy

**Question**: How to handle existing galleries with only hashed credentials?

**Decision**: Null encrypted columns for existing galleries

**Rationale**:
- Existing galleries: `password_hash` set, `password_encrypted` null
- Frontend shows "Password set" indicator but reveal shows "Original password unavailable"
- New/updated passwords: Both hash and encrypted stored
- No data migration required (forward-compatible)

**User Experience**:
```
Existing gallery with password:
- Toggle: ON (password_hash exists)
- Field: Shows "••••••••" placeholder
- Eye click: Shows "Original password unavailable - set a new password to enable reveal"

New password set:
- Toggle: ON
- Field: Shows "••••••••" placeholder
- Eye click: Reveals actual password
```

### 6. Audit Logging

**Question**: What credential access events should be logged?

**Decision**: Log credential retrieval and modification events

**Events to Log**:
- `gallery.credentials.viewed` - User viewed decrypted credentials
- `gallery.password.updated` - Password changed
- `gallery.password.removed` - Password protection disabled
- `gallery.pin.updated` - PIN changed
- `gallery.pin.removed` - PIN protection disabled

**Log Fields**:
- `workspace_id`, `gallery_id`, `user_id`, `action`, `timestamp`, `ip_address`

## Dependencies

### Existing Infrastructure Used

| Component | Location | Purpose |
|-----------|----------|---------|
| `EncryptionService` | `backend/src/app/services/encryption_service.py` | AES-256-GCM encryption |
| `gallery_service.py` | `backend/src/app/services/gallery_service.py` | Existing credential handling |
| `AccessSettings.tsx` | `frontend/src/components/features/gallery/` | Password settings UI |
| `PinSettings.tsx` | `frontend/src/components/features/gallery/` | PIN settings UI |
| `hash_password()` | `backend/src/app/utils/security.py` | Argon2id hashing (unchanged) |

### New Components Required

| Component | Purpose |
|-----------|---------|
| Migration 0046 | Add encrypted credential columns |
| `get_gallery_credentials()` | Decrypt and return credentials |
| `getGalleryCredentials()` API | Frontend service method |
| Updated `AccessSettings` | Load/display password |
| Updated `PinSettings` | Load/display PIN |

## Security Considerations

1. **Encryption Key**: Uses existing master key with workspace-scoped derivation (HKDF-SHA256)
2. **Access Control**: Only workspace members with `gallery:read` permission can access credentials endpoint
3. **Audit Trail**: All credential access logged for compliance
4. **Transport Security**: HTTPS required (enforced by existing middleware)
5. **No Logging of Credentials**: Plaintext credentials never logged

## Open Questions (Resolved)

All research questions have been resolved. No outstanding clarifications needed.
