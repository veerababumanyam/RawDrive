DROP INDEX IF EXISTS idx_asset_derivatives_encrypted;

ALTER TABLE asset_derivatives
    DROP COLUMN IF EXISTS encryption_version,
    DROP COLUMN IF EXISTS encryption_algo,
    DROP COLUMN IF EXISTS is_encrypted;

ALTER TABLE assets
    DROP COLUMN IF EXISTS encryption_version,
    DROP COLUMN IF EXISTS encryption_algo;
