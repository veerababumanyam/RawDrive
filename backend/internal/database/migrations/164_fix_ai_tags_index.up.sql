-- Migration 164: recreate idx_assets_ai_tags with the intended partial predicate
--
-- Q-6 root cause: two migrations create idx_assets_ai_tags with the SAME name but
-- DIVERGENT predicates.
--   019_assets_ai_columns.up.sql:10 created the LOOSER index:
--     CREATE INDEX IF NOT EXISTS idx_assets_ai_tags ON assets USING GIN (ai_tags) WHERE deleted_at IS NULL;
--   044_m11_deferred_features.up.sql:58 intended the STRICTER partial:
--     CREATE INDEX IF NOT EXISTS idx_assets_ai_tags ON assets USING gin (ai_tags) WHERE ai_tags != '[]'::jsonb AND deleted_at IS NULL;
-- Because 019 already claimed the name, 044's `IF NOT EXISTS` was a silent no-op,
-- so production has been running the looser, larger index and the stricter
-- predicate (which skips the common empty-tags rows) never landed.
--
-- Fix: drop the colliding name and recreate it as the intended stricter partial.
-- This is the single authoritative definition (migration 164 runs after both
-- 019 and 044), so the no-op masking can never recur.

DROP INDEX IF EXISTS idx_assets_ai_tags;

CREATE INDEX IF NOT EXISTS idx_assets_ai_tags
    ON assets USING gin (ai_tags)
    WHERE ai_tags != '[]'::jsonb AND deleted_at IS NULL;
