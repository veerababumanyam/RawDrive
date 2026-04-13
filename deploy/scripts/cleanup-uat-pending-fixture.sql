-- ============================================================================
-- Cleanup: uat.new.pho.002@rawdrive.test orphan fixture
-- ============================================================================
-- PROD-UAT-2026-04-13 P2.
--
-- The account `uat.new.pho.002@rawdrive.test` was created during the
-- 2026-04-13 UAT run but onboarding was never completed, so its JWT carries
-- a literal `workspace_id=pending-...` string instead of a real UUID. Any
-- feature guard keying off workspace_id will misbehave for this user.
--
-- This script deletes the orphan account. After running it the documented
-- UAT account count drops from 17 to 16 — update docs/runbooks/PROD-UAT-*
-- accordingly. Run on the prod DB host as the rawdrive role:
--
--   psql -h <db-host> -U rawdrive -d rawdrive -f cleanup-uat-pending-fixture.sql
--
-- Idempotent: a second run is a no-op.
-- ============================================================================

BEGIN;

-- Capture the user id once so the cascading deletes target one row.
WITH target AS (
    SELECT id FROM users WHERE email = 'uat.new.pho.002@rawdrive.test'
)
DELETE FROM workspace_members
 WHERE user_id IN (SELECT id FROM target);

-- Workspaces this user owns. The account never finished onboarding so any
-- workspace row tied to it is fixture noise.
WITH target AS (
    SELECT id FROM users WHERE email = 'uat.new.pho.002@rawdrive.test'
)
DELETE FROM workspaces
 WHERE owner_id IN (SELECT id FROM target);

-- Auth artifacts (refresh sessions, MFA enrollments, recovery codes) are
-- best-effort cleaned. Tables that do not exist on this deployment are
-- silently skipped via DO blocks.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'refresh_sessions') THEN
        EXECUTE 'DELETE FROM refresh_sessions WHERE user_id IN (SELECT id FROM users WHERE email = ''uat.new.pho.002@rawdrive.test'')';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_mfa_recovery_codes') THEN
        EXECUTE 'DELETE FROM user_mfa_recovery_codes WHERE user_id IN (SELECT id FROM users WHERE email = ''uat.new.pho.002@rawdrive.test'')';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_mfa_enrollments') THEN
        EXECUTE 'DELETE FROM user_mfa_enrollments WHERE user_id IN (SELECT id FROM users WHERE email = ''uat.new.pho.002@rawdrive.test'')';
    END IF;
END $$;

DELETE FROM users WHERE email = 'uat.new.pho.002@rawdrive.test';

COMMIT;

-- Verify (run separately):
--   SELECT COUNT(*) FROM users WHERE email = 'uat.new.pho.002@rawdrive.test';
--   -- expect: 0
