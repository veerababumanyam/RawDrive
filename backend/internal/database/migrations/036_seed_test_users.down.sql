-- Rollback migration 036: Remove test user seeds
-- Must delete in FK order, including all FK references from later migrations
-- audit_logs has a DO INSTEAD NOTHING rule on DELETE — must drop it first

-- Temporarily drop the immutability rules on audit_logs so FK cascades work
DROP RULE IF EXISTS audit_logs_no_delete ON audit_logs;
DROP RULE IF EXISTS audit_logs_no_update ON audit_logs;

-- Clean up FK references from later migrations (may already be dropped during rollback)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gallery_design_templates') THEN
    DELETE FROM gallery_design_templates WHERE workspace_id IN (
      SELECT w.id FROM workspaces w JOIN users u ON u.id = w.owner_id
      WHERE u.email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')
    );
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'workspace_storage') THEN
    DELETE FROM workspace_storage WHERE workspace_id IN (
      SELECT w.id FROM workspaces w JOIN users u ON u.id = w.owner_id
      WHERE u.email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')
    );
  END IF;
END $$;

-- Now delete audit_logs referencing test workspaces
DELETE FROM audit_logs WHERE workspace_id IN (
  SELECT w.id FROM workspaces w JOIN users u ON u.id = w.owner_id
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

-- Restore the immutability rules after all workspace deletes are done
CREATE OR REPLACE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
