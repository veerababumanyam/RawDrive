"""Create referral_conversions table for growth/referral system.

Tracks referral conversion events when a referred user (referee) completes
a qualifying action (e.g., subscribes to a paid plan). Links referral codes
to actual conversions and tracks reward distribution status.

Feature: Growth & Referrals - Peer-to-Peer Referral Program
Revision ID: 0178
Revises: 0177
Create Date: 2026-02-01
"""

from alembic import op

revision = "0178"
down_revision = "0177"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # REFERRAL_CONVERSIONS TABLE - Tracks referral conversion events
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS referral_conversions (
            conversion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Link to the referral code used
            referral_code_id UUID NOT NULL REFERENCES referral_codes(code_id) ON DELETE CASCADE,

            -- The referrer (person who shared the code)
            referrer_workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            referrer_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- The referee (new user who used the code)
            referee_workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            referee_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Conversion event details
            conversion_type VARCHAR(30) NOT NULL DEFAULT 'subscription' CHECK (conversion_type IN (
                'signup',           -- User registered with referral code
                'subscription',     -- User subscribed to a paid plan
                'upgrade',          -- User upgraded to higher tier
                'renewal'           -- Subscription renewed (for recurring rewards)
            )),

            -- Subscription details at time of conversion
            subscription_id UUID,  -- References subscriptions table if applicable
            plan_code VARCHAR(50),
            plan_name VARCHAR(100),
            subscription_amount DECIMAL(12, 2),
            subscription_currency VARCHAR(3) DEFAULT 'INR',
            subscription_interval VARCHAR(20),  -- 'monthly', 'yearly'

            -- Referrer reward details
            referrer_reward_type VARCHAR(20) NOT NULL CHECK (
                referrer_reward_type IN ('credit', 'percentage', 'fixed_amount', 'months_free')
            ),
            referrer_reward_value DECIMAL(10, 2) NOT NULL,
            referrer_reward_currency VARCHAR(3) DEFAULT 'INR',
            referrer_reward_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (referrer_reward_status IN (
                'pending',       -- Conversion recorded, reward not yet processed
                'processing',    -- Reward is being applied
                'credited',      -- Credit/reward applied to account
                'paid_out',      -- Cash payout completed (for partners)
                'failed',        -- Reward processing failed
                'cancelled',     -- Reward cancelled (e.g., subscription cancelled within trial)
                'clawed_back'    -- Reward revoked due to refund/fraud
            )),
            referrer_reward_credited_at TIMESTAMPTZ,
            referrer_reward_amount_credited DECIMAL(10, 2),  -- Actual amount after any adjustments

            -- Referee reward details
            referee_reward_type VARCHAR(20) NOT NULL CHECK (
                referee_reward_type IN ('credit', 'percentage', 'fixed_amount', 'months_free')
            ),
            referee_reward_value DECIMAL(10, 2) NOT NULL,
            referee_reward_currency VARCHAR(3) DEFAULT 'INR',
            referee_reward_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (referee_reward_status IN (
                'pending',
                'processing',
                'credited',
                'failed',
                'cancelled'
            )),
            referee_reward_credited_at TIMESTAMPTZ,
            referee_reward_amount_credited DECIMAL(10, 2),

            -- Validation and fraud prevention
            ip_address INET,
            user_agent TEXT,
            device_fingerprint VARCHAR(100),
            is_valid BOOLEAN DEFAULT TRUE,  -- Set to false if fraud detected
            validation_notes TEXT,  -- Reason for invalidation

            -- Attribution tracking
            click_id UUID,  -- Link to referral click tracking if implemented
            utm_source VARCHAR(100),
            utm_medium VARCHAR(100),
            utm_campaign VARCHAR(100),
            landing_page VARCHAR(500),

            -- Partner-specific fields (for affiliate program)
            is_partner_conversion BOOLEAN DEFAULT FALSE,
            partner_commission_rate DECIMAL(5, 4),  -- e.g., 0.2000 for 20%
            partner_commission_amount DECIMAL(10, 2),
            partner_payout_id UUID,  -- Links to partner_payouts when paid out

            -- Claw-back tracking (if subscription cancelled)
            clawback_eligible_until TIMESTAMPTZ,  -- Grace period for claw-back
            clawback_processed_at TIMESTAMPTZ,
            clawback_amount DECIMAL(10, 2),
            clawback_reason VARCHAR(100),

            -- Timestamps
            converted_at TIMESTAMPTZ DEFAULT NOW(),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT referral_conversions_self_referral_check CHECK (
                referrer_user_id != referee_user_id
            ),
            CONSTRAINT referral_conversions_reward_values_positive CHECK (
                referrer_reward_value >= 0 AND referee_reward_value >= 0
            )
        );
        """
    )

    # =========================================================================
    # INDEXES
    # =========================================================================

    # Primary lookup: find conversions by referral code
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_code
        ON referral_conversions (referral_code_id, converted_at DESC);
        """
    )

    # Referrer queries: list all conversions for a user's referral codes
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_referrer
        ON referral_conversions (referrer_user_id, referrer_workspace_id, converted_at DESC);
        """
    )

    # Referee queries: find if a user has used any referral code
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_referee
        ON referral_conversions (referee_user_id, referee_workspace_id);
        """
    )

    # Reward processing: find conversions with pending rewards
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_pending_rewards
        ON referral_conversions (referrer_reward_status, converted_at)
        WHERE referrer_reward_status IN ('pending', 'processing');
        """
    )

    # Referee reward processing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_referee_pending
        ON referral_conversions (referee_reward_status, converted_at)
        WHERE referee_reward_status IN ('pending', 'processing');
        """
    )

    # Partner conversions: for affiliate dashboard
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_partner
        ON referral_conversions (referrer_user_id, converted_at DESC)
        WHERE is_partner_conversion = TRUE;
        """
    )

    # Partner payout aggregation
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_partner_payout
        ON referral_conversions (partner_payout_id)
        WHERE partner_payout_id IS NOT NULL;
        """
    )

    # Claw-back processing: find conversions eligible for claw-back
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_clawback
        ON referral_conversions (clawback_eligible_until)
        WHERE clawback_eligible_until IS NOT NULL
        AND clawback_processed_at IS NULL
        AND referrer_reward_status = 'credited';
        """
    )

    # Fraud detection: find potentially invalid conversions
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_validation
        ON referral_conversions (is_valid, created_at DESC)
        WHERE is_valid = FALSE;
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_date
        ON referral_conversions (converted_at, conversion_type);
        """
    )

    # Subscription tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_referral_conversions_subscription
        ON referral_conversions (subscription_id)
        WHERE subscription_id IS NOT NULL;
        """
    )

    # =========================================================================
    # UNIQUE CONSTRAINT - Prevent duplicate conversions
    # =========================================================================
    # A referee can only convert once per referral code for initial signup/subscription
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_conversions_unique_initial
        ON referral_conversions (referral_code_id, referee_user_id)
        WHERE conversion_type IN ('signup', 'subscription');
        """
    )

    # =========================================================================
    # TABLE AND COLUMN COMMENTS
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE referral_conversions IS
        'Tracks referral conversion events linking referral codes to actual conversions. Records reward distribution for both referrer and referee.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_conversions.conversion_type IS
        'Type of conversion event: signup (registered), subscription (paid), upgrade (higher tier), renewal (recurring)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_conversions.referrer_reward_status IS
        'Status of reward for the referrer: pending, processing, credited, paid_out, failed, cancelled, clawed_back';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_conversions.is_valid IS
        'Whether this conversion is valid. Set to FALSE if fraud detected (e.g., self-referral attempt, duplicate accounts)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_conversions.clawback_eligible_until IS
        'Date until which the reward can be revoked if the referee cancels/refunds. Typically 30-90 days after conversion.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_conversions.partner_commission_rate IS
        'Commission rate for partner/affiliate conversions (e.g., 0.2000 = 20%)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN referral_conversions.partner_payout_id IS
        'Links to partner_payouts table when commission has been paid out to affiliate';
        """
    )

    # =========================================================================
    # TRIGGER - Update referral_codes conversion counter
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_referral_code_conversion_count()
        RETURNS TRIGGER AS $$
        BEGIN
            IF TG_OP = 'INSERT' THEN
                UPDATE referral_codes
                SET
                    total_conversions = total_conversions + 1,
                    updated_at = NOW()
                WHERE code_id = NEW.referral_code_id;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                UPDATE referral_codes
                SET
                    total_conversions = GREATEST(total_conversions - 1, 0),
                    updated_at = NOW()
                WHERE code_id = OLD.referral_code_id;
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_update_referral_code_conversions ON referral_conversions;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_update_referral_code_conversions
        AFTER INSERT OR DELETE ON referral_conversions
        FOR EACH ROW
        EXECUTE FUNCTION update_referral_code_conversion_count();
        """
    )

    # =========================================================================
    # TRIGGER - Update updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_referral_conversion_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_referral_conversion_updated_at ON referral_conversions;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_referral_conversion_updated_at
        BEFORE UPDATE ON referral_conversions
        FOR EACH ROW
        EXECUTE FUNCTION update_referral_conversion_updated_at();
        """
    )


def downgrade() -> None:
    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trg_referral_conversion_updated_at ON referral_conversions;")
    op.execute("DROP TRIGGER IF EXISTS trg_update_referral_code_conversions ON referral_conversions;")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS update_referral_conversion_updated_at();")
    op.execute("DROP FUNCTION IF EXISTS update_referral_code_conversion_count();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_unique_initial;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_subscription;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_date;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_validation;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_clawback;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_partner_payout;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_partner;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_referee_pending;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_pending_rewards;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_referee;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_referrer;")
    op.execute("DROP INDEX IF EXISTS idx_referral_conversions_code;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS referral_conversions;")
