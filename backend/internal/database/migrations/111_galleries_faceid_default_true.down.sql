-- Revert 111 — restore the migration 041 default of FALSE for new
-- gallery rows. Does not retro-touch existing galleries.

ALTER TABLE galleries
    ALTER COLUMN faceid_enabled SET DEFAULT FALSE;

COMMENT ON COLUMN galleries.faceid_enabled IS
    'Per-gallery toggle for guest face-search ("FaceID entry"). Defaults to FALSE per migration 041.';
