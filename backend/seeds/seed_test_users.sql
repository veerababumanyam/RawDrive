-- ============================================================================
-- RawDrive Test Users Seed Script
-- ============================================================================
-- This script creates test users for all RBAC roles (Owner, Admin, Editor, Viewer)
-- with associated workspaces and role assignments.
--
-- Auth method: OTP-based (passwordless). To log in:
--   1. POST /auth/login  with {"email": "<email>"}
--   2. Copy the OTP code from backend logs (stdout)
--   3. POST /auth/verify-otp  with {"email": "<email>", "code": "<otp>"}
--
-- Since this is an OTP system, there is no password hashing.
-- ============================================================================

-- Step 1: Ensure we have a state to reference (Karnataka = IN-KA)
-- The states are seeded by migration 010_seed_states.up.sql

-- Step 2: Create test users
INSERT INTO users (email, display_name, avatar_url, state_id) VALUES
  ('owner@rawdrive.test',  'Test Owner',  '', (SELECT id FROM states WHERE code = 'IN-KA')),
  ('admin@rawdrive.test',  'Test Admin',  '', (SELECT id FROM states WHERE code = 'IN-KA')),
  ('editor@rawdrive.test', 'Test Editor', '', (SELECT id FROM states WHERE code = 'IN-KA')),
  ('viewer@rawdrive.test', 'Test Viewer', '', (SELECT id FROM states WHERE code = 'IN-KA'))
ON CONFLICT (email) DO NOTHING;

-- Step 3: Create a test workspace for the owner
INSERT INTO workspaces (name, state_id, owner_id, storage_bucket_id)
SELECT
  'Test Studio',
  (SELECT id FROM states WHERE code = 'IN-KA'),
  u.id,
  'test-bucket-' || u.id::text
FROM users u
WHERE u.email = 'owner@rawdrive.test'
  AND NOT EXISTS (
    SELECT 1 FROM workspaces w WHERE w.owner_id = u.id AND w.name = 'Test Studio'
  );

-- Step 4: Assign workspace roles for all test users
-- Owner role (role_id = 1)
INSERT INTO workspace_members (workspace_id, user_id, role_id)
SELECT w.id, u.id, r.id
FROM workspaces w
JOIN users u ON u.email = 'owner@rawdrive.test'
JOIN roles r ON r.name = 'Owner'
WHERE w.name = 'Test Studio'
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id
  );

-- Admin role (role_id = 2)
INSERT INTO workspace_members (workspace_id, user_id, role_id)
SELECT w.id, u.id, r.id
FROM workspaces w
JOIN users u ON u.email = 'admin@rawdrive.test'
JOIN roles r ON r.name = 'Admin'
WHERE w.name = 'Test Studio'
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id
  );

-- Editor role (role_id = 3)
INSERT INTO workspace_members (workspace_id, user_id, role_id)
SELECT w.id, u.id, r.id
FROM workspaces w
JOIN users u ON u.email = 'editor@rawdrive.test'
JOIN roles r ON r.name = 'Editor'
WHERE w.name = 'Test Studio'
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id
  );

-- Viewer role (role_id = 4)
INSERT INTO workspace_members (workspace_id, user_id, role_id)
SELECT w.id, u.id, r.id
FROM workspaces w
JOIN users u ON u.email = 'viewer@rawdrive.test'
JOIN roles r ON r.name = 'Viewer'
WHERE w.name = 'Test Studio'
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = u.id
  );

-- Step 5: Assign platform roles (migration 035 adds platform_role column)
-- owner@rawdrive.test gets super_admin so they can access /admin/* endpoints
UPDATE users SET platform_role = 'super_admin' WHERE email = 'owner@rawdrive.test' AND platform_role != 'super_admin';
UPDATE users SET platform_role = 'admin'       WHERE email = 'admin@rawdrive.test' AND platform_role != 'admin';
-- editor and viewer remain as default 'photographer'

-- Step 6: Verify the seed
SELECT
  u.id AS user_id,
  u.email,
  u.display_name,
  u.platform_role,
  r.name AS workspace_role,
  w.name AS workspace,
  s.name AS state
FROM users u
LEFT JOIN workspace_members wm ON wm.user_id = u.id
LEFT JOIN workspaces w ON w.id = wm.workspace_id
LEFT JOIN roles r ON r.id = wm.role_id
LEFT JOIN states s ON s.id = u.state_id
WHERE u.email LIKE '%@rawdrive.test'
ORDER BY r.id;
