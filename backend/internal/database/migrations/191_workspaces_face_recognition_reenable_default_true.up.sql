-- 191 — re-enable FaceID: revert workspaces.face_recognition_enabled default
-- FALSE → TRUE and backfill every existing workspace to TRUE.
--
-- Owner decision (2026-06-08): turn face recognition back ON as the active
-- posture. This reverts migration 190 (which defaulted it OFF pending a consent
-- UI). It is paired with re-enabling the server-side plaintext face-index path
-- (server_face_index_plaintext now defaults ON in backend/cmd/api/main.go), so
-- the active E2EE recognition posture is now (a) — server-side match on
-- plaintext-derived embeddings — per docs/decisions/faceid-licensing-and-e2ee-
-- posture.md. The server therefore transiently processes a DECRYPTED face frame
-- at index time; this is the accepted interim posture (a), NOT the posture (b)
-- client-side end state, which remains owner-blocked on model licensing/hosting.
--
-- ADD COLUMN IF NOT EXISTS keeps this safe on a fresh DB (F-006 guard).

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS face_recognition_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE workspaces
    ALTER COLUMN face_recognition_enabled SET DEFAULT TRUE;

UPDATE workspaces
SET face_recognition_enabled = TRUE
WHERE face_recognition_enabled = FALSE;

COMMENT ON COLUMN workspaces.face_recognition_enabled IS
    'Workspace-level master gate for biometric face processing. Defaults to TRUE per migration 191 (re-enabled; was FALSE per migration 190). Active E2EE posture is (a) server-side match — the server processes plaintext-derived embeddings at index time. Consulted by FaceService.DetectAndStore, FaceService.SearchByFace, and PublicGalleryHandler.isFaceRecognitionEnabledForGallery.';
