-- M22 E73: Per-photo analytics tracking
CREATE TABLE IF NOT EXISTS gallery_asset_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    views INTEGER NOT NULL DEFAULT 0,
    downloads INTEGER NOT NULL DEFAULT 0,
    favorites INTEGER NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    UNIQUE(gallery_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_asset_analytics_gallery ON gallery_asset_analytics(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_asset_analytics_views ON gallery_asset_analytics(gallery_id, views DESC);
