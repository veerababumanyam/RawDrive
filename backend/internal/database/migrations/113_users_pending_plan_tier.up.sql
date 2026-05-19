-- 2026-05-19 — add users.pending_plan_tier for admin-granted plan
-- comps.
--
-- Use case: a super admin creates a photographer via the admin
-- User Management screen and wants that user to land on a paid
-- plan from day one without paying (100% manual discount).
-- Setting this column at admin-create time captures the intent;
-- the onboarding workspace-creation step reads it, uses it as the
-- workspace's plan_tier, and clears the column so the grant
-- applies exactly once.
--
-- Nullable on purpose — the column is only set when an admin
-- explicitly granted a plan. Self-serve users (the typical signup
-- path) never touch this column, and the onboarding flow falls
-- back to the user's wizard choice when the column is NULL.
--
-- CHECK constraint mirrors workspaces.plan_tier (migration 070)
-- so the same five canonical tiers — and only those — can be
-- granted. A bad value would propagate to workspaces.plan_tier
-- and trip the chk_plan_tier constraint there, but failing fast
-- at the users-level INSERT gives a clearer error to the admin.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pending_plan_tier VARCHAR(20);

ALTER TABLE users
    ADD CONSTRAINT chk_users_pending_plan_tier
    CHECK (pending_plan_tier IS NULL
           OR pending_plan_tier IN ('free', 'starter', 'professional', 'business', 'enterprise'));

COMMENT ON COLUMN users.pending_plan_tier IS
    'Admin-granted plan to apply at workspace-creation time. Set by POST /api/v1/admin/users when a super admin picks a plan in the New User dialog. Cleared by the onboarding service after the workspace is created with this tier. NULL for self-serve signups.';
