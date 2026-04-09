-- M12: Gallery Design Templates
CREATE TABLE IF NOT EXISTS gallery_design_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    preview_url TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_design_templates_workspace ON gallery_design_templates(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_design_templates_default ON gallery_design_templates(workspace_id, is_default) WHERE deleted_at IS NULL AND is_default = true;

-- Add cover_config column to galleries for cover photo settings
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cover_config JSONB DEFAULT '{}';

COMMENT ON TABLE gallery_design_templates IS 'Workspace-scoped reusable gallery design templates';
