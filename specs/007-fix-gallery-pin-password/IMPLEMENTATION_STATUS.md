# Implementation Status: Fix Gallery PIN and Password Persistence

**Date**: 2025-12-28
**Branch**: 007-fix-gallery-pin-password

## Completed Tasks

### Phase 1: Setup ✅
- [x] Created migration `0047_gallery_credentials_encrypted.py` adding:
  - `password_encrypted` (BYTEA)
  - `password_iv` (VARCHAR(24))
  - `pin_encrypted` (BYTEA)
  - `pin_iv` (VARCHAR(24))
- [x] Migration applied successfully
- [x] `GalleryCredentialsResponse` type added to frontend
- [x] `GalleryCredentialsResponse` schema added to backend

### Phase 2: Foundational ✅
- [x] `encrypt_gallery_credential()` method added to EncryptionService
- [x] `decrypt_gallery_credential()` method added to EncryptionService
- [x] `update_gallery` in galleries.py updated to store encrypted credentials
- [x] `update_gallery` clears encrypted columns when credentials removed
- [x] `get_gallery_credentials()` method added to GalleryService
- [x] `gallery_service.py` allowed fields updated for encrypted columns

### Phase 3: User Story 1 - View Status ✅
- [x] `GET /credentials` endpoint added to galleries.py
- [x] API method already existed in galleryService.ts
- [x] AccessSettings.tsx fetches credentials on mount
- [x] PinSettings.tsx fetches credentials on mount
- [x] Masked placeholder shown when credentials are set
- [x] Loading state handled while fetching

### Phase 4: User Story 2 - Reveal Credentials ✅
- [x] AccessSettings.tsx shows stored password on eye toggle
- [x] PinSettings.tsx shows stored PIN on eye toggle
- [x] Legacy credentials handled (eye toggle disabled)
- [x] Audit logging added for credential access

### Phase 5: User Story 3 - Update Credentials ✅
- [x] Typing new value shows new value (not stored)
- [x] Stored value shown when input empty
- [ ] Success toast feedback (parent component responsibility)

### Phase 6: User Story 4 - Remove Credentials ✅
- [x] Toggle off triggers `remove_password: true` / `remove_pin: true`
- [x] Backend clears all credential columns (hash + encrypted)

### Phase 7: Polish
- [x] Unicode preserved in encryption (UTF-8)
- [x] PIN stored as string (leading zeros preserved)
- [x] Network failure fallback implemented
- [x] PIN validation (4-6 digits) enforced

## Files Modified

### Backend
- `backend/migrations/versions/0047_gallery_credentials_encrypted.py` (NEW)
- `backend/src/app/services/encryption_service.py` (MODIFIED)
- `backend/src/app/services/gallery_service.py` (MODIFIED)
- `backend/src/app/api/v1/galleries.py` (MODIFIED)
- `backend/src/app/api/schemas.py` (MODIFIED)

### Frontend
- `frontend/src/types/gallery.ts` (MODIFIED)
- `frontend/src/components/features/gallery/AccessSettings.tsx` (MODIFIED)
- `frontend/src/components/features/gallery/PinSettings.tsx` (MODIFIED)

## How It Works

### Setting a New Password/PIN

1. User types password in AccessSettings or PIN in PinSettings
2. On save (via parent component), `PATCH /galleries/{id}` is called with `{ password: "..." }` or `{ pin: "..." }`
3. Backend in `galleries.py`:
   - Hashes credential with Argon2id → stored in `password_hash` / `pin_hash`
   - Encrypts credential with AES-256-GCM → stored in `password_encrypted` + `password_iv`
4. Credential persists across page reloads

### Revealing an Existing Password/PIN

1. Component fetches credentials on mount via `GET /galleries/{id}/credentials`
2. Backend decrypts stored credential using workspace-scoped key
3. Response includes plaintext password/PIN plus recoverability flags
4. When user clicks eye toggle, stored value is displayed

### Legacy Galleries

Galleries with passwords/PINs set before this feature will have:
- `password_hash` / `pin_hash` set (for verification)
- `password_encrypted` / `pin_encrypted` as NULL

For these galleries:
- Eye toggle is disabled with tooltip "Original password cannot be revealed (legacy)"
- User must set a new password/PIN to enable reveal feature

## Testing

```bash
# Verify backend compiles
cd backend && python3 -m py_compile src/app/services/encryption_service.py src/app/services/gallery_service.py src/app/api/v1/galleries.py

# Verify frontend compiles
cd frontend && npx tsc --noEmit --skipLibCheck

# Manual test:
# 1. Open gallery settings
# 2. Enable password protection
# 3. Enter password "test123"
# 4. Save changes
# 5. Refresh page
# 6. Click eye toggle - should see "test123"
```
