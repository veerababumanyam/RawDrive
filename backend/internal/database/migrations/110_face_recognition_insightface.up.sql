-- 2026-05-18: Pivot face recognition from Gemini Vision (128-d) to InsightFace
-- buffalo_l served from the face-svc sidecar (512-d). See
-- services/face-svc/README.md.
--
-- Why destructive (drop + re-add embedding column instead of ALTER):
--   pgvector does not allow dimension changes via ALTER COLUMN ... TYPE.
--   The face_clusters table currently holds 0 rows in dev and was never
--   activated in production (the Gemini path required a BYOK API key
--   that no workspace configured). If a prod row count audit reveals
--   non-zero rows, abort this migration and reconcile manually before
--   re-running.
--
-- What changes on face_clusters:
--   embedding        vector(128)  →  vector(512)   destructive
--   source default   'gemini'     →  'insightface'
--   Existing HNSW index dropped + recreated at new dimension.
--   gallery_id column already exists (used for gallery-scope clustering).
--
-- What we add:
--   workspaces.face_recognition_enabled BOOLEAN DEFAULT FALSE
--     The Go ingest worker checks this flag before POSTing to face-svc.
--     Default off: biometric data processing is opt-in under Indian DPDP
--     and EU GDPR. UI toggle to flip it lands in PR-3.

-- 0. Safety net — bail if anyone has rows in face_clusters. We're
--    intentionally destructive on the embedding column; rows would lose
--    their (already-incompatible) Gemini embeddings.
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM face_clusters;
  IF n > 0 THEN
    RAISE EXCEPTION
      'face_clusters has % rows — migration 110 is destructive on embedding column. '
      'Audit/back up the rows before re-running.', n;
  END IF;
END
$$;

-- 1. Drop the HNSW index (dimension-locked to vector(128)).
DROP INDEX IF EXISTS idx_face_clusters_embedding_hnsw;

-- 2. Drop + re-add embedding column at the new dimension. NOT NULL preserved.
ALTER TABLE face_clusters DROP COLUMN embedding;
ALTER TABLE face_clusters ADD COLUMN embedding vector(512) NOT NULL;

-- 3. Switch the default detector source. Existing rows would have had
--    source='gemini' but the table is empty, so the rename of intent is fine.
ALTER TABLE face_clusters
  ALTER COLUMN source SET DEFAULT 'insightface';

-- 4. Recreate the HNSW index. Params unchanged from migration 017 — these
--    are the pgvector docs' recommended starting point for cosine recall.
CREATE INDEX IF NOT EXISTS idx_face_clusters_embedding_hnsw
  ON face_clusters USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. Workspace-level opt-in. Default off — biometric data is sensitive
--    personal data under Indian DPDP / EU GDPR. UI toggle in PR-3 flips
--    this per workspace; the ingest worker reads it before calling face-svc.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS face_recognition_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 6. Lookup index for the worker's gating query. We expect this column to
--    be selected often (every asset ingest checks it) but rarely changed,
--    so a btree on the boolean is appropriate.
CREATE INDEX IF NOT EXISTS idx_workspaces_face_recognition_enabled
  ON workspaces (face_recognition_enabled)
  WHERE face_recognition_enabled = TRUE;
