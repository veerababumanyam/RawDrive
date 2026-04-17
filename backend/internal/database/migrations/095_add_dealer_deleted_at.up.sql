-- M39 E7-S1: Soft-delete support on dealers.
-- Adds a nullable deleted_at timestamp and a partial index covering active rows
-- so List queries that exclude soft-deleted rows stay fast without bloating the
-- index with tombstones.

ALTER TABLE dealers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_dealers_deleted_at
    ON dealers(deleted_at)
    WHERE deleted_at IS NULL;
