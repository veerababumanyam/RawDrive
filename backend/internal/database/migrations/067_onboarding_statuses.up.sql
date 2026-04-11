-- Migration: 067_onboarding_statuses
-- Purpose: persist onboarding progress across backend restarts.
--
-- Prior state: backend/internal/onboarding/onboarding.go kept a
-- `map[string]*OnboardingStatus` protected by sync.Mutex. That meant
-- every process restart wiped in-flight onboarding state; a user who
-- had picked their state and was filling in their business name would
-- be silently bounced back to step 1 on the next deploy/crash. There
-- was also no audit trail and no way to query "how many users are
-- stuck mid-onboarding".
--
-- New state: onboarding_statuses is a one-row-per-user table keyed on
-- users.id. state_id is a proper INT FK to the states table (migration
-- 001/010), replacing the 2-letter code string the in-memory version
-- used. The step values are gated by a CHECK constraint matching the
-- Go const block (StepStateSelection | StepProfile | StepComplete).

CREATE TABLE IF NOT EXISTS onboarding_statuses (
    user_id       UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_step  VARCHAR(32) NOT NULL DEFAULT 'state_selection'
                      CHECK (current_step IN ('state_selection', 'profile', 'complete')),
    state_id      INT         REFERENCES states(id) ON DELETE RESTRICT,
    business_name TEXT,
    display_name  TEXT,
    gstin         VARCHAR(15),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Support "how many users are stuck on state_selection" / profile monitoring
-- queries from the admin dashboard without a full table scan.
CREATE INDEX IF NOT EXISTS idx_onboarding_statuses_current_step
    ON onboarding_statuses (current_step);

-- Support joins from the states breakdown view (revenue/states, etc.)
-- so analytics on "which states registered this week" doesn't need a
-- sequential scan.
CREATE INDEX IF NOT EXISTS idx_onboarding_statuses_state_id
    ON onboarding_statuses (state_id)
    WHERE state_id IS NOT NULL;
