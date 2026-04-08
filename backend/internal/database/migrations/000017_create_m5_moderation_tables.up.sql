-- M5: Content Moderation tables
-- Migration 000017: moderation_queue, moderation_rules

CREATE TABLE IF NOT EXISTS moderation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(30) NOT NULL
        CHECK (content_type IN ('message', 'freelancer_listing', 'gear_listing', 'review')),
    content_id UUID NOT NULL,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    reason VARCHAR(30) NOT NULL DEFAULT 'reported'
        CHECK (reason IN ('reported', 'auto_flagged')),
    reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'warned')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_queue_status ON moderation_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_workspace ON moderation_queue(workspace_id);
CREATE INDEX IF NOT EXISTS idx_moderation_queue_content ON moderation_queue(content_type, content_id);

ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;

-- Admin-only access to moderation queue
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'moderation_queue'
          AND policyname = 'moderation_queue_admin'
    ) THEN
        CREATE POLICY moderation_queue_admin ON moderation_queue
            FOR ALL USING (true);
    END IF;
END $$;

-- Moderation Rules (configurable thresholds)
CREATE TABLE IF NOT EXISTS moderation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(30) NOT NULL
        CHECK (content_type IN ('message', 'freelancer_listing', 'gear_listing', 'review')),
    rule_type VARCHAR(30) NOT NULL CHECK (rule_type IN ('keyword', 'pattern', 'threshold')),
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_rules_type ON moderation_rules(content_type) WHERE is_active = true;

ALTER TABLE moderation_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'moderation_rules'
          AND policyname = 'moderation_rules_admin'
    ) THEN
        CREATE POLICY moderation_rules_admin ON moderation_rules
            FOR ALL USING (true);
    END IF;
END $$;

-- Seed default keyword rules
INSERT INTO moderation_rules (content_type, rule_type, config)
SELECT 'message', 'keyword', '{"keywords": ["spam", "scam", "fraud"], "action": "flag"}'
WHERE NOT EXISTS (
    SELECT 1
    FROM moderation_rules
    WHERE content_type = 'message'
      AND rule_type = 'keyword'
      AND config = '{"keywords": ["spam", "scam", "fraud"], "action": "flag"}'::jsonb
);

INSERT INTO moderation_rules (content_type, rule_type, config)
SELECT 'freelancer_listing', 'keyword', '{"keywords": ["spam", "fake"], "action": "flag"}'
WHERE NOT EXISTS (
    SELECT 1
    FROM moderation_rules
    WHERE content_type = 'freelancer_listing'
      AND rule_type = 'keyword'
      AND config = '{"keywords": ["spam", "fake"], "action": "flag"}'::jsonb
);

INSERT INTO moderation_rules (content_type, rule_type, config)
SELECT 'gear_listing', 'keyword', '{"keywords": ["stolen", "fake", "counterfeit"], "action": "flag"}'
WHERE NOT EXISTS (
    SELECT 1
    FROM moderation_rules
    WHERE content_type = 'gear_listing'
      AND rule_type = 'keyword'
      AND config = '{"keywords": ["stolen", "fake", "counterfeit"], "action": "flag"}'::jsonb
);
