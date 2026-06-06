-- 180 — link face identities to existing CRM contacts.
--
-- Face clusters are derived biometric index rows, but a photographer's decision
-- that "this identity is this CRM client" is durable product data. Store the
-- link by canonical cluster_label, scoped to the workspace. The optional
-- gallery_id records where the link was made without limiting reuse of the
-- same identity across the workspace.

CREATE TABLE IF NOT EXISTS face_identity_contacts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    cluster_label UUID NOT NULL,
    contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    gallery_id    UUID REFERENCES galleries(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT face_identity_contacts_workspace_cluster_unique UNIQUE (workspace_id, cluster_label)
);

ALTER TABLE face_identity_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS face_identity_contacts_workspace_isolation ON face_identity_contacts;
CREATE POLICY face_identity_contacts_workspace_isolation ON face_identity_contacts
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

CREATE INDEX IF NOT EXISTS idx_face_identity_contacts_contact
    ON face_identity_contacts (workspace_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_face_identity_contacts_gallery
    ON face_identity_contacts (workspace_id, gallery_id)
    WHERE gallery_id IS NOT NULL;
