-- Migration 114: add reply_message to marketplace_inquiries
-- Allows the photographer (to_user_id) to send a reply back to the inquirer.
--
-- F-105 (2026-05-30): this header previously read "-- Migration 109", a stale
-- label left over from the slot renumbering that recycled old slots 109/110.
-- Corrected to 114 to match the actual file number. The renumbering is also
-- what dropped the original migration that ADDed workspaces.face_recognition_enabled
-- (old slot 110, commit 7d918a0); that root cause (F-006) is remediated by the
-- in-place idempotent guard in 112_workspaces_face_recognition_default_true.up.sql
-- and the durable standalone 125_workspaces_face_recognition_add_column.up.sql.
ALTER TABLE marketplace_inquiries
    ADD COLUMN IF NOT EXISTS reply_message TEXT;
