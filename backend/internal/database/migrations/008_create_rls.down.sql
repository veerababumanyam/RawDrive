DROP POLICY IF EXISTS galleries_isolation ON galleries;
DROP POLICY IF EXISTS workspace_members_isolation ON workspace_members;
DROP POLICY IF EXISTS workspaces_isolation ON workspaces;

ALTER TABLE galleries DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces DISABLE ROW LEVEL SECURITY;
