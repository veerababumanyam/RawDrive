-- Rollback for migration 096. Drops the per-owner uniqueness index.
-- We do NOT undo the rename of duplicate rows from the up migration —
-- the renames preserve the original ID inside the new name so an
-- operator can manually reconcile by matching the suffix to the row.

DROP INDEX IF EXISTS workspaces_owner_lower_name_uniq;
