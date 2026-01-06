"""Create payment_transactions table with idempotency keys.

This migration creates the payment_transactions table to track all payment
events from Stripe webhooks and direct API calls. Key features:

1. Idempotency Keys: Unique constraint on idempotency_key prevents duplicate
   processing of webhook events (Stripe retries same event_id)

2. Transaction Types: Supports various transaction types:
   - payment: Initial payment for subscription
   - refund: Full or partial refund
   - chargeback: Disputed transaction
   - adjustment: Manual adjustment
   - fee: Platform/processing fees

3. Webhook Integration: Stores Stripe event IDs and webhook data for
   audit trail and debugging

4. Foreign Keys: Links to workspace, subscription, invoice for full
   transaction context

5. Status Tracking: Tracks transaction lifecycle (pending -> succeeded/failed)

Feature: Automated Onboarding System
Task: T004 - Create payment_transactions table with idempotency keys
Revision ID: 0097
Revises: 0096
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0097"
down_revision = "0096"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create payment_transactions table with idempotency keys."""

    # =========================================================================
    # CREATE PAYMENT_TRANSACTIONS TABLE
    # =========================================================================

    op.execute("""
        CREATE TABLE IF NOT EXISTS payment_transactions (
            -- Primary key: UUID for transaction identification
            transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Idempotency key: Unique identifier to prevent duplicate processing
            -- For Stripe webhooks, this is typically the event ID (evt_xxx)
            -- For API calls, this is a client-generated UUID
            idempotency_key VARCHAR(255) NOT NULL UNIQUE,

            -- Workspace association (required for multi-tenant isolation)
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Subscription association (optional, NULL for one-time payments)
            subscription_id UUID REFERENCES workspace_subscriptions(subscription_id) ON DELETE SET NULL,

            -- Invoice association (optional, created after successful payment)
            invoice_id UUID REFERENCES invoices(invoice_id) ON DELETE SET NULL,

            -- Onboarding session association (for tracking onboarding payments)
            onboarding_session_id UUID REFERENCES onboarding_sessions(session_id) ON DELETE SET NULL,

            -- Transaction type
            transaction_type VARCHAR(30) NOT NULL DEFAULT 'payment'
                CHECK (transaction_type IN ('payment', 'refund', 'chargeback', 'adjustment', 'fee', 'payout')),

            -- Transaction status
            status VARCHAR(30) NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'canceled', 'requires_action', 'disputed')),

            -- =========================================================================
            -- STRIPE INTEGRATION FIELDS
            -- =========================================================================

            -- Stripe Payment Intent ID (pi_xxx)
            stripe_payment_intent_id VARCHAR(255),

            -- Stripe Charge ID (ch_xxx) - actual charge record
            stripe_charge_id VARCHAR(255),

            -- Stripe Refund ID (re_xxx) - for refund transactions
            stripe_refund_id VARCHAR(255),

            -- Stripe Event ID (evt_xxx) - webhook event that created this record
            stripe_event_id VARCHAR(255),

            -- Stripe Event Type (e.g., 'payment_intent.succeeded', 'charge.refunded')
            stripe_event_type VARCHAR(100),

            -- Payment method used (pm_xxx or card_xxx)
            stripe_payment_method_id VARCHAR(255),

            -- =========================================================================
            -- AMOUNT FIELDS
            -- =========================================================================

            -- Gross amount (before fees)
            amount DECIMAL(12,2) NOT NULL,

            -- Currency (ISO 4217 code)
            currency VARCHAR(3) NOT NULL DEFAULT 'INR',

            -- Processing fee (Stripe fees)
            fee_amount DECIMAL(12,2) DEFAULT 0,

            -- Net amount (amount - fee_amount)
            net_amount DECIMAL(12,2),

            -- For refunds: amount being refunded (can be partial)
            refund_amount DECIMAL(12,2),

            -- Tax amount (GST/VAT) if applicable
            tax_amount DECIMAL(12,2),

            -- =========================================================================
            -- PAYMENT METHOD DETAILS (for audit/display)
            -- =========================================================================

            -- Payment method type: card, upi, netbanking, wallet
            payment_method_type VARCHAR(30),

            -- Card details (for card payments)
            card_brand VARCHAR(20),        -- visa, mastercard, amex, etc.
            card_last_four VARCHAR(4),     -- Last 4 digits
            card_exp_month INT,
            card_exp_year INT,

            -- Bank/UPI details (for Indian payments)
            bank_name VARCHAR(100),
            upi_id VARCHAR(100),

            -- =========================================================================
            -- ERROR HANDLING
            -- =========================================================================

            -- Error code from payment provider
            error_code VARCHAR(100),

            -- Human-readable error message
            error_message TEXT,

            -- Decline code for card declines
            decline_code VARCHAR(100),

            -- Number of retry attempts
            retry_count INT DEFAULT 0,

            -- =========================================================================
            -- METADATA AND AUDIT
            -- =========================================================================

            -- Description/memo for the transaction
            description TEXT,

            -- Raw webhook payload (for debugging and audit)
            webhook_payload JSONB,

            -- Response from Stripe API (for debugging)
            provider_response JSONB,

            -- Flexible metadata (promo codes, campaign tracking, etc.)
            metadata JSONB DEFAULT '{}',

            -- IP address of the user (for fraud detection)
            ip_address INET,

            -- =========================================================================
            -- TIMESTAMPS
            -- =========================================================================

            -- When transaction was created in our system
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- When transaction was last updated
            updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

            -- When payment was confirmed by provider
            confirmed_at TIMESTAMPTZ,

            -- When refund was processed (for refund transactions)
            refunded_at TIMESTAMPTZ,

            -- When dispute was opened (for chargebacks)
            disputed_at TIMESTAMPTZ,

            -- Provider timestamp (from Stripe event)
            provider_created_at TIMESTAMPTZ
        );
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Primary lookup by idempotency key (unique, for duplicate detection)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_transactions_idempotency
        ON payment_transactions(idempotency_key);
    """)

    # Workspace-based queries (all transactions for a workspace)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_workspace
        ON payment_transactions(workspace_id, created_at DESC);
    """)

    # Subscription-based queries (all transactions for a subscription)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription
        ON payment_transactions(subscription_id)
        WHERE subscription_id IS NOT NULL;
    """)

    # Invoice-based queries
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice
        ON payment_transactions(invoice_id)
        WHERE invoice_id IS NOT NULL;
    """)

    # Onboarding session queries (payment during onboarding)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_onboarding
        ON payment_transactions(onboarding_session_id)
        WHERE onboarding_session_id IS NOT NULL;
    """)

    # Stripe Payment Intent lookup (for webhook processing)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_pi
        ON payment_transactions(stripe_payment_intent_id)
        WHERE stripe_payment_intent_id IS NOT NULL;
    """)

    # Stripe Charge lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_charge
        ON payment_transactions(stripe_charge_id)
        WHERE stripe_charge_id IS NOT NULL;
    """)

    # Stripe Event lookup (for idempotent webhook processing)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_stripe_event
        ON payment_transactions(stripe_event_id)
        WHERE stripe_event_id IS NOT NULL;
    """)

    # Status-based queries (pending payments, failed payments)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_status
        ON payment_transactions(status, created_at DESC);
    """)

    # Transaction type queries (all refunds, all chargebacks)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_type
        ON payment_transactions(transaction_type, status);
    """)

    # Failed transactions for retry logic
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_failed
        ON payment_transactions(status, retry_count, updated_at)
        WHERE status = 'failed' AND retry_count < 3;
    """)

    # Disputed transactions for monitoring
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_disputed
        ON payment_transactions(disputed_at)
        WHERE status = 'disputed';
    """)

    # Date range queries for reporting
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_date
        ON payment_transactions(created_at DESC);
    """)

    # Currency-based reporting
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_payment_transactions_currency
        ON payment_transactions(currency, created_at DESC)
        WHERE status = 'succeeded';
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION update_payment_transactions_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at ON payment_transactions;
        CREATE TRIGGER trigger_payment_transactions_updated_at
        BEFORE UPDATE ON payment_transactions
        FOR EACH ROW
        EXECUTE FUNCTION update_payment_transactions_updated_at();
    """)

    # =========================================================================
    # CREATE TRIGGER TO AUTO-CALCULATE NET AMOUNT
    # =========================================================================

    op.execute("""
        CREATE OR REPLACE FUNCTION calculate_payment_transaction_net_amount()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Calculate net_amount as amount minus fees
            IF NEW.amount IS NOT NULL THEN
                NEW.net_amount = NEW.amount - COALESCE(NEW.fee_amount, 0);
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trigger_payment_transactions_net_amount ON payment_transactions;
        CREATE TRIGGER trigger_payment_transactions_net_amount
        BEFORE INSERT OR UPDATE OF amount, fee_amount ON payment_transactions
        FOR EACH ROW
        EXECUTE FUNCTION calculate_payment_transaction_net_amount();
    """)

    # =========================================================================
    # ADD COMMENTS FOR DOCUMENTATION
    # =========================================================================

    op.execute("""
        COMMENT ON TABLE payment_transactions IS
        'Records all payment transactions from Stripe webhooks and API calls with idempotency support';
    """)

    op.execute("""
        COMMENT ON COLUMN payment_transactions.idempotency_key IS
        'Unique key to prevent duplicate transaction processing. For Stripe webhooks, use event_id (evt_xxx)';
    """)

    op.execute("""
        COMMENT ON COLUMN payment_transactions.transaction_type IS
        'Type of transaction: payment (initial charge), refund, chargeback, adjustment, fee, payout';
    """)

    op.execute("""
        COMMENT ON COLUMN payment_transactions.status IS
        'Transaction status: pending, processing, succeeded, failed, canceled, requires_action, disputed';
    """)

    op.execute("""
        COMMENT ON COLUMN payment_transactions.stripe_event_id IS
        'Stripe webhook event ID (evt_xxx) that triggered this transaction record';
    """)

    op.execute("""
        COMMENT ON COLUMN payment_transactions.webhook_payload IS
        'Raw JSON payload from Stripe webhook for audit trail and debugging';
    """)

    op.execute("""
        COMMENT ON COLUMN payment_transactions.net_amount IS
        'Net amount after fees (auto-calculated via trigger)';
    """)

    op.execute("""
        COMMENT ON COLUMN payment_transactions.retry_count IS
        'Number of retry attempts for failed transactions (used by dunning logic)';
    """)


def downgrade() -> None:
    """Drop payment_transactions table and related objects."""

    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trigger_payment_transactions_net_amount ON payment_transactions;")
    op.execute("DROP FUNCTION IF EXISTS calculate_payment_transaction_net_amount();")
    op.execute("DROP TRIGGER IF EXISTS trigger_payment_transactions_updated_at ON payment_transactions;")
    op.execute("DROP FUNCTION IF EXISTS update_payment_transactions_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_currency;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_created_date;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_disputed;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_failed;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_type;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_status;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_stripe_event;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_stripe_charge;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_stripe_pi;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_onboarding;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_invoice;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_subscription;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_payment_transactions_idempotency;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS payment_transactions;")
