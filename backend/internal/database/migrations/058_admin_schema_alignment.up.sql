-- M16 follow-up: align the users and workspaces tables with what the
-- Admin Command Center code has always assumed. The admin user repository
-- has been reading u.status and u.last_login_at, and writing them from
-- the Suspend/Reactivate handlers, since M7. Neither column actually
-- existed in the users table (created in migration 002), so every admin
-- user list / suspend / reactivate call has been failing with SQLSTATE
-- 42703 at runtime.
--
-- The workspaces table similarly has always been missing updated_at even
-- though migration 048 (suspend/unsuspend/delete) implicitly relied on
-- it for audit-trail ordering.
--
-- Migration: 058_admin_schema_alignment

BEGIN;

-- Users: status (active/suspended/deleted) and last_login_at timestamp.
-- Default 'active' backfills existing rows. The CHECK constraint matches
-- the values the admin service already writes via UpdateStatus.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'deleted')),
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_status_created
    ON users (status, created_at DESC)
    WHERE status != 'deleted';

CREATE INDEX IF NOT EXISTS idx_users_last_login
    ON users (last_login_at DESC NULLS LAST);

-- Workspaces: updated_at, backfilled from created_at so existing rows
-- have a sensible value. Admin UI orders workspace detail by this.
ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Existing rows get updated_at = NOW() from the DEFAULT above, but a
-- more honest value is their created_at timestamp.
UPDATE workspaces SET updated_at = created_at WHERE updated_at > created_at + INTERVAL '1 minute';

COMMIT;
