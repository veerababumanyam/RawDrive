-- M28: Studio Identity, Cover Photo, and Public Sharing
--
-- Extends the workspace business profile with public-facing studio identity.
-- Logo storage is intentionally asset-backed so logos follow the same
-- authenticated R2 upload/storage path as every other file in RawDrive.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS brand_name TEXT,
    ADD COLUMN IF NOT EXISTS brand_accent_color TEXT,
    ADD COLUMN IF NOT EXISTS public_branding_enabled BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS logo_asset_id UUID,
    ADD COLUMN IF NOT EXISTS logo_metadata JSONB NOT NULL DEFAULT '{}';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'workspaces'
          AND constraint_name = 'fk_workspaces_logo_asset'
    ) THEN
        ALTER TABLE workspaces
            ADD CONSTRAINT fk_workspaces_logo_asset
            FOREIGN KEY (logo_asset_id) REFERENCES assets(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'workspaces'
          AND constraint_name = 'chk_workspaces_brand_accent_hex'
    ) THEN
        ALTER TABLE workspaces
            ADD CONSTRAINT chk_workspaces_brand_accent_hex
            CHECK (
                brand_accent_color IS NULL
                OR brand_accent_color = ''
                OR brand_accent_color ~ '^#[0-9A-Fa-f]{6}$'
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspaces_logo_asset_id
    ON workspaces(logo_asset_id)
    WHERE logo_asset_id IS NOT NULL;

COMMENT ON COLUMN workspaces.brand_name IS 'Public-facing studio name for gallery, share, email, and invoice brand previews.';
COMMENT ON COLUMN workspaces.brand_accent_color IS 'Optional studio accent color, stored as #RRGGBB and gated by subscription tier on public surfaces.';
COMMENT ON COLUMN workspaces.public_branding_enabled IS 'Workspace toggle for applying studio identity to public gallery/share surfaces when plan allows customization.';
COMMENT ON COLUMN workspaces.logo_asset_id IS 'R2-backed logo asset id; avoids arbitrary public logo URLs and keeps storage rules consistent.';
COMMENT ON COLUMN workspaces.logo_metadata IS 'Sanitized logo metadata for settings UI: filename, content_type, size_bytes, storage_key, asset_id.';
