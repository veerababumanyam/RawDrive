CREATE TABLE IF NOT EXISTS gallery_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_hero BOOLEAN NOT NULL DEFAULT false,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gallery_assets_gallery_asset_unique UNIQUE (gallery_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_assets_gallery_id ON gallery_assets(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_assets_asset_id ON gallery_assets(asset_id);
