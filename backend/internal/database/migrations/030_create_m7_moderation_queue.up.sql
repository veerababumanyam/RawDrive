-- M7 Admin Command Center: Moderation queue for content review
-- Migration: 030_create_m7_moderation_queue

BEGIN;

CREATE TABLE IF NOT EXISTS moderation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(30) NOT NULL CHECK (content_type IN ('gallery', 'asset', 'profile', 'freelancer', 'gear', 'message')),
    resource_id UUID NOT NULL,
    resource_url TEXT,
    reason VARCHAR(30) NOT NULL CHECK (reason IN ('nsfw', 'copyright', 'spam', 'reported', 'automated', 'other')),
    source VARCHAR(20) NOT NULL CHECK (source IN ('automated', 'user_report')),
    reporter_id UUID REFERENCES users(id),
    confidence NUMERIC(4,2),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
    actioned_by UUID REFERENCES users(id),
    actioned_at TIMESTAMPTZ,
    action_reason TEXT,
    sla_deadline TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    state_id INTEGER NOT NULL REFERENCES states(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_items_queue ON moderation_items (status, sla_deadline ASC)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_moderation_items_workspace ON moderation_items (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_items_type ON moderation_items (content_type, status);

COMMIT;
