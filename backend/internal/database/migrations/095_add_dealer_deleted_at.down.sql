-- M39 E7-S1 rollback: remove soft-delete column and its partial index.
-- DROP INDEX before DROP COLUMN — the index references the column.

DROP INDEX IF EXISTS idx_dealers_deleted_at;

ALTER TABLE dealers DROP COLUMN IF EXISTS deleted_at;
