-- 155: rollback public personal photographer profiles.

DROP INDEX IF EXISTS idx_photographer_profile_view_events_unique;
DROP INDEX IF EXISTS idx_photographer_profile_view_events_profile_created;
DROP TABLE IF EXISTS photographer_profile_view_events;

DROP INDEX IF EXISTS idx_photographer_profiles_featured_galleries;
DROP INDEX IF EXISTS idx_photographer_profiles_public_slug;
DROP INDEX IF EXISTS idx_photographer_profiles_workspace;
DROP INDEX IF EXISTS idx_photographer_profiles_photographer;
DROP INDEX IF EXISTS idx_photographer_profiles_slug_unique;
DROP TABLE IF EXISTS photographer_profiles;
