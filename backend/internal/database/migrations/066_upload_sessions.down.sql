DROP POLICY IF EXISTS upload_sessions_workspace_isolation ON upload_sessions;
ALTER TABLE upload_sessions DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_upload_sessions_expires;
DROP INDEX IF EXISTS idx_upload_sessions_user;
DROP INDEX IF EXISTS idx_upload_sessions_workspace;
DROP TABLE IF EXISTS upload_sessions;
