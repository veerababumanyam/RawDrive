DROP INDEX IF EXISTS idx_face_identity_contacts_gallery;
DROP INDEX IF EXISTS idx_face_identity_contacts_contact;
DROP POLICY IF EXISTS face_identity_contacts_workspace_isolation ON face_identity_contacts;
DROP TABLE IF EXISTS face_identity_contacts;
