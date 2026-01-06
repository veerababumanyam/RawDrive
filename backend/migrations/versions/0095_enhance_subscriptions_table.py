"""Enhance workspace_subscriptions table for automated onboarding system.

This migration adds fields to the existing workspace_subscriptions table to support:
- Stripe payment integration (customer ID, subscription ID, payment method)
- Billing cycle management (monthly/annual, currency)
- Subscription lifecycle tracking (activated_at, canceled_at, cancellation_reason)
- Payment status tracking (last_payment_at, next_payment_at, payment_status)
- Audit metadata (metadata JSONB for additional tracking)

The enhanced subscriptions table supports the onboarding flow where users
complete payment through Stripe and have their subscription activated
with proper billing cycle tracking.

Feature: Automated Onboarding System
Task: T002 - Create subscriptions table with workspace relationship
Revision ID: 0095
Revises: 0094
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0095"
down_revision = "0094"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add enhanced fields to workspace_subscriptions table for onboarding system."""

    # =========================================================================
    # ADD STRIPE INTEGRATION COLUMNS
    # =========================================================================

    # Stripe customer ID for payment processing
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
    """)

    # Stripe subscription ID for recurring billing
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
    """)

    # Stripe payment method ID (for retrying failed payments)
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS stripe_payment_method_id VARCHAR(255);
    """)

    # =========================================================================
    # ADD BILLING CYCLE COLUMNS
    # =========================================================================

    # Billing interval: monthly or annual
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(20) DEFAULT 'monthly';
    """)

    # Add CHECK constraint for billing_interval
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE workspace_subscriptions
            ADD CONSTRAINT subscriptions_billing_interval_check
            CHECK (billing_interval IN ('monthly', 'annual'));
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Currency for this subscription's billing
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'INR';
    """)

    # Amount being billed per period (stored for historical accuracy)
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS amount_per_period DECIMAL(10,2);
    """)

    # =========================================================================
    # ADD LIFECYCLE TRACKING COLUMNS
    # =========================================================================

    # When subscription was activated (trial converted or first payment)
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
    """)

    # When subscription was canceled
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
    """)

    # Reason for cancellation (for analytics and retention efforts)
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(255);
    """)

    # When subscription will expire (after cancellation at period end)
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    """)

    # =========================================================================
    # ADD PAYMENT STATUS TRACKING COLUMNS
    # =========================================================================

    # Last successful payment timestamp
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;
    """)

    # Next scheduled payment timestamp
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS next_payment_at TIMESTAMPTZ;
    """)

    # Payment status for tracking payment health
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'none';
    """)

    # Add CHECK constraint for payment_status
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE workspace_subscriptions
            ADD CONSTRAINT subscriptions_payment_status_check
            CHECK (payment_status IN ('none', 'succeeded', 'pending', 'failed', 'requires_action'));
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Number of failed payment attempts (for dunning management)
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS failed_payment_count INT DEFAULT 0;
    """)

    # =========================================================================
    # ADD STATUS CONSTRAINT
    # =========================================================================

    # Add CHECK constraint for status field (may not exist from initial migration)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE workspace_subscriptions
            ADD CONSTRAINT subscriptions_status_check
            CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired', 'paused', 'incomplete'));
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # =========================================================================
    # ADD METADATA COLUMN
    # =========================================================================

    # JSONB for flexible metadata storage (onboarding source, promo codes, etc.)
    op.execute("""
        ALTER TABLE workspace_subscriptions
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Index for looking up subscriptions by Stripe customer ID
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
        ON workspace_subscriptions(stripe_customer_id)
        WHERE stripe_customer_id IS NOT NULL;
    """)

    # Index for looking up subscriptions by Stripe subscription ID
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
        ON workspace_subscriptions(stripe_subscription_id)
        WHERE stripe_subscription_id IS NOT NULL;
    """)

    # Index for querying subscriptions by status
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status
        ON workspace_subscriptions(status);
    """)

    # Index for active subscriptions (commonly queried)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscriptions_active
        ON workspace_subscriptions(workspace_id)
        WHERE status IN ('trialing', 'active');
    """)

    # Index for subscriptions expiring soon (for renewal reminders)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscriptions_expiring
        ON workspace_subscriptions(current_period_end)
        WHERE status IN ('trialing', 'active') AND current_period_end IS NOT NULL;
    """)

    # Index for past due subscriptions (for dunning workflows)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_subscriptions_past_due
        ON workspace_subscriptions(failed_payment_count, last_payment_at)
        WHERE status = 'past_due';
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    # Create function for updating timestamp if it doesn't exist
    op.execute("""
        CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Create trigger to auto-update the updated_at column
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON workspace_subscriptions;
        CREATE TRIGGER trigger_subscriptions_updated_at
        BEFORE UPDATE ON workspace_subscriptions
        FOR EACH ROW
        EXECUTE FUNCTION update_subscriptions_updated_at();
    """)

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE workspace_subscriptions IS
        'Workspace subscription records linking workspaces to subscription plans with Stripe integration';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_subscriptions.stripe_customer_id IS
        'Stripe Customer ID for payment processing (cus_xxx)';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_subscriptions.stripe_subscription_id IS
        'Stripe Subscription ID for recurring billing (sub_xxx)';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_subscriptions.billing_interval IS
        'Billing frequency: monthly or annual';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_subscriptions.payment_status IS
        'Current payment status: none, succeeded, pending, failed, requires_action';
    """)

    op.execute("""
        COMMENT ON COLUMN workspace_subscriptions.metadata IS
        'Flexible JSONB for additional data: onboarding source, promo codes, UTM params, etc.';
    """)


def downgrade() -> None:
    """Remove enhanced fields from workspace_subscriptions table."""

    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON workspace_subscriptions;")
    op.execute("DROP FUNCTION IF EXISTS update_subscriptions_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_past_due;")
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_expiring;")
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_active;")
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_status;")
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_stripe_subscription;")
    op.execute("DROP INDEX IF EXISTS idx_subscriptions_stripe_customer;")

    # Drop constraints
    op.execute("ALTER TABLE workspace_subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;")
    op.execute("ALTER TABLE workspace_subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_status_check;")
    op.execute("ALTER TABLE workspace_subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;")

    # Drop new columns (in reverse order of creation)
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS metadata;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS failed_payment_count;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS payment_status;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS next_payment_at;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS last_payment_at;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS expires_at;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS cancellation_reason;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS canceled_at;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS activated_at;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS amount_per_period;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS currency;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS billing_interval;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS stripe_payment_method_id;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS stripe_subscription_id;")
    op.execute("ALTER TABLE workspace_subscriptions DROP COLUMN IF EXISTS stripe_customer_id;")
