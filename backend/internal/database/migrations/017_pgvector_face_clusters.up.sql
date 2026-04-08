-- M3: Enable pgvector extension and create face_clusters table
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS face_clusters (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    asset_id       UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    gallery_id     UUID REFERENCES galleries(id) ON DELETE SET NULL,
    face_index     INTEGER NOT NULL DEFAULT 0,
    bounding_box   JSONB NOT NULL DEFAULT '{}',
    embedding      vector(128) NOT NULL,
    cluster_label  UUID,
    cluster_name   VARCHAR(255) NOT NULL DEFAULT '',
    confidence     DECIMAL(5,4) NOT NULL DEFAULT 0.0,
    source         VARCHAR(20) NOT NULL DEFAULT 'gemini',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE face_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY face_clusters_workspace_isolation ON face_clusters
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );

CREATE INDEX IF NOT EXISTS idx_face_clusters_workspace ON face_clusters(workspace_id);
CREATE INDEX IF NOT EXISTS idx_face_clusters_asset ON face_clusters(asset_id);
CREATE INDEX IF NOT EXISTS idx_face_clusters_gallery ON face_clusters(gallery_id) WHERE gallery_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_face_clusters_cluster_label ON face_clusters(workspace_id, cluster_label) WHERE cluster_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_face_clusters_embedding_hnsw
    ON face_clusters USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
