-- Migration 165 (down): drop the pg_trgm GIN indexes for gallery search.
--
-- Reverses 165_gallery_search_trgm.up.sql. Drops only the two indexes this
-- migration added (idempotent IF EXISTS). The owner gallery search reverts to a
-- sequential scan for `title/description ILIKE '%term%'` — correct, just slower.
--
-- The shared pg_trgm extension is intentionally NOT dropped: it predates this
-- migration (created by 043) and other indexes depend on it. Dropping it here
-- would break unrelated trigram indexes.

BEGIN;

DROP INDEX IF EXISTS idx_galleries_title_trgm;
DROP INDEX IF EXISTS idx_galleries_description_trgm;

COMMIT;
