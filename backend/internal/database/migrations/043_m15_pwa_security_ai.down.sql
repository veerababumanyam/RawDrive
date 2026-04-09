-- Rollback M15

DROP INDEX IF EXISTS idx_assets_filename_trgm;
DROP TABLE IF EXISTS ai_search_queries;

ALTER TABLE assets DROP COLUMN IF EXISTS is_ai_pick;
ALTER TABLE assets DROP COLUMN IF EXISTS sharpness_score;
ALTER TABLE assets DROP COLUMN IF EXISTS ai_quality_score;
ALTER TABLE assets DROP COLUMN IF EXISTS burst_group_id;
ALTER TABLE assets DROP COLUMN IF EXISTS phash;
ALTER TABLE assets DROP COLUMN IF EXISTS ai_tags;

DROP TABLE IF EXISTS burst_groups;
DROP TABLE IF EXISTS content_flags;
DROP TABLE IF EXISTS consent_records;
