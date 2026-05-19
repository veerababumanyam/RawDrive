-- 2026-05-19 — flip workspaces.face_recognition_enabled default FALSE → TRUE
-- and backfill every existing workspace to TRUE.
--
-- Migration 110 introduced workspaces.face_recognition_enabled as the
-- workspace-level opt-in gate for biometric data processing under
-- Indian DPDP / EU GDPR. The original DEFAULT FALSE meant every newly
-- created workspace shipped with face recognition off, and the only
-- way to turn it on was the dashboard Settings → Face Recognition
-- page (frontend/src/app/(dashboard)/settings/face-recognition/
-- page.tsx). Operationally this surfaced as repeat user reports:
--
--   - "I uploaded photos and the People tab is empty"
--     (workspace gate FALSE → FaceService.DetectAndStore silently
--      returned nil at face_service.go:84, no faces ever extracted)
--   - "Photo search says no matches" — same root cause
--   - "I enabled FaceID on the gallery but it still doesn't work"
--     (per-gallery toggle is ANDed with the workspace gate at
--      public_gallery_handler.go:713; both must be true)
--
-- 2026-05-19 — flipping the default and backfilling so face
-- recognition just works out of the box for the entire application.
-- Coupled with this migration the dashboard Settings → Face
-- Recognition tile and page are removed (frontend/src/app/(dashboard)/
-- settings/page.tsx, frontend/src/app/(dashboard)/settings/face-
-- recognition/page.tsx).
--
-- Backend gate enforcement is intentionally left in place — the
-- column and the isFaceRecognitionEnabled() checks in face_service.go
-- and public_gallery_handler.go still exist. They now always observe
-- TRUE (every existing workspace via the backfill below, every new
-- workspace via the flipped default), so the gate becomes a no-op
-- from the user's perspective while keeping the audit-trail column
-- available if compliance ever needs to reintroduce the toggle.
--
-- The partial index idx_workspaces_face_recognition_enabled (WHERE
-- face_recognition_enabled = TRUE) becomes effectively a full index
-- now that every row matches the WHERE clause. Not worth dropping —
-- the index size is bounded by row count, not selectivity.

ALTER TABLE workspaces
    ALTER COLUMN face_recognition_enabled SET DEFAULT TRUE;

UPDATE workspaces
SET face_recognition_enabled = TRUE
WHERE face_recognition_enabled = FALSE;

COMMENT ON COLUMN workspaces.face_recognition_enabled IS
    'Workspace-level master gate for biometric face processing. Defaults to TRUE per migration 112 (was FALSE in migration 110). Still consulted by FaceService.DetectAndStore, FaceService.SearchByFace, and PublicGalleryHandler.isFaceRecognitionEnabledForGallery so the audit/disable surface remains available, but no dashboard UI exposes the toggle as of 2026-05-19.';
