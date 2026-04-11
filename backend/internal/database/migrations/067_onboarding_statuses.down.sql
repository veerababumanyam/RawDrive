-- Rollback: 067_onboarding_statuses
-- Drops the persistent onboarding_statuses table. The service will
-- fall back to its in-memory map (see onboarding.go) so the rollback
-- is lossy but non-fatal.

DROP INDEX IF EXISTS idx_onboarding_statuses_state_id;
DROP INDEX IF EXISTS idx_onboarding_statuses_current_step;
DROP TABLE IF EXISTS onboarding_statuses;
