-- M19/M20: Gallery activity tracking (F-009 FR-F009-08)
-- Tracks gallery views, downloads, and selection events with anonymized visitor hashes.
-- No PII stored — visitor_hash is SHA256(IP + User-Agent).

CREATE TABLE IF NOT EXISTS gallery_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    visitor_hash VARCHAR(64) NOT NULL,
    asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
    event_type VARCHAR(20) NOT NULL DEFAULT 'view',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_views_gallery ON gallery_views(gallery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_views_asset ON gallery_views(asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gallery_views_event ON gallery_views(gallery_id, event_type);

COMMENT ON TABLE gallery_views IS 'Anonymized gallery activity tracking: views, downloads, selections';
COMMENT ON COLUMN gallery_views.visitor_hash IS 'SHA256(IP + User-Agent) — no PII stored';
COMMENT ON COLUMN gallery_views.event_type IS 'Event type: view, download, selection, extension_request';
