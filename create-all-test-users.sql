-- Create all test users with workspaces and subscriptions
-- Password for all users: Test@123

BEGIN;

-- ============================================================================
-- 1. FREE TIER USER: free@test.rawdrive.in
-- ============================================================================

INSERT INTO users (user_id, email, display_name, email_verified, email_verified_at, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111001',
    'free@test.rawdrive.in',
    'Free Test User',
    true,
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified, password_hash, created_at)
VALUES (
    '11111111-1111-1111-1111-111111111001',
    'local',
    '11111111-1111-1111-1111-111111111001',
    'free@test.rawdrive.in',
    true,
    '$argon2id$v=19$m=65536,t=3,p=4$optnWvoXc7yHFpOYzaa2Cg$NynshFzDskOTCiVMmjW7PDLXSp5V3O+gKf2WB+M9Zo4',
    NOW()
)
ON CONFLICT (provider, email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111001',
    'Free Test Workspace',
    'free-test',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id) DO UPDATE SET status = 'active';

INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, accepted_at, created_at)
VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111001',
    '11111111-1111-1111-1111-111111111001',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active';

-- ============================================================================
-- 2. STARTER TIER USER: starter@test.rawdrive.in
-- ============================================================================

INSERT INTO users (user_id, email, display_name, email_verified, email_verified_at, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111002',
    'starter@test.rawdrive.in',
    'Starter Test User',
    true,
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified, password_hash, created_at)
VALUES (
    '11111111-1111-1111-1111-111111111002',
    'local',
    '11111111-1111-1111-1111-111111111002',
    'starter@test.rawdrive.in',
    true,
    '$argon2id$v=19$m=65536,t=3,p=4$optnWvoXc7yHFpOYzaa2Cg$NynshFzDskOTCiVMmjW7PDLXSp5V3O+gKf2WB+M9Zo4',
    NOW()
)
ON CONFLICT (provider, email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111002',
    'Starter Test Workspace',
    'starter-test',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id) DO UPDATE SET status = 'active';

INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, accepted_at, created_at)
VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111002',
    '11111111-1111-1111-1111-111111111002',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active';

-- ============================================================================
-- 3. PROFESSIONAL TIER USER: professional@test.rawdrive.in
-- ============================================================================

INSERT INTO users (user_id, email, display_name, email_verified, email_verified_at, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111003',
    'professional@test.rawdrive.in',
    'Professional Test User',
    true,
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified, password_hash, created_at)
VALUES (
    '11111111-1111-1111-1111-111111111003',
    'local',
    '11111111-1111-1111-1111-111111111003',
    'professional@test.rawdrive.in',
    true,
    '$argon2id$v=19$m=65536,t=3,p=4$optnWvoXc7yHFpOYzaa2Cg$NynshFzDskOTCiVMmjW7PDLXSp5V3O+gKf2WB+M9Zo4',
    NOW()
)
ON CONFLICT (provider, email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111003',
    'Professional Test Workspace',
    'professional-test',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id) DO UPDATE SET status = 'active';

INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, accepted_at, created_at)
VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111003',
    '11111111-1111-1111-1111-111111111003',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active';

-- ============================================================================
-- 4. BUSINESS TIER USER: business@test.rawdrive.in (already exists, ensure workspace subscription)
-- ============================================================================

-- User and workspace already created, just ensure subscription exists

-- ============================================================================
-- 5. ENTERPRISE TIER USER: enterprise@test.rawdrive.in
-- ============================================================================

INSERT INTO users (user_id, email, display_name, email_verified, email_verified_at, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111005',
    'enterprise@test.rawdrive.in',
    'Enterprise Test User',
    true,
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_identities (user_id, provider, provider_user_id, email, email_verified, password_hash, created_at)
VALUES (
    '11111111-1111-1111-1111-111111111005',
    'local',
    '11111111-1111-1111-1111-111111111005',
    'enterprise@test.rawdrive.in',
    true,
    '$argon2id$v=19$m=65536,t=3,p=4$optnWvoXc7yHFpOYzaa2Cg$NynshFzDskOTCiVMmjW7PDLXSp5V3O+gKf2WB+M9Zo4',
    NOW()
)
ON CONFLICT (provider, email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111005',
    'Enterprise Test Workspace',
    'enterprise-test',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id) DO UPDATE SET status = 'active';

INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, accepted_at, created_at)
VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111005',
    '11111111-1111-1111-1111-111111111005',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active';

COMMIT;

-- ============================================================================
-- Verify all users were created
-- ============================================================================

SELECT
    u.email,
    u.display_name,
    w.name as workspace_name,
    wm.status as membership_status
FROM users u
LEFT JOIN workspace_memberships wm ON u.user_id = wm.user_id
LEFT JOIN workspaces w ON wm.workspace_id = w.workspace_id
WHERE u.email LIKE '%@test.rawdrive.in'
ORDER BY u.email;
