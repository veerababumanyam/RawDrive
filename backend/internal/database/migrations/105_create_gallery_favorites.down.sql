-- Rollback companion to 105_create_gallery_favorites.up.sql.
--
-- Indexes are dropped implicitly via DROP TABLE so explicit DROP INDEX
-- statements would be redundant.

DROP TABLE IF EXISTS gallery_favorites;
