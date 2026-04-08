DROP INDEX IF EXISTS idx_assets_embedding_hnsw;
DROP INDEX IF EXISTS idx_assets_ai_tag_status;
DROP INDEX IF EXISTS idx_assets_ai_tags;

ALTER TABLE assets DROP COLUMN IF EXISTS ai_tagged_at;
ALTER TABLE assets DROP COLUMN IF EXISTS ai_tag_status;
ALTER TABLE assets DROP COLUMN IF EXISTS embedding;
ALTER TABLE assets DROP COLUMN IF EXISTS ai_quality_score;
ALTER TABLE assets DROP COLUMN IF EXISTS ai_caption;
ALTER TABLE assets DROP COLUMN IF EXISTS ai_tags;
