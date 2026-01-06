-- Create workspace for business@test.rawdrive.in
BEGIN;

-- Create workspace
INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111004',
    'Business Test Workspace',
    'business-test',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id) DO UPDATE SET status = 'active';

-- Create workspace subscription
INSERT INTO workspace_subscriptions (
    subscription_id,
    workspace_id,
    plan_id,
    status,
    trial_started_at,
    trial_expires_at,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111004',
    p.plan_id,
    'active',
    NOW(),
    NOW() + INTERVAL '30 days',
    NOW(),
    NOW()
FROM plans p
WHERE p.code = 'business'
ON CONFLICT (workspace_id) DO UPDATE SET status = 'active';

-- Create workspace membership
INSERT INTO workspace_memberships (
    membership_id,
    workspace_id,
    user_id,
    status,
    accepted_at,
    created_at
)
SELECT
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111004',
    u.user_id,
    'active',
    NOW(),
    NOW()
FROM users u
WHERE u.email = 'business@test.rawdrive.in'
ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = 'active';

COMMIT;

-- Verify
SELECT
    u.email,
    w.name as workspace_name,
    wm.status as membership_status
FROM users u
JOIN workspace_memberships wm ON u.user_id = wm.user_id
JOIN workspaces w ON wm.workspace_id = w.workspace_id
WHERE u.email = 'business@test.rawdrive.in';
