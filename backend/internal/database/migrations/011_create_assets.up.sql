CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_key TEXT NOT NULL,
    storage_driver TEXT NOT NULL DEFAULT 'r2',
    width INTEGER,
    height INTEGER,
    blurhash TEXT,
    exif_data JSONB DEFAULT '{}',
    thumbnail_urls JSONB DEFAULT '{}',
    uploaded_by UUID REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'processing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT assets_storage_key_unique UNIQUE (storage_key)
);

CREATE INDEX IF NOT EXISTS idx_assets_workspace_id ON assets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_assets_workspace_status ON assets(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_content_type ON assets(workspace_id, content_type) WHERE deleted_at IS NULL;
