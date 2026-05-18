-- Rollback of 110. Restores face_clusters.embedding to vector(128) and
-- the original default source. Drops the workspace opt-in column.
--
-- Same destructive-on-embedding caveat applies — if a face-svc-based
-- pipeline has populated face_clusters with vector(512) rows after 110
-- ran, those rows are lost on rollback.

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM face_clusters;
  IF n > 0 THEN
    RAISE EXCEPTION
      'face_clusters has % rows — rollback of 110 is destructive on embedding column. '
      'Audit/back up the rows before re-running.', n;
  END IF;
END
$$;

DROP INDEX IF EXISTS idx_face_clusters_embedding_hnsw;

ALTER TABLE face_clusters DROP COLUMN embedding;
ALTER TABLE face_clusters ADD COLUMN embedding vector(128) NOT NULL;

ALTER TABLE face_clusters
  ALTER COLUMN source SET DEFAULT 'gemini';

CREATE INDEX IF NOT EXISTS idx_face_clusters_embedding_hnsw
  ON face_clusters USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DROP INDEX IF EXISTS idx_workspaces_face_recognition_enabled;
ALTER TABLE workspaces DROP COLUMN IF EXISTS face_recognition_enabled;
