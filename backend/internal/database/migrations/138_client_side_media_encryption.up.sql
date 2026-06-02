-- Client-side media encryption manifests for zero-plaintext storage.
-- The server stores ciphertext and metadata needed by authorized clients
-- to decrypt in the application; it never stores media keys.

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS media_encryption JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE asset_derivatives
    ADD COLUMN IF NOT EXISTS media_encryption JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS media_encryption JSONB,
    ADD COLUMN IF NOT EXISTS source_metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_assets_media_encryption_scheme
    ON assets ((media_encryption->>'scheme'))
    WHERE is_encrypted = true;

CREATE INDEX IF NOT EXISTS idx_asset_derivatives_media_encryption_scheme
    ON asset_derivatives ((media_encryption->>'scheme'))
    WHERE is_encrypted = true;
