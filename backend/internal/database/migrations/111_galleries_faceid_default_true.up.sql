-- 2026-05-19 — flip galleries.faceid_enabled default FALSE → TRUE.
--
-- M13 (migration 041) originally defaulted FaceID-entry to FALSE so
-- guests couldn't use a selfie to find their photos unless the studio
-- explicitly opted in per-gallery. Operationally this meant every new
-- gallery's AI & FaceID settings card opened with the "FaceID entry"
-- toggle off; studios that wanted the feature had to flip it manually
-- on every gallery.
--
-- 2026-05-19 — flipping the default to TRUE so the per-gallery toggle
-- ships with both AI & FaceID switches in the "on" position by
-- default. Studios that need the privacy-conservative posture can flip
-- it off per-gallery from the same UI. This mirrors how migration 046
-- already defaulted galleries.face_detection_enabled to TRUE.
--
-- Privacy/compliance guard: this affects only NEW gallery rows. The
-- workspace-level workspaces.face_recognition_enabled flag (migration
-- 110, DEFAULT FALSE) remains the master opt-in gate — even with this
-- per-gallery default flipped to TRUE, no biometric processing
-- happens until the workspace owner toggles the workspace-level
-- switch at /settings/face-recognition. So this migration changes the
-- default surface posture, not the actual data-processing posture
-- before workspace opt-in.
--
-- Backfill is intentionally NOT applied. Existing galleries keep
-- whatever per-gallery value they have (typically FALSE since they
-- were created under the 041 default). Studios that want to enable
-- FaceID retroactively can flip per gallery from the AI & FaceID
-- card, or run a one-off UPDATE if they want a bulk flip.

ALTER TABLE galleries
    ALTER COLUMN faceid_enabled SET DEFAULT TRUE;

COMMENT ON COLUMN galleries.faceid_enabled IS
    'Per-gallery toggle for guest face-search ("FaceID entry"). Defaults to TRUE per migration 111. Workspace-level workspaces.face_recognition_enabled (migration 110) is the master opt-in gate; this flag is only consulted when that is TRUE.';
