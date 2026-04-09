-- M11 Deferred Features: HEIC tracking, encryption keys, plan tiers, advanced filters

-- Plan tier on workspaces (needed for BYOS enterprise gate)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS plan_tier VARCHAR(20) NOT NULL DEFAULT 'standard';
-- valid: 'standard', 'pro', 'enterprise'
CREATE INDEX IF NOT EXISTS idx_workspaces_plan_tier ON workspaces (plan_tier);

-- Encryption key envelope table (app-level encryption at rest)
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    encrypted_dek TEXT NOT NULL,         -- AES-256-GCM encrypted DEK (base64)
    key_version INTEGER NOT NULL DEFAULT 1,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'AES-256-GCM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_workspace ON encryption_keys (workspace_id, key_version DESC);

-- Track encryption per asset
ALTER TABLE assets ADD COLUMN IF NOT EXISTS encryption_key_id UUID REFERENCES encryption_keys(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_assets_encrypted ON assets (is_encrypted) WHERE is_encrypted = true;

-- BYOS configuration (persisted per workspace, enterprise only)
CREATE TABLE IF NOT EXISTS workspace_storage_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    driver VARCHAR(20) NOT NULL DEFAULT 's3',
    bucket VARCHAR(255) NOT NULL,
    region VARCHAR(50),
    endpoint TEXT,
    encrypted_access_key TEXT NOT NULL,
    encrypted_secret_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    test_passed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index: only one active config per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_storage_configs_active
    ON workspace_storage_configs (workspace_id) WHERE is_active = true;

-- Advanced asset organization: tags filter index, rating, color labels
ALTER TABLE assets ADD COLUMN IF NOT EXISTS rating INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS color_label VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS lens_model VARCHAR(255);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS focal_length VARCHAR(50);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS iso_value INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS aperture VARCHAR(20);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS shutter_speed VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_assets_rating ON assets (rating) WHERE rating > 0 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_color_label ON assets (color_label) WHERE color_label != '' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_lens ON assets (lens_model) WHERE lens_model IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_ai_tags ON assets USING gin (ai_tags) WHERE ai_tags != '[]'::jsonb AND deleted_at IS NULL;

-- Edge delivery cache tracking
CREATE TABLE IF NOT EXISTS edge_delivery_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    variant VARCHAR(50) NOT NULL,
    watermark_config JSONB,
    cache_key TEXT NOT NULL,
    cache_ttl_seconds INTEGER NOT NULL DEFAULT 3600,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edge_cache_asset_variant ON edge_delivery_cache (asset_id, variant);
