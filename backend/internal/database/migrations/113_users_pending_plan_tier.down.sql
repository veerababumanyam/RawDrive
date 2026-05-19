-- Revert 113 — drop the admin-granted plan column. Does not back-
-- propagate any in-flight grants to workspaces.plan_tier; an admin
-- who relied on this column for a never-onboarded user will need
-- to re-grant via the UI after onboarding completes.

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_pending_plan_tier;
ALTER TABLE users DROP COLUMN IF EXISTS pending_plan_tier;
