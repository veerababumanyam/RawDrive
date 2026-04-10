-- Down migration for F-006 Part B refresh session persistence. Drops
-- the refresh_sessions table. WARNING: running this on a system that
-- has already issued refresh tokens will invalidate every active
-- session — users will need to re-authenticate.

DROP INDEX IF EXISTS idx_refresh_sessions_expires;
DROP INDEX IF EXISTS idx_refresh_sessions_family;
DROP INDEX IF EXISTS idx_refresh_sessions_sub;
DROP TABLE IF EXISTS refresh_sessions;
