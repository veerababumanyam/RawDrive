-- Revert 190 — restore the migration 112 posture: DEFAULT TRUE for new
-- workspaces and backfill all existing rows back to TRUE.
--
-- Faithful inverse of 190.up: 190 set DEFAULT FALSE and forced every row to
-- FALSE, so this rollback restores DEFAULT TRUE and re-backfills to TRUE (the
-- state 190 found). Because 190 clobbered every row to FALSE, the individual
-- pre-190 values are not recoverable; re-backfilling to TRUE matches the
-- all-TRUE state migration 112 had established, which is the closest faithful
-- restoration.
--
-- NOTE: rollback does NOT rebuild the dashboard consent UI that migration 112
-- removed; that surface is tracked separately and would need to be restored
-- on its own if a full revert of the biometric posture is required.

ALTER TABLE workspaces
    ALTER COLUMN face_recognition_enabled SET DEFAULT TRUE;

UPDATE workspaces
SET face_recognition_enabled = TRUE
WHERE face_recognition_enabled = FALSE;

COMMENT ON COLUMN workspaces.face_recognition_enabled IS
    'Workspace-level master gate for biometric face processing. Defaults to TRUE per migration 112.';
