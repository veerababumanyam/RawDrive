-- M3: Duplicate detection groups and quality scoring

CREATE TABLE IF NOT EXISTS duplicate_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gallery_id   UUID REFERENCES galleries(id) ON DELETE SET NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'resolved', 'dismissed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duplicate_groups_workspace ON duplicate_groups(workspace_id, status);

ALTER TABLE duplicate_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY duplicate_groups_workspace_isolation ON duplicate_groups
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );

CREATE TABLE IF NOT EXISTS duplicate_group_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          UUID NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
    asset_id          UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    similarity_score  DECIMAL(5,4),
    is_representative BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_dup_members_group ON duplicate_group_members(group_id);

CREATE TABLE IF NOT EXISTS quality_scores (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id     UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sharpness    DECIMAL(5,3),
    exposure     DECIMAL(5,3),
    composition  DECIMAL(5,3),
    overall      DECIMAL(5,3),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quality_scores_asset ON quality_scores(asset_id);

ALTER TABLE quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY quality_scores_workspace_isolation ON quality_scores
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );
