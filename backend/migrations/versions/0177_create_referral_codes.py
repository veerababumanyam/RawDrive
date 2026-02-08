"""Create referral_codes table for growth/referral system.

Creates the referral_codes table to store unique referral codes that users
can share to invite new customers. Each code is tied to a workspace and user,
with configurable rewards, usage limits, and expiration.

Feature: Growth & Referrals - Peer-to-Peer Referral Program
Revision ID: 0177
Revises: 0176
Create Date: 2026-02-01
"""

from alembic import op

revision = "0177"
down_revision = "0176"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # REFERRAL_CODES TABLE - Stores unique referral codes for P2P referrals
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS referral_codes (
            code_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- The unique 8-character alphanumeric code (e.g., ABC123XY)
            code VARCHAR(20) NOT NULL UNIQUE,

            -- Code type: 'peer' for user referrals, 'partner' for affiliate partners
            code_type VARCHAR(20) NOT NULL DEFAULT 'peer' CHECK (code_type IN ('peer', 'partner')),

            -- Reward configuration for referrer
            referrer_reward_type VARCHAR(20) NOT NULL DEFAULT 'credit' CHECK (
                referrer_reward_type IN ('credit', 'percentage', 'fixed_amount', 'months_free')
            ),
            referrer_reward_value DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
            referrer_reward_currency VARCHAR(3) DEFAULT 'INR',

            -- Reward configuration for referee (the new user)
            referee_reward_type VARCHAR(20) NOT NULL DEFAULT 'months_free' CHECK (
                referee_reward_type IN ('credit', 'percentage', 'fixed_amount', 'months_free')
            ),
            referee_reward_value DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
            referee_reward_currency VARCHAR(3) DEFAULT 'INR',

            -- Usage tracking
            total_clicks INTEGER NOT NULL DEFAULT 0,
            total_signups INTEGER NOT NULL DEFAULT 0,
            total_conversions INTEGER NOT NULL DEFAULT 0,

            -- Limits
            max_uses INTEGER,  -- NULL means unlimited
            max_uses_per_user INTEGER DEFAULT 1,  -- Prevent same user using code multiple times

            -- Eligibility requirements for referee
            required_plan_codes VARCHAR(50)[] DEFAULT '{pro,studio,enterprise}',
            min_subscription_months INTEGER DEFAULT 1,

            -- Status and validity
            status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN (
                'active', 'paused', 'exhausted', 'expired', 'revoked'
            )),
            valid_from TIMESTAMPTZ DEFAULT NOW(),
            valid_until TIMESTAMPTZ DEFAULT NOW() + INTERVAL '90 days',

            -- Campaign tracking (optional, for marketing attribution)
            campaign_name VARCHAR(100),
            campaign_source VARCHAR(50),

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT referral_codes_max_uses_positive CHECK (max_uses IS NULL OR max_uses > 0),
            CONSTRAINT referral_codes_reward_value_positive CHECK (
                referrer_reward_value >= 0 AND referee_reward_value >= 0
            )
        );
        """
    )

    # Index for looking up codes during validation (most common query)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_codes_code
        ON referral_codes (code)
        WHERE status = 'active';
        """
    )

    # Index for listing user's referral codes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_codes_user
        ON referral_codes (user_id, created_at DESC);
        """
    )

    # Index for workspace-level queries (admin dashboard)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_codes_workspace
        ON referral_codes (workspace_id, status, created_at DESC);
        """
    )

    # Index for finding active codes that haven't expired
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_codes_active
        ON referral_codes (valid_until)
        WHERE status = 'active';
        """
    )

    # Index for campaign analytics
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_codes_campaign
        ON referral_codes (campaign_name, campaign_source)
        WHERE campaign_name IS NOT NULL;
        """
    )

    # Partial index for partner codes (affiliate program)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_codes_partner
        ON referral_codes (user_id, total_conversions DESC)
        WHERE code_type = 'partner' AND status = 'active';
        """
    )

    # =========================================================================
    # TABLE AND COLUMN COMMENTS
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE referral_codes IS
        'Stores unique referral codes for P2P and partner referral programs. Each code tracks usage, rewards, and conversion metrics.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.code IS
        'Unique 8-character alphanumeric code (e.g., ABC123XY). Used in referral URLs like /join?ref=ABC123XY';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.code_type IS
        'Type of referral: peer (user-to-user) or partner (affiliate program)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.referrer_reward_type IS
        'How the referrer is rewarded: credit (account credit), percentage (of subscription), fixed_amount, or months_free';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.referrer_reward_value IS
        'Value of reward: amount in currency for credit/fixed_amount, percentage (e.g., 20.00 for 20%), or months for months_free';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.required_plan_codes IS
        'Array of plan codes that referee must subscribe to for referral to count as conversion';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.total_clicks IS
        'Number of times the referral link was clicked (visit to /join?ref=...)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.total_signups IS
        'Number of users who registered using this code (may not have converted yet)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_codes.total_conversions IS
        'Number of users who completed a qualifying subscription purchase using this code';
        """
    )


def downgrade() -> None:
    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_referral_codes_partner;")
    op.execute("DROP INDEX IF EXISTS idx_referral_codes_campaign;")
    op.execute("DROP INDEX IF EXISTS idx_referral_codes_active;")
    op.execute("DROP INDEX IF EXISTS idx_referral_codes_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_referral_codes_user;")
    op.execute("DROP INDEX IF EXISTS idx_referral_codes_code;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS referral_codes;")
