-- M16 E50-S2: Rollback upload allowlist tokens

DROP INDEX IF EXISTS idx_upload_allowlist_tokens_expires_at;
DROP INDEX IF EXISTS idx_upload_allowlist_tokens_hash_active;
DROP TABLE IF EXISTS upload_allowlist_tokens;
