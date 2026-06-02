DROP INDEX IF EXISTS idx_asset_derivatives_media_encryption_scheme;
DROP INDEX IF EXISTS idx_assets_media_encryption_scheme;

ALTER TABLE upload_sessions
    DROP COLUMN IF EXISTS source_metadata,
    DROP COLUMN IF EXISTS media_encryption;

ALTER TABLE asset_derivatives
    DROP COLUMN IF EXISTS media_encryption;

ALTER TABLE assets
    DROP COLUMN IF EXISTS media_encryption;
