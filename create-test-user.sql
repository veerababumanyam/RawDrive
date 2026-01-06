-- Create test user: business@test.rawdrive.in with password Test@123
-- Password hash is argon2 hash of 'Test@123'

BEGIN;

-- Create workspace first
INSERT INTO workspaces (id, name, slug, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111004',
    'Business Test Workspace',
    'business-test',
    NOW(),
    NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create user
INSERT INTO users (
    id,
    email,
    password_hash,
    full_name,
    email_verified,
    is_active,
    created_at,
    updated_at
)
VALUES (
    '11111111-1111-1111-1111-111111111004',
    'business@test.rawdrive.in',
    '$argon2id$v=19$m=65536,t=3,p=4$Q2d0U2FFOVdVbk5pUjBacldWaEtkZz09$YhZJthVMN0VLYYEAiQFL9fKvD3BZGnVXW2Dz8F5fWXU',
    'Business Test User',
    true,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Create workspace membership
INSERT INTO workspace_members (
    id,
    workspace_id,
    user_id,
    role,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111004',
    '11111111-1111-1111-1111-111111111004',
    'owner',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Create subscription plan if not exists
INSERT INTO subscription_plans (
    id,
    name,
    slug,
    tier,
    price_monthly,
    price_yearly,
    storage_gb,
    max_galleries,
    max_assets_per_gallery,
    features,
    is_active,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    'Business',
    'business',
    'business',
    2999,
    29999,
    1000,
    -1,
    -1,
    '{"ai_features": true, "custom_branding": true, "priority_support": true}'::jsonb,
    true,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- Create workspace subscription
INSERT INTO workspace_subscriptions (
    id,
    workspace_id,
    plan_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111004',
    id,
    'active',
    NOW(),
    NOW() + INTERVAL '1 year',
    NOW(),
    NOW()
FROM subscription_plans
WHERE slug = 'business'
ON CONFLICT (workspace_id) DO NOTHING;

COMMIT;

-- Verify user was created
SELECT email, full_name, email_verified, is_active
FROM users
WHERE email = 'business@test.rawdrive.in';
