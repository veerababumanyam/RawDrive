-- M11: Asset metadata table (ISS-008) + Albums (ISS-015)

-- Extended asset metadata for processing pipeline
ALTER TABLE assets ADD COLUMN IF NOT EXISTS processing_status VARCHAR(20) NOT NULL DEFAULT 'uploaded';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS processing_error TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS lifecycle_state VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS lqip_base64 TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_quality_score INTEGER;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS burst_group_id UUID;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS capture_date TIMESTAMPTZ;

CREATE INDEX idx_assets_processing_status ON assets (processing_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_lifecycle_state ON assets (lifecycle_state) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_burst_group ON assets (burst_group_id) WHERE burst_group_id IS NOT NULL;
CREATE INDEX idx_assets_capture_date ON assets (capture_date DESC) WHERE deleted_at IS NULL;

-- Asset derivatives table (ISS-009)
CREATE TABLE IF NOT EXISTS asset_derivatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    variant VARCHAR(50) NOT NULL,  -- 'thumb_sm', 'thumb_md', 'thumb_lg', 'cover_1920', 'cover_1280', 'cover_640', 'og_image', 'watermark'
    storage_key TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    format VARCHAR(20) NOT NULL DEFAULT 'jpeg',  -- jpeg, webp, avif, png
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_derivatives_asset ON asset_derivatives (asset_id);
CREATE UNIQUE INDEX idx_derivatives_asset_variant ON asset_derivatives (asset_id, variant);

-- Albums table (ISS-015)
CREATE TABLE IF NOT EXISTS albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES albums(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    smart_filter JSONB,
    asset_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_albums_gallery ON albums (gallery_id);
CREATE INDEX idx_albums_parent ON albums (parent_id) WHERE parent_id IS NOT NULL;

-- Album-asset junction
CREATE TABLE IF NOT EXISTS album_assets (
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (album_id, asset_id)
);

-- Gallery state machine (ISS-016)
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS gallery_state VARCHAR(20) NOT NULL DEFAULT 'draft';

CREATE INDEX idx_galleries_state ON galleries (gallery_state) WHERE deleted_at IS NULL;
CREATE INDEX idx_galleries_expires ON galleries (expires_at) WHERE expires_at IS NOT NULL AND gallery_state = 'shared';
