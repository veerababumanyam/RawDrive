-- M15: Gallery PWA, Security & AI Polish
-- Creates: consent_records, content_flags, ai_search_queries, burst_groups
-- Alters: assets (ai_tags, phash, burst_group_id)

-- Consent Records (privacy consent tracking)
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID REFERENCES galleries(id) ON DELETE CASCADE,
    visitor_email TEXT NOT NULL,
    visitor_ip TEXT,
    consent_type TEXT NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT false,
    language TEXT NOT NULL DEFAULT 'en',
    withdrawn_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_gallery ON consent_records(gallery_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_email ON consent_records(visitor_email);

-- Content Flags (moderation)
CREATE TABLE IF NOT EXISTS content_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID REFERENCES galleries(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
    flagged_by_email TEXT,
    flagged_by_user_id UUID REFERENCES users(id),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_flags_gallery ON content_flags(gallery_id);
CREATE INDEX IF NOT EXISTS idx_content_flags_status ON content_flags(status) WHERE status = 'pending';

-- Burst Groups (AI culling)
CREATE TABLE IF NOT EXISTS burst_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    name TEXT,
    best_pick_id UUID REFERENCES assets(id),
    asset_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_burst_groups_gallery ON burst_groups(gallery_id);

-- ALTER assets: add AI and burst columns
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_tags JSONB DEFAULT '[]';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS phash TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS burst_group_id UUID REFERENCES burst_groups(id);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_quality_score NUMERIC(5,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS sharpness_score NUMERIC(5,2);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS is_ai_pick BOOLEAN NOT NULL DEFAULT false;

-- AI Search Queries (search analytics)
CREATE TABLE IF NOT EXISTS ai_search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID REFERENCES galleries(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    query_type TEXT NOT NULL DEFAULT 'text',
    result_count INTEGER NOT NULL DEFAULT 0,
    visitor_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_search_queries_gallery ON ai_search_queries(gallery_id, created_at DESC);

-- Full-text search index on assets for performance (requires pg_trgm extension)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE INDEX IF NOT EXISTS idx_assets_filename_trgm ON assets USING gin (filename gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available — skipping trigram index';
END $$;
