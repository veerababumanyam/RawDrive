# Data Model: Fix Gallery PIN and Password Persistence

**Feature**: 007-fix-gallery-pin-password
**Date**: 2025-12-28

## Entity Changes

### Gallery (Modified)

The `galleries` table is extended with encrypted credential storage.

#### New Columns

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `password_encrypted` | BYTEA | YES | AES-256-GCM encrypted password (ciphertext + auth tag) |
| `password_iv` | VARCHAR(24) | YES | Base64-encoded 12-byte initialization vector |
| `pin_encrypted` | BYTEA | YES | AES-256-GCM encrypted PIN (ciphertext + auth tag) |
| `pin_iv` | VARCHAR(24) | YES | Base64-encoded 12-byte initialization vector |

#### Existing Columns (Unchanged)

| Column | Type | Description |
|--------|------|-------------|
| `password_hash` | VARCHAR(255) | Argon2id hash for verification |
| `pin_hash` | VARCHAR(255) | Argon2id hash for verification |

#### Column Relationships

```
password_hash       ←→  password_encrypted, password_iv
(verification)          (reveal feature)

pin_hash            ←→  pin_encrypted, pin_iv
(verification)          (reveal feature)
```

#### Invariants

1. If `password_hash` is set, both `password_encrypted` and `password_iv` should be set (for new credentials)
2. If `password_hash` is NULL, `password_encrypted` and `password_iv` must be NULL
3. Same invariants apply to PIN columns
4. Legacy galleries may have `password_hash` without `password_encrypted` (migration note)

### Encryption Metadata

The encryption uses workspace-scoped keys derived via HKDF-SHA256.

| Property | Value |
|----------|-------|
| Algorithm | AES-256-GCM |
| Key Derivation | HKDF-SHA256 with workspace_id |
| IV Length | 12 bytes (96 bits) |
| Auth Tag | 16 bytes (128 bits, appended to ciphertext) |
| Key Source | Existing `EncryptionService` |

## API Types

### GalleryCredentialsResponse

Response from `GET /galleries/{id}/credentials`:

```typescript
interface GalleryCredentialsResponse {
  password: string | null;  // Decrypted password, null if not set
  pin: string | null;       // Decrypted PIN, null if not set
  has_password: boolean;    // True if password_hash is set
  has_pin: boolean;         // True if pin_hash is set
  password_recoverable: boolean;  // True if encrypted version exists
  pin_recoverable: boolean;       // True if encrypted version exists
}
```

### GalleryCredentialsRequest (for update)

The existing `GalleryUpdateRequest` handles credential updates:

```typescript
interface GalleryUpdateRequest {
  // ... existing fields ...
  password?: string;       // Set new password
  remove_password?: boolean; // Remove password protection
  pin?: string;            // Set new PIN
  remove_pin?: boolean;    // Remove PIN protection
}
```

## State Transitions

### Password Lifecycle

```
                    ┌─────────────────┐
                    │   No Password   │
                    │ hash=NULL       │
                    │ encrypted=NULL  │
                    └────────┬────────┘
                             │ Set password
                             ▼
                    ┌─────────────────┐
                    │ Password Active │
                    │ hash=Argon2id   │
                    │ encrypted=AES   │
                    └────────┬────────┘
                             │ Update password
                             ▼
                    ┌─────────────────┐
                    │ Password Active │◄──┐
                    │ (new values)    │   │ Update again
                    └────────┬────────┘───┘
                             │ Remove password
                             ▼
                    ┌─────────────────┐
                    │   No Password   │
                    └─────────────────┘
```

### Legacy Password State

```
                    ┌─────────────────┐
                    │  Legacy Active  │
                    │ hash=Argon2id   │
                    │ encrypted=NULL  │  ← Cannot reveal original
                    └────────┬────────┘
                             │ Update password
                             ▼
                    ┌─────────────────┐
                    │ Password Active │
                    │ hash=Argon2id   │
                    │ encrypted=AES   │  ← Can reveal
                    └─────────────────┘
```

## Validation Rules

### Password Validation

| Rule | Constraint |
|------|------------|
| Min Length | 1 character (no empty passwords allowed when enabled) |
| Max Length | 128 characters |
| Characters | Any UTF-8 string |

### PIN Validation

| Rule | Constraint |
|------|------------|
| Min Length | 4 digits |
| Max Length | 6 digits |
| Characters | Numeric only (0-9) |
| Format | String representation (preserves leading zeros) |

## Migration Notes

### Migration 0046: Add Encrypted Credential Columns

```sql
-- Add encrypted credential columns to galleries table
ALTER TABLE galleries
ADD COLUMN IF NOT EXISTS password_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS password_iv VARCHAR(24),
ADD COLUMN IF NOT EXISTS pin_encrypted BYTEA,
ADD COLUMN IF NOT EXISTS pin_iv VARCHAR(24);

-- Add comments for documentation
COMMENT ON COLUMN galleries.password_encrypted IS 'AES-256-GCM encrypted password for reveal feature';
COMMENT ON COLUMN galleries.password_iv IS 'Base64-encoded 12-byte IV for password encryption';
COMMENT ON COLUMN galleries.pin_encrypted IS 'AES-256-GCM encrypted PIN for reveal feature';
COMMENT ON COLUMN galleries.pin_iv IS 'Base64-encoded 12-byte IV for PIN encryption';
```

### Data Migration

No data migration required. Existing galleries:
- Keep `password_hash`/`pin_hash` values
- Have NULL `password_encrypted`/`pin_encrypted` values
- Frontend shows "Original credential unavailable" on reveal attempt

### Rollback

```sql
-- Rollback migration 0046
ALTER TABLE galleries
DROP COLUMN IF EXISTS password_encrypted,
DROP COLUMN IF EXISTS password_iv,
DROP COLUMN IF EXISTS pin_encrypted,
DROP COLUMN IF EXISTS pin_iv;
```
