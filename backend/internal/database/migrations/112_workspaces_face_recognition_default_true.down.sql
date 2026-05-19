-- Revert 112 — restore the migration 110 default of FALSE for new
-- workspace rows. Does not retro-touch existing workspaces (they keep
-- whatever value they have at the time of rollback, which is typically
-- TRUE because 112 backfilled them).
--
-- Reverting alone does NOT restore the dashboard Settings → Face
-- Recognition page or the tile on the settings landing page. Those
-- were removed in the same change set and would need to be restored
-- separately if a full revert is required.

ALTER TABLE workspaces
    ALTER COLUMN face_recognition_enabled SET DEFAULT FALSE;

COMMENT ON COLUMN workspaces.face_recognition_enabled IS
    'Workspace-level master gate for biometric face processing. Defaults to FALSE per migration 110.';
