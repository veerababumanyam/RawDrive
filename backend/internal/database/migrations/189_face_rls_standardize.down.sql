-- 189 (down) — restore the dual-variable defensive coverage from migration 180.
--
-- Re-add the app.workspace_id fallback predicate so face_identity_contacts is
-- visible to sessions that set EITHER app.current_workspace_id OR app.workspace_id,
-- exactly as migration 180 originally defined the policy. This widens coverage
-- back to the transitional state; tenant isolation is preserved (a row is still
-- only visible to its own workspace, just keyed on either variable).

DROP POLICY IF EXISTS face_identity_contacts_workspace_isolation ON face_identity_contacts;
CREATE POLICY face_identity_contacts_workspace_isolation ON face_identity_contacts
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );
