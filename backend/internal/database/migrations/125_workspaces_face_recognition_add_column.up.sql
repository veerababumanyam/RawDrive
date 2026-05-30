-- F-006 fix (2026-05-30): guarantee workspaces.face_recognition_enabled exists.
--
-- The column was originally introduced by the migration that occupied slot
-- 110, but that slot was later recycled for inquiry_messages (now migration
-- 115) and the column-adding file was deleted. As a result NO migration in
-- the committed sequence ever ran `ADD COLUMN ... face_recognition_enabled`,
-- yet migrations 111 and 112 (and the runtime handlers in
-- public_gallery_handler.go and workspace_face_recognition_handler.go) all
-- assume it exists. Fresh databases therefore failed at migration 112.
--
-- Migration 112 has been made idempotent in place to unblock the broken
-- sequence; this standalone migration is the durable, append-only record of
-- the column's existence so future readers can find it where they expect.
--
-- Every clause is IF NOT EXISTS so this is a safe no-op on databases that
-- already have the column (production, and fresh DBs that picked it up via
-- the amended migration 112).

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS face_recognition_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Partial index used by face-recognition lookups (matches the index the lost
-- original migration created). Effectively a full index now that the default
-- is TRUE, but kept for parity and to preserve the named index handlers/EXPLAIN
-- plans may reference.
CREATE INDEX IF NOT EXISTS idx_workspaces_face_recognition_enabled
    ON workspaces (id)
    WHERE face_recognition_enabled = TRUE;
