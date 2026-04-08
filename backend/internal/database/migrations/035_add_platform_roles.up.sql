-- Migration 035: Add platform_role column to users table
-- Source: feature-prd.md (F-ROLE-RESOLVE), PRD Section 6.2
--
-- RawDrive has 6 platform-level roles (PRD 6.2.1-6.2.6):
--   super_admin  - Platform governance, unrestricted access
--   admin        - Day-to-day ops, moderation, no financial control
--   dealer       - Territory-scoped growth, revenue share
--   photographer - Primary paying user (DEFAULT)
--   team_member  - Invite-only, workspace-scoped
--   client       - Gallery consumer, no workspace

-- Step 1: Add platform_role column with CHECK constraint
-- ALTER TABLE ADD COLUMN ... DEFAULT is non-blocking in PostgreSQL 11+
ALTER TABLE users
ADD COLUMN IF NOT EXISTS platform_role VARCHAR(20)
NOT NULL DEFAULT 'photographer'
CONSTRAINT users_platform_role_check CHECK (
    platform_role IN (
        'super_admin',
        'admin',
        'dealer',
        'photographer',
        'team_member',
        'client'
    )
);

-- Step 2: Index for admin user listing, role-based filtering, analytics
CREATE INDEX IF NOT EXISTS idx_users_platform_role ON users (platform_role);
