-- Create test user: business@test.rawdrive.in with password Test@123

BEGIN;

-- Create workspace first
INSERT INTO workspaces (workspace_id, name, slug, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111004',
    'Business Test Workspace',
    'business-test',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id) DO NOTHING;

-- Create user
INSERT INTO users (
    user_id,
    email,
    display_name,
    email_verified,
    email_verified_at,
    created_at,
    updated_at
)
VALUES (
    '11111111-1111-1111-1111-111111111004',
    'business@test.rawdrive.in',
    'Business Test User',
    true,
    NOW(),
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Create user identity with password
INSERT INTO user_identities (
    identity_id,
    user_id,
    provider,
    provider_user_id,
    email,
    email_verified,
    password_hash,
    created_at,
    last_used_at
)
VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111004',
    'local',
    '11111111-1111-1111-1111-111111111004',
    'business@test.rawdrive.in',
    true,
    '$argon2id$v=19$m=65536,t=3,p=4$Q2d0U2FFOVdVbk5pUjBacldWaEtkZz09$YhZJthVMN0VLYYEAiQFL9fKvD3BZGnVXW2Dz8F5fWXU',
    NOW(),
    NOW()
)
ON CONFLICT (provider, email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- Create workspace membership
INSERT INTO workspace_memberships (
    membership_id,
    workspace_id,
    user_id,
    role,
    status,
    created_at,
    updated_at
)
VALUES (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111004',
    '11111111-1111-1111-1111-111111111004',
    'owner',
    'active',
    NOW(),
    NOW()
)
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Create subscription plan if not exists
INSERT INTO subscription_plans (
    plan_id,
    name,
    slug,
    tier,
    price_monthly_inr,
    price_yearly_inr,
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
    subscription_id,
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
    plan_id,
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
SELECT u.email, u.display_name, u.email_verified, ui.provider, ui.password_hash IS NOT NULL as has_password
FROM users u
JOIN user_identities ui ON u.user_id = ui.user_id
WHERE u.email = 'business@test.rawdrive.in';
