-- Upgrade existing galleries table from M1 (had: id, workspace_id, name, created_at)
-- Add M2 columns for full gallery management
ALTER TABLE galleries RENAME COLUMN name TO title;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT '';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cover_asset_id UUID;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS gallery_type TEXT NOT NULL DEFAULT 'proofing';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS watermark_config JSONB DEFAULT '{}';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS max_selections INTEGER DEFAULT 0;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Add unique constraint on (workspace_id, slug)
CREATE UNIQUE INDEX IF NOT EXISTS idx_galleries_workspace_slug ON galleries(workspace_id, slug);
CREATE INDEX IF NOT EXISTS idx_galleries_workspace_id_active ON galleries(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_galleries_workspace_status ON galleries(workspace_id, status) WHERE deleted_at IS NULL;
