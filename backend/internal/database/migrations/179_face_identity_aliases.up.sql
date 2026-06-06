-- 179 — durable photographer face-identity grouping decisions.
--
-- face_clusters is a derived biometric index: rows can be regenerated when an
-- encrypted asset is re-indexed or when the face model changes. Photographer
-- merges are product decisions, so record old cluster labels as aliases of the
-- canonical label. Search/review code resolves aliases before listing photos.

CREATE TABLE IF NOT EXISTS face_identity_aliases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    alias_label     UUID NOT NULL,
    canonical_label UUID NOT NULL,
    reason          VARCHAR(40) NOT NULL DEFAULT 'manual_merge',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT face_identity_aliases_not_self CHECK (alias_label <> canonical_label),
    CONSTRAINT face_identity_aliases_workspace_alias_unique UNIQUE (workspace_id, alias_label)
);

ALTER TABLE face_identity_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_identity_aliases_workspace_isolation ON face_identity_aliases;
CREATE POLICY face_identity_aliases_workspace_isolation ON face_identity_aliases
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );

CREATE INDEX IF NOT EXISTS idx_face_identity_aliases_canonical
    ON face_identity_aliases (workspace_id, canonical_label);
