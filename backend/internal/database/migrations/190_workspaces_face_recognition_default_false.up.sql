-- 190 — revert workspaces.face_recognition_enabled default TRUE → FALSE and
-- backfill every existing workspace to FALSE.
--
-- Compliance posture (India DPDP / EU GDPR Art 9): biometric face processing
-- must be OPT-IN. Migration 112 (2026-05-19) flipped the default to TRUE and
-- backfilled every row so face recognition "just worked out of the box", and
-- in the same change set removed the dashboard consent UI. With the consent
-- ledger now in place (migration 188_biometric_consent_audit) but the consent
-- UI not yet rebuilt, the safe default is OFF for everyone until a workspace
-- can record explicit consent.
--
-- This column is the workspace-level master gate consulted by
-- FaceService.DetectAndStore, FaceService.SearchByFace, and
-- PublicGalleryHandler.isFaceRecognitionEnabledForGallery. Setting it FALSE
-- gates biometric processing off: no embeddings are extracted and guest
-- face-search returns no matches until the gate is re-enabled per workspace.
--
-- The partial index idx_workspaces_face_recognition_enabled (WHERE
-- face_recognition_enabled = TRUE) becomes highly selective again now that
-- rows are FALSE — no action needed; the index simply shrinks.
--
-- TEMPORARY: revert via 190.down once the consent UI is built and a workspace
-- can opt in. The ADD COLUMN IF NOT EXISTS guard keeps this safe on a fresh DB
-- where the column was first created by migration 112/125.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS face_recognition_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE workspaces
    ALTER COLUMN face_recognition_enabled SET DEFAULT FALSE;

UPDATE workspaces
SET face_recognition_enabled = FALSE
WHERE face_recognition_enabled = TRUE;

COMMENT ON COLUMN workspaces.face_recognition_enabled IS
    'Workspace-level master gate for biometric face processing. Defaults to FALSE per migration 190 (was TRUE per migration 112) — biometric processing is opt-in (DPDP / GDPR Art 9) and stays off until the consent UI is rebuilt. Still consulted by FaceService.DetectAndStore, FaceService.SearchByFace, and PublicGalleryHandler.isFaceRecognitionEnabledForGallery.';
