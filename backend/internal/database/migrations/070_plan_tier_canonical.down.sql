-- 070_plan_tier_canonical.down.sql
-- Revert canonicalized plan_tier values.

ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_plan_tier;

ALTER TABLE workspaces ALTER COLUMN plan_tier SET DEFAULT 'standard';

UPDATE workspaces SET plan_tier = 'standard' WHERE plan_tier = 'free';
UPDATE workspaces SET plan_tier = 'pro' WHERE plan_tier = 'professional';
