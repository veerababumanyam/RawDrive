DROP INDEX IF EXISTS idx_face_identity_aliases_canonical;
DROP POLICY IF EXISTS face_identity_aliases_workspace_isolation ON face_identity_aliases;
DROP TABLE IF EXISTS face_identity_aliases;
