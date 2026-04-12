-- 070_plan_tier_canonical.up.sql
-- Canonicalize plan_tier values and add a CHECK constraint.

-- Rename legacy tiers to canonical names.
UPDATE workspaces SET plan_tier = 'free' WHERE plan_tier = 'standard';
UPDATE workspaces SET plan_tier = 'professional' WHERE plan_tier = 'pro';

-- Set the new default.
ALTER TABLE workspaces ALTER COLUMN plan_tier SET DEFAULT 'free';

-- Enforce allowed values.
ALTER TABLE workspaces ADD CONSTRAINT chk_plan_tier
    CHECK (plan_tier IN ('free', 'starter', 'professional', 'business', 'enterprise'));
