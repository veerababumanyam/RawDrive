-- 189 — standardize the face RLS session variable on app.current_workspace_id.
--
-- Background: the face tables (face_clusters [017], face_identity_aliases [179],
-- face_identity_contacts [180]) are the canonical users of the
-- app.current_workspace_id session variable, while older tables key on
-- app.workspace_id. Migration 180 added a DEFENSIVE dual-variable predicate to
-- face_identity_contacts (matching EITHER app.current_workspace_id OR
-- app.workspace_id) during that transition.
--
-- The request-scoped tenant context setter (middleware.PgDBContext.SetWorkspaceID)
-- sets BOTH app.workspace_id AND app.current_workspace_id to the same value on
-- every request, so dropping the app.workspace_id fallback here cannot reduce the
-- visibility any production access path has — app.current_workspace_id is always
-- present on the same connection. This migration removes the no-longer-needed
-- second predicate so the face tables follow ONE convention.
--
-- Isolation intent is unchanged: a row is visible only when RLS is explicitly
-- bypassed (app.bypass_rls = 'on') OR the row's workspace_id matches the session's
-- app.current_workspace_id. face_clusters and face_identity_aliases already use
-- exactly this predicate; this migration aligns face_identity_contacts with them.

DROP POLICY IF EXISTS face_identity_contacts_workspace_isolation ON face_identity_contacts;
CREATE POLICY face_identity_contacts_workspace_isolation ON face_identity_contacts
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
    );
