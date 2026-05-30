-- Revert F-025: drop the standalone partial slug index.
--
-- The composite UNIQUE idx_galleries_workspace_slug (migration 012) is untouched and
-- remains in place; only the slug-only lookup index added here is removed.
DROP INDEX IF EXISTS idx_galleries_slug;
