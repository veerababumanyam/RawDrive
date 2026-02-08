"""Create user_credits ledger table for growth/referral system.

Creates the user_credits table to track all credit transactions for users.
This is a ledger-style table that records every credit addition and deduction,
supporting referral rewards, setup goal completions, promotional credits,
and credit usage for AI features.

Feature: Growth & Referrals - Credit Ledger System
Revision ID: 0180
Revises: 0179
Create Date: 2026-02-01
"""

from alembic import op

revision = "0180"
down_revision = "0179"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # USER_CREDITS TABLE - Credit ledger for tracking all credit transactions
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_credits (
            credit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Transaction type: credit (add) or debit (subtract)
            transaction_type VARCHAR(10) NOT NULL CHECK (transaction_type IN ('credit', 'debit')),

            -- Amount of credits (always positive, type determines direction)
            amount INTEGER NOT NULL CHECK (amount > 0),

            -- Running balance after this transaction
            balance_after INTEGER NOT NULL CHECK (balance_after >= 0),

            -- Source/reason for this credit transaction
            source VARCHAR(50) NOT NULL CHECK (source IN (
                -- Credit sources (adding credits)
                'referral_reward',       -- Received for referring a new user
                'referee_bonus',         -- Received as the referred user
                'setup_goal',            -- Completed a setup/onboarding goal
                'promotional',           -- Marketing/promotional credits
                'purchased',             -- Bought credit pack
                'subscription_bonus',    -- Monthly credits from subscription
                'admin_adjustment',      -- Manual adjustment by admin
                'refund',                -- Refunded credits from failed operation
                'migration',             -- Credits migrated from legacy system
                'partner_bonus',         -- Partner program bonus

                -- Debit sources (using credits)
                'ai_generation',         -- Used for AI image generation
                'ai_culling',            -- Used for AI photo culling
                'ai_tagging',            -- Used for AI tagging/keywording
                'ai_face_recognition',   -- Used for face recognition processing
                'ai_enhancement',        -- Used for AI image enhancement
                'ai_background_removal', -- Used for background removal
                'ai_other',              -- Other AI features
                'expiration',            -- Credits expired
                'admin_deduction',       -- Manual deduction by admin
                'clawback'               -- Reversed due to refund/fraud
            )),

            -- Reference to related entity (depends on source)
            reference_type VARCHAR(50),  -- 'referral_conversion', 'setup_goal', 'ai_job', 'purchase', etc.
            reference_id UUID,           -- ID of the related entity

            -- Additional context
            description TEXT,
            metadata JSONB DEFAULT '{}',

            -- Expiration tracking (some credits may expire)
            expires_at TIMESTAMPTZ,
            expired_at TIMESTAMPTZ,  -- When credits actually expired (for partial expiration tracking)

            -- Audit fields
            created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,  -- Who initiated (NULL for system)
            ip_address INET,

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT user_credits_balance_consistency CHECK (
                (transaction_type = 'credit' AND balance_after >= amount) OR
                (transaction_type = 'debit')
            )
        );
        """
    )

    # =========================================================================
    # USER_CREDIT_BALANCES VIEW - Materialized view for current balances
    # =========================================================================
    # This provides fast access to current balance without summing all transactions
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_credit_balances (
            balance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Current balance
            current_balance INTEGER NOT NULL DEFAULT 0 CHECK (current_balance >= 0),

            -- Lifetime statistics
            total_credits_earned INTEGER NOT NULL DEFAULT 0,
            total_credits_used INTEGER NOT NULL DEFAULT 0,
            total_credits_expired INTEGER NOT NULL DEFAULT 0,

            -- Balance breakdown by source (for analytics)
            balance_from_referrals INTEGER NOT NULL DEFAULT 0,
            balance_from_goals INTEGER NOT NULL DEFAULT 0,
            balance_from_subscription INTEGER NOT NULL DEFAULT 0,
            balance_from_purchases INTEGER NOT NULL DEFAULT 0,
            balance_from_promotions INTEGER NOT NULL DEFAULT 0,

            -- Usage tracking
            last_credit_at TIMESTAMPTZ,
            last_usage_at TIMESTAMPTZ,

            -- Reserved credits (for in-progress operations)
            reserved_balance INTEGER NOT NULL DEFAULT 0 CHECK (reserved_balance >= 0),

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Unique constraint - one balance record per user per workspace
            CONSTRAINT user_credit_balances_unique UNIQUE (workspace_id, user_id)
        );
        """
    )

    # =========================================================================
    # INDEXES FOR USER_CREDITS
    # =========================================================================

    # Primary lookup: get transactions for a user
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credits_user
        ON user_credits (user_id, workspace_id, created_at DESC);
        """
    )

    # Workspace-level queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credits_workspace
        ON user_credits (workspace_id, created_at DESC);
        """
    )

    # Source-based queries (e.g., "all referral rewards")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credits_source
        ON user_credits (source, created_at DESC);
        """
    )

    # Reference lookups (e.g., "credits for this conversion")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credits_reference
        ON user_credits (reference_type, reference_id)
        WHERE reference_id IS NOT NULL;
        """
    )

    # Expiring credits (for expiration job)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credits_expiring
        ON user_credits (expires_at)
        WHERE expires_at IS NOT NULL
        AND expired_at IS NULL
        AND transaction_type = 'credit';
        """
    )

    # Transaction type filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credits_type
        ON user_credits (transaction_type, source, created_at DESC);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credits_date
        ON user_credits (created_at, source, transaction_type);
        """
    )

    # =========================================================================
    # INDEXES FOR USER_CREDIT_BALANCES
    # =========================================================================

    # Primary lookup by user
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credit_balances_user
        ON user_credit_balances (user_id, workspace_id);
        """
    )

    # Workspace-level queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_user_credit_balances_workspace
        ON user_credit_balances (workspace_id, current_balance DESC);
        """
    )

    # =========================================================================
    # FUNCTIONS AND TRIGGERS
    # =========================================================================

    # Function to update balance when credit transaction is inserted
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_user_credit_balance()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Ensure balance record exists
            INSERT INTO user_credit_balances (workspace_id, user_id, current_balance)
            VALUES (NEW.workspace_id, NEW.user_id, 0)
            ON CONFLICT (workspace_id, user_id) DO NOTHING;

            -- Update balance based on transaction type
            IF NEW.transaction_type = 'credit' THEN
                UPDATE user_credit_balances
                SET
                    current_balance = current_balance + NEW.amount,
                    total_credits_earned = total_credits_earned + NEW.amount,
                    last_credit_at = NOW(),
                    updated_at = NOW(),
                    -- Update source-specific balances
                    balance_from_referrals = CASE
                        WHEN NEW.source IN ('referral_reward', 'referee_bonus')
                        THEN balance_from_referrals + NEW.amount
                        ELSE balance_from_referrals
                    END,
                    balance_from_goals = CASE
                        WHEN NEW.source = 'setup_goal'
                        THEN balance_from_goals + NEW.amount
                        ELSE balance_from_goals
                    END,
                    balance_from_subscription = CASE
                        WHEN NEW.source = 'subscription_bonus'
                        THEN balance_from_subscription + NEW.amount
                        ELSE balance_from_subscription
                    END,
                    balance_from_purchases = CASE
                        WHEN NEW.source = 'purchased'
                        THEN balance_from_purchases + NEW.amount
                        ELSE balance_from_purchases
                    END,
                    balance_from_promotions = CASE
                        WHEN NEW.source IN ('promotional', 'partner_bonus', 'admin_adjustment')
                        THEN balance_from_promotions + NEW.amount
                        ELSE balance_from_promotions
                    END
                WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id;

            ELSIF NEW.transaction_type = 'debit' THEN
                UPDATE user_credit_balances
                SET
                    current_balance = current_balance - NEW.amount,
                    total_credits_used = CASE
                        WHEN NEW.source NOT IN ('expiration', 'clawback')
                        THEN total_credits_used + NEW.amount
                        ELSE total_credits_used
                    END,
                    total_credits_expired = CASE
                        WHEN NEW.source = 'expiration'
                        THEN total_credits_expired + NEW.amount
                        ELSE total_credits_expired
                    END,
                    last_usage_at = CASE
                        WHEN NEW.source NOT IN ('expiration', 'clawback', 'admin_deduction')
                        THEN NOW()
                        ELSE last_usage_at
                    END,
                    updated_at = NOW()
                WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Trigger to auto-update balance on insert
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_update_user_credit_balance ON user_credits;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_update_user_credit_balance
        AFTER INSERT ON user_credits
        FOR EACH ROW
        EXECUTE FUNCTION update_user_credit_balance();
        """
    )

    # Function to calculate and set balance_after before insert
    op.execute(
        """
        CREATE OR REPLACE FUNCTION calculate_credit_balance_after()
        RETURNS TRIGGER AS $$
        DECLARE
            current_bal INTEGER;
        BEGIN
            -- Get current balance (or 0 if no record exists)
            SELECT COALESCE(current_balance, 0) INTO current_bal
            FROM user_credit_balances
            WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id;

            IF current_bal IS NULL THEN
                current_bal := 0;
            END IF;

            -- Calculate balance_after
            IF NEW.transaction_type = 'credit' THEN
                NEW.balance_after := current_bal + NEW.amount;
            ELSIF NEW.transaction_type = 'debit' THEN
                -- Ensure sufficient balance
                IF current_bal < NEW.amount THEN
                    RAISE EXCEPTION 'Insufficient credit balance: have %, need %', current_bal, NEW.amount;
                END IF;
                NEW.balance_after := current_bal - NEW.amount;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    # Trigger to calculate balance_after before insert
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_calculate_credit_balance_after ON user_credits;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_calculate_credit_balance_after
        BEFORE INSERT ON user_credits
        FOR EACH ROW
        EXECUTE FUNCTION calculate_credit_balance_after();
        """
    )

    # =========================================================================
    # TABLE AND COLUMN COMMENTS
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE user_credits IS
        'Ledger table tracking all credit transactions for users. Supports referral rewards, setup goal completions, promotional credits, and AI feature usage.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credits.transaction_type IS
        'Type of transaction: credit (adding credits) or debit (using/removing credits)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credits.amount IS
        'Number of credits for this transaction (always positive, type determines direction)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credits.balance_after IS
        'Running balance after this transaction was applied. Auto-calculated by trigger.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credits.source IS
        'Source/reason for this transaction: referral_reward, setup_goal, ai_generation, etc.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credits.reference_type IS
        'Type of related entity: referral_conversion, setup_goal, ai_job, purchase, etc.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credits.reference_id IS
        'UUID of the related entity (e.g., conversion_id for referral rewards)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credits.expires_at IS
        'When these credits expire. NULL means no expiration. Only applicable to credit transactions.';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE user_credit_balances IS
        'Denormalized table storing current credit balances per user. Updated automatically by triggers on user_credits.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN user_credit_balances.reserved_balance IS
        'Credits reserved for in-progress operations (e.g., AI job queued but not yet processed). Cannot be spent.';
        """
    )


def downgrade() -> None:
    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trg_calculate_credit_balance_after ON user_credits;")
    op.execute("DROP TRIGGER IF EXISTS trg_update_user_credit_balance ON user_credits;")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS calculate_credit_balance_after();")
    op.execute("DROP FUNCTION IF EXISTS update_user_credit_balance();")

    # Drop indexes for user_credit_balances
    op.execute("DROP INDEX IF EXISTS idx_user_credit_balances_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_user_credit_balances_user;")

    # Drop indexes for user_credits
    op.execute("DROP INDEX IF EXISTS idx_user_credits_date;")
    op.execute("DROP INDEX IF EXISTS idx_user_credits_type;")
    op.execute("DROP INDEX IF EXISTS idx_user_credits_expiring;")
    op.execute("DROP INDEX IF EXISTS idx_user_credits_reference;")
    op.execute("DROP INDEX IF EXISTS idx_user_credits_source;")
    op.execute("DROP INDEX IF EXISTS idx_user_credits_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_user_credits_user;")

    # Drop tables
    op.execute("DROP TABLE IF EXISTS user_credit_balances;")
    op.execute("DROP TABLE IF EXISTS user_credits;")
