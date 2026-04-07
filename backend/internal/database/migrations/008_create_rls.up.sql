-- Grant permissions to rawdrive_app role for RLS testing
-- rawdrive_app is a non-superuser role that respects RLS policies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rawdrive_app') THEN
        CREATE ROLE rawdrive_app NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO rawdrive_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rawdrive_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rawdrive_app;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rawdrive_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rawdrive_app;

-- Enable RLS on workspace-scoped tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent re-runs)
DROP POLICY IF EXISTS workspaces_isolation ON workspaces;
DROP POLICY IF EXISTS workspace_members_isolation ON workspace_members;
DROP POLICY IF EXISTS galleries_isolation ON galleries;

-- Workspaces: users can only see their own workspace
CREATE POLICY workspaces_isolation ON workspaces
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR id::text = current_setting('app.workspace_id', true)
    );

-- Workspace members: users can only see members of their workspace
CREATE POLICY workspace_members_isolation ON workspace_members
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

-- Galleries: users can only see galleries of their workspace
CREATE POLICY galleries_isolation ON galleries
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );
