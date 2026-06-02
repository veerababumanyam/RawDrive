-- Retire the unused app-layer media encryption key path.
--
-- Current media encryption is storage-provider SSE, configured through
-- STORAGE_SSE_MODE and recorded on assets/asset_derivatives with
-- is_encrypted, encryption_algo, and encryption_version.

ALTER TABLE assets DROP COLUMN IF EXISTS encryption_key_id;

DROP TABLE IF EXISTS encryption_keys;
