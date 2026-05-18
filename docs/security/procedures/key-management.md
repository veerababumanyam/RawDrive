# Key Management Procedures

**Version:** 1.0
**Effective Date:** 2026-04-12
**Owner:** Engineering Lead
**Review Cadence:** Annual

---

## 1. Key Inventory

| Key | Purpose | Algorithm | Storage | Rotation Cadence |
|---|---|---|---|---|
| PLATFORM_SETTINGS_KEK | Wraps per-row DEKs for platform_settings secrets | AES-256-GCM | Environment variable (hex-encoded, 64 chars) | Annual or on compromise |
| Per-row DEK | Encrypts individual secret values | AES-256-GCM | Stored wrapped (by KEK) in `dek_wrapped` column | Re-wrapped on KEK rotation |
| JWT signing key | Signs access + refresh tokens | HMAC-SHA256 | Environment variable | Annual or on compromise |
| GPG backup key | Encrypts nightly pg_dump backups | AES-256 (symmetric, SHA512 S2K, 65M iterations) | `deploy/scripts/backup-db.sh` passphrase in env | Annual |
| B2 storage credentials | S3-compatible API auth (Backblaze B2, managed backend) | HMAC (AWS Sig v4) | Environment variables (B2_KEY_ID, B2_APPLICATION_KEY) in `.env.cobolt` | Annual or on compromise |

## 2. KEK Rotation Procedure

The PLATFORM_SETTINGS_KEK wraps all Data Encryption Keys (DEKs) in `platform_settings`.
See `backend/internal/crypto/envelope.go` for implementation.

### Rotation Steps

1. **Generate new KEK:**
   ```bash
   # Generate 32 random bytes, hex-encoded (64 chars)
   openssl rand -hex 32
   ```

2. **Re-wrap all DEKs** (run as one-off migration or admin script):
   ```sql
   -- Pseudo-code: for each row in platform_settings where is_secret = true:
   -- 1. Decrypt dek_wrapped with OLD KEK
   -- 2. Re-encrypt dek_wrapped with NEW KEK
   -- 3. Update the row
   -- This does NOT re-encrypt the ciphertext — only the DEK wrapper changes.
   ```
   A Go script for this should be placed at `backend/cmd/rotate-kek/main.go`.

3. **Deploy new KEK:**
   - Update PLATFORM_SETTINGS_KEK in production environment
   - Restart the API service
   - Verify decryption works: `GET /api/v1/admin/settings/storage/r2_access_key_id`

4. **Retire old KEK:**
   - Old KEK value destroyed from all env files and secret stores
   - Document rotation in this file's amendment log

### Emergency Rotation (Credential Compromise)

If the KEK is believed compromised:
1. Follow steps 1-4 above immediately
2. Also rotate all B2 storage credentials (re-wrapped secrets may have been read)
3. File an incident report per `docs/runbooks/incident-response.md`

## 3. JWT Key Rotation

1. Generate new signing key
2. Deploy with dual-key validation (accept old + new for token lifetime)
3. After max token lifetime (refresh token expiry) passes, remove old key
4. Update environment variable

## 4. Amendment Log

| Date | Change | Approved By |
|---|---|---|
| 2026-04-12 | Initial procedure | Manyam Prasad |
