-- Migration 036: Seed test users for RBAC testing
-- Source: feature-prd.md (F-ROLE-RESOLVE) US-3, US-4, US-5
-- These users have @rawdrive.test email domain — test-only credentials
--
-- SuperAdmin: superadmin@rawdrive.test / SuperAdmin123!
-- Admin:      admin@rawdrive.test      / Admin123!
-- Dealer:     dealer@rawdrive.test     / Dealer123!

-- Use deterministic UUIDs so seeds are idempotent and predictable in tests
-- Format: 00000000-0000-4000-a000-00000000000{1,2,3} for users
--         00000000-0000-4000-b000-00000000000{1,2,3} for workspaces

-- Step 1: Upsert test users — update platform_role and password if email already exists
INSERT INTO users (id, email, password_hash, email_verified, display_name, platform_role)
VALUES
  (gen_random_uuid(), 'superadmin@rawdrive.test',
   '$2a$10$pPRn..phjj7BoC1O2wk3Ju8DGtNdCGraK8goYN6xoPcHKbBv4ajI2',
   true, 'Super Admin', 'super_admin'),
  (gen_random_uuid(), 'admin@rawdrive.test',
   '$2a$10$QtJBtE6V/ZmsrnXysJyY8uapqgw6rfk.annF6dOscL1pHZpEDYLhu',
   true, 'Platform Admin', 'admin'),
  (gen_random_uuid(), 'dealer@rawdrive.test',
   '$2a$10$CEzL6C1MG.GguguTDrvfe.bCk/WIEU4MMHTNmKqjUUx8XlZjvPmeO',
   true, 'Test Dealer', 'dealer')
ON CONFLICT (email) DO UPDATE SET
  platform_role = EXCLUDED.platform_role,
  password_hash = EXCLUDED.password_hash,
  email_verified = EXCLUDED.email_verified,
  display_name = EXCLUDED.display_name;

-- Step 2: Create workspaces for test users (using actual user IDs from DB)
-- Use a CTE to look up the real user IDs after upsert
INSERT INTO workspaces (id, name, state_id, owner_id)
SELECT gen_random_uuid(), ws.name, (SELECT id FROM states WHERE code = 'IN-TG' LIMIT 1), u.id
FROM (VALUES
  ('superadmin@rawdrive.test', 'SuperAdmin Workspace'),
  ('admin@rawdrive.test', 'Admin Workspace'),
  ('dealer@rawdrive.test', 'Dealer Workspace')
) AS ws(email, name)
JOIN users u ON u.email = ws.email
WHERE NOT EXISTS (
  SELECT 1 FROM workspaces w WHERE w.owner_id = u.id
);

-- Step 3: Create workspace_members entries (Owner role)
INSERT INTO workspace_members (workspace_id, user_id, role_id)
SELECT w.id, u.id, (SELECT id FROM roles WHERE name = 'Owner')
FROM users u
JOIN workspaces w ON w.owner_id = u.id
WHERE u.email IN ('superadmin@rawdrive.test', 'admin@rawdrive.test', 'dealer@rawdrive.test')
AND NOT EXISTS (
  SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id
);

-- Step 4: Create dealer record for the dealer test user
INSERT INTO dealers (id, user_id, state_id, business_name, pan_number, status, approved_at)
SELECT gen_random_uuid(), u.id,
  (SELECT id FROM states WHERE code = 'IN-TG' LIMIT 1),
  'Test Dealer Business', 'AAAPA0000A', 'approved', NOW()
FROM users u
WHERE u.email = 'dealer@rawdrive.test'
AND NOT EXISTS (
  SELECT 1 FROM dealers d WHERE d.user_id = u.id
);
