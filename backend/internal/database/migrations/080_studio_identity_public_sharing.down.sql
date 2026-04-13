ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_workspaces_brand_accent_hex;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS fk_workspaces_logo_asset;

DROP INDEX IF EXISTS idx_workspaces_logo_asset_id;

ALTER TABLE workspaces
    DROP COLUMN IF EXISTS logo_metadata,
    DROP COLUMN IF EXISTS logo_asset_id,
    DROP COLUMN IF EXISTS public_branding_enabled,
    DROP COLUMN IF EXISTS brand_accent_color,
    DROP COLUMN IF EXISTS brand_name;
