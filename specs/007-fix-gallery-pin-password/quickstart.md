# Quickstart: Fix Gallery PIN and Password Persistence

**Feature**: 007-fix-gallery-pin-password
**Date**: 2025-12-28

## Overview

This feature fixes gallery password and PIN settings to persist properly and be viewable by gallery owners. The implementation involves:

1. Database migration to add encrypted credential storage
2. Backend API endpoint to retrieve decrypted credentials
3. Frontend component updates to display existing credentials

## Prerequisites

- Docker containers running (`npm run docker:dev:up`)
- Backend and frontend development servers
- Access to a workspace with at least one gallery

## Implementation Order

### Phase 1: Database Migration

```bash
# Create migration file
cd backend
# Migration: 0046_gallery_credentials_encrypted.py
```

Run migration:
```bash
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" \
  PYTHONPATH=src alembic upgrade head
```

### Phase 2: Backend Changes

1. **Update `gallery_service.py`**:
   - Add `encrypt_gallery_credential()` method
   - Add `decrypt_gallery_credential()` method
   - Modify `update_gallery()` to store encrypted credentials alongside hashes

2. **Add API endpoint in `galleries.py`**:
   - `GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/credentials`
   - Returns decrypted password and PIN for authorized users

3. **Add audit logging**:
   - Log `gallery.credentials.viewed` event when credentials are retrieved

### Phase 3: Frontend Changes

1. **Update `galleryService.ts`**:
   - Add `getGalleryCredentials(workspaceId, galleryId)` API method

2. **Update `AccessSettings.tsx`**:
   - Add state for loaded password
   - Fetch credentials when eye toggle clicked
   - Display masked placeholder when password is set
   - Handle "not recoverable" state for legacy galleries

3. **Update `PinSettings.tsx`**:
   - Same changes as AccessSettings for PIN

## Testing Checklist

### Manual Testing

- [ ] Set new password on gallery, refresh page, verify masked indicator shows
- [ ] Click eye toggle, verify password is revealed
- [ ] Click eye toggle again, verify password is masked
- [ ] Update password, refresh, verify new password can be revealed
- [ ] Toggle off password protection, verify password is removed
- [ ] Repeat all tests for PIN
- [ ] Test legacy gallery (set password via direct DB update without encrypted columns)

### Automated Testing

```bash
# Backend tests
cd backend
PYTHONPATH=src pytest tests/unit/test_gallery_credentials.py -v

# Frontend tests
cd frontend
npm test -- AccessSettings.test.tsx
```

## API Usage Example

### Get Gallery Credentials

```bash
curl -X GET \
  "http://localhost:8000/api/v1/workspaces/${WORKSPACE_ID}/galleries/${GALLERY_ID}/credentials" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "password": "MySecretPassword123",
  "pin": "1234",
  "has_password": true,
  "has_pin": true,
  "password_recoverable": true,
  "pin_recoverable": true
}
```

### Update Gallery Password

```bash
curl -X PATCH \
  "http://localhost:8000/api/v1/workspaces/${WORKSPACE_ID}/galleries/${GALLERY_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"password": "NewPassword456"}'
```

## Troubleshooting

### Credential Not Revealed

**Symptom**: Eye toggle shows "Original password unavailable"

**Cause**: Gallery password was set before this feature (legacy)

**Solution**: Set a new password to enable reveal feature

### Encryption Error

**Symptom**: "Failed to decrypt credential" error

**Cause**: Missing or invalid `ENCRYPTION_MASTER_KEY` environment variable

**Solution**: Ensure `ENCRYPTION_MASTER_KEY` is set (64 hex characters)

### Permission Denied

**Symptom**: 403 error when accessing credentials endpoint

**Cause**: User lacks workspace permissions

**Solution**: Verify user has `gallery:read` permission for the workspace

## Rollback

If issues occur:

1. Revert frontend changes (components still work without new endpoint)
2. Rollback migration:
   ```bash
   DATABASE_URL="..." PYTHONPATH=src alembic downgrade -1
   ```
3. Revert backend API endpoint

Existing hash-based verification continues to work regardless of encrypted columns.
