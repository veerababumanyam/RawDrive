-- M3: Add AI-related columns to assets table

ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_tags JSONB NOT NULL DEFAULT '[]';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_caption TEXT;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_quality_score DECIMAL(5,3);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS embedding vector(768);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_tag_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS ai_tagged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assets_ai_tags ON assets USING GIN (ai_tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_ai_tag_status ON assets(ai_tag_status, created_at ASC) WHERE deleted_at IS NULL AND ai_tag_status IN ('pending', 'queued');

-- HNSW index for semantic search embeddings (768-dim Gemini)
CREATE INDEX IF NOT EXISTS idx_assets_embedding_hnsw
    ON assets USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
