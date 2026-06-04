-- Migration 164 (down): revert idx_assets_ai_tags to the pre-164 definition.
--
-- Faithful reversal: before migration 164, the index that actually existed on a
-- fresh database was the LOOSER one created by 019_assets_ai_columns.up.sql:10
-- (044's stricter CREATE was a silent no-op under IF NOT EXISTS). So rolling 164
-- back restores exactly that 019 definition.

DROP INDEX IF EXISTS idx_assets_ai_tags;

CREATE INDEX IF NOT EXISTS idx_assets_ai_tags
    ON assets USING GIN (ai_tags)
    WHERE deleted_at IS NULL;
