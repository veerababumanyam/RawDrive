-- M22 E75: Workspace-level gallery defaults
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS gallery_defaults JSONB DEFAULT '{}';
-- Stores: default watermark_config, max_selections, email_share_template
