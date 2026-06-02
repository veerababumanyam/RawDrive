-- Down for migration 149.
--
-- Roll back the pgvector dimension to the historical 128-d shape. Any 512-d
-- rows are derived face-search index data and cannot be narrowed safely, so
-- they are truncated before the type change.

BEGIN;

DROP INDEX IF EXISTS idx_face_clusters_embedding_hnsw;

DO $$
DECLARE
    embedding_type TEXT;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod)
    INTO embedding_type
    FROM pg_attribute a
    WHERE a.attrelid = 'public.face_clusters'::regclass
      AND a.attname = 'embedding'
      AND NOT a.attisdropped;

    IF embedding_type IS DISTINCT FROM 'vector(128)' THEN
        TRUNCATE TABLE face_clusters;
        ALTER TABLE face_clusters ALTER COLUMN embedding TYPE vector(128);
    END IF;
END $$;

ALTER TABLE face_clusters
    ALTER COLUMN source SET DEFAULT 'gemini';

CREATE INDEX IF NOT EXISTS idx_face_clusters_embedding_hnsw
    ON face_clusters USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMIT;
