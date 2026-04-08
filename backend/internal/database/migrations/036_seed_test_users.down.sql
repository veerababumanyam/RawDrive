-- Rollback migration 036: Remove test user seeds
-- Must delete in FK order, including audit_logs and any other FK references

-- Delete audit_logs referencing test workspaces
DELETE FROM audit_logs WHERE workspace_id IN (
  SELECT w.id FROM workspaces w
  JOIN users u ON u.id = w.owner_id
  WHERE u.email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')
);

DELETE FROM dealers WHERE user_id IN (
  SELECT id FROM users WHERE email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')
);

DELETE FROM workspace_members WHERE user_id IN (
  SELECT id FROM users WHERE email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')
);

DELETE FROM workspaces WHERE owner_id IN (
  SELECT id FROM users WHERE email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')
);

DELETE FROM users WHERE email IN (
  'superadmin@rawdrive.test',
  'admin@rawdrive.test',
  'dealer@rawdrive.test'
);
