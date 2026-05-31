-- Asset encryption metadata for originals and WebP derivatives.
-- Storage bytes are encrypted by the S3/B2 provider via STORAGE_SSE_MODE;
-- these columns make that state queryable and auditable per object row.

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS encryption_algo TEXT,
    ADD COLUMN IF NOT EXISTS encryption_version INTEGER NOT NULL DEFAULT 0;

ALTER TABLE asset_derivatives
    ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS encryption_algo TEXT,
    ADD COLUMN IF NOT EXISTS encryption_version INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_asset_derivatives_encrypted
    ON asset_derivatives (is_encrypted)
    WHERE is_encrypted = true;
