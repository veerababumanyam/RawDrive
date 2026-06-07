-- Revert 191 — restore migration 190's opt-out posture: DEFAULT FALSE for new
-- workspaces and backfill all existing rows back to FALSE (face recognition off
-- pending a consent UI). Faithful inverse of 191.up.
--
-- NOTE: this rollback does NOT re-close the server_face_index_plaintext kill
-- switch (that is a code default in main.go); set FEATURE_SERVER_FACE_INDEX_
-- PLAINTEXT=false or the platform_settings row to fully restore the off-posture.

ALTER TABLE workspaces
    ALTER COLUMN face_recognition_enabled SET DEFAULT FALSE;

UPDATE workspaces
SET face_recognition_enabled = FALSE
WHERE face_recognition_enabled = TRUE;

COMMENT ON COLUMN workspaces.face_recognition_enabled IS
    'Workspace-level master gate for biometric face processing. Defaults to FALSE per migration 190.';
