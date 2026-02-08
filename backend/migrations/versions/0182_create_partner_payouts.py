"""Create partner_payouts table for growth/referral system.

Creates the partner_payouts table to track commission payments to partners.
This is a ledger-style table recording every payout attempt, success, and failure.
Payouts are processed monthly for partners meeting the minimum payout threshold.

Feature: Growth & Referrals - Partner Program (Affiliate Payouts)
Revision ID: 0182
Revises: 0181
Create Date: 2026-02-01
"""

from alembic import op

revision = "0182"
down_revision = "0181"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # PARTNER_PAYOUTS TABLE - Tracks all commission payments to partners
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS partner_payouts (
            payout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Link to partner application
            partner_application_id UUID NOT NULL REFERENCES partner_applications(application_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Payout status workflow
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
                'pending',           -- Payout created, awaiting processing
                'processing',        -- Payment is being processed by gateway
                'completed',         -- Payment successfully sent
                'failed',            -- Payment failed (can retry)
                'cancelled',         -- Payout cancelled before processing
                'refunded',          -- Payout was refunded/reversed
                'on_hold',           -- Payout on hold (verification needed)
                'scheduled'          -- Scheduled for future processing
            )),

            -- Payout amounts
            gross_amount DECIMAL(12, 2) NOT NULL CHECK (gross_amount > 0),
            fees DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (fees >= 0),
            tax_withheld DECIMAL(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax_withheld >= 0),
            net_amount DECIMAL(12, 2) NOT NULL CHECK (net_amount > 0),

            -- Currency
            currency VARCHAR(3) NOT NULL DEFAULT 'INR',
            exchange_rate DECIMAL(12, 6) DEFAULT 1.000000,  -- If converted from USD
            original_currency VARCHAR(3),  -- Original currency before conversion
            original_amount DECIMAL(12, 2),  -- Original amount before conversion

            -- Payment method used
            payout_method VARCHAR(30) NOT NULL CHECK (payout_method IN (
                'bank_transfer',    -- Direct bank deposit
                'stripe_connect',   -- Stripe Connect
                'paypal',           -- PayPal
                'upi',              -- UPI (India)
                'wise',             -- Wise (TransferWise)
                'check'             -- Physical check
            )),

            -- Payment gateway reference IDs
            gateway_payout_id VARCHAR(255),       -- Gateway's payout/transfer ID
            gateway_batch_id VARCHAR(255),        -- Gateway's batch ID (for batch payouts)
            gateway_transaction_id VARCHAR(255),  -- Gateway's transaction reference

            -- Bank/account details (masked for security)
            destination_account_last4 VARCHAR(4),
            destination_account_type VARCHAR(50),  -- 'bank_account', 'paypal_email', 'upi_id', etc.
            destination_name VARCHAR(200),         -- Account holder name

            -- Commission period
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            -- Commission breakdown (from referral_conversions)
            total_conversions INTEGER NOT NULL DEFAULT 0,
            total_revenue_attributed DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            commission_rate DECIMAL(5, 4) NOT NULL,  -- Rate used for this payout

            -- Detailed breakdown stored as JSON for audit trail
            commission_breakdown JSONB DEFAULT '[]',  -- Array of {conversion_id, amount, conversion_date}

            -- Processing timestamps
            scheduled_at TIMESTAMPTZ,      -- When payout was scheduled
            processing_started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            failed_at TIMESTAMPTZ,

            -- Retry handling
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            next_retry_at TIMESTAMPTZ,
            last_error_code VARCHAR(100),
            last_error_message TEXT,

            -- Verification and compliance
            requires_verification BOOLEAN DEFAULT FALSE,
            verified_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            verified_at TIMESTAMPTZ,
            verification_notes TEXT,

            -- Tax information
            tax_year INTEGER,
            tax_form_type VARCHAR(20),  -- '1099-MISC', 'W-8BEN', etc.
            tax_form_generated BOOLEAN DEFAULT FALSE,
            tax_form_sent_at TIMESTAMPTZ,

            -- Invoice/receipt
            invoice_number VARCHAR(50),
            invoice_generated_at TIMESTAMPTZ,
            receipt_url VARCHAR(500),

            -- Audit fields
            initiated_by UUID REFERENCES users(user_id) ON DELETE SET NULL,  -- Who initiated (NULL for automated)
            approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            cancelled_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            cancellation_reason TEXT,

            -- Metadata
            metadata JSONB DEFAULT '{}',
            internal_notes TEXT,  -- Admin-only notes

            -- Timestamps
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT partner_payouts_net_calculation CHECK (
                net_amount = gross_amount - fees - tax_withheld
            ),
            CONSTRAINT partner_payouts_period_valid CHECK (
                period_end >= period_start
            ),
            CONSTRAINT partner_payouts_commission_rate_valid CHECK (
                commission_rate >= 0 AND commission_rate <= 1
            )
        );
        """
    )

    # =========================================================================
    # INDEXES
    # =========================================================================

    # Primary lookup: payouts for a partner application
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_application
        ON partner_payouts (partner_application_id, created_at DESC);
        """
    )

    # User-level queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_user
        ON partner_payouts (user_id, workspace_id, created_at DESC);
        """
    )

    # Workspace-level queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_workspace
        ON partner_payouts (workspace_id, status, created_at DESC);
        """
    )

    # Pending payouts for processing job
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_pending
        ON partner_payouts (status, scheduled_at ASC)
        WHERE status IN ('pending', 'scheduled');
        """
    )

    # Failed payouts for retry job
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_retry
        ON partner_payouts (status, next_retry_at ASC)
        WHERE status = 'failed' AND retry_count < max_retries AND next_retry_at IS NOT NULL;
        """
    )

    # On-hold payouts for verification queue
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_verification
        ON partner_payouts (status, created_at ASC)
        WHERE status = 'on_hold' AND requires_verification = TRUE;
        """
    )

    # Completed payouts by date (for reports)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_completed
        ON partner_payouts (completed_at DESC, payout_method)
        WHERE status = 'completed';
        """
    )

    # Gateway reference lookups
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_gateway
        ON partner_payouts (gateway_payout_id)
        WHERE gateway_payout_id IS NOT NULL;
        """
    )

    # Period-based queries (for finding payouts in a date range)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_period
        ON partner_payouts (period_start, period_end);
        """
    )

    # Invoice number lookup
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_payouts_invoice
        ON partner_payouts (invoice_number)
        WHERE invoice_number IS NOT NULL;
        """
    )

    # Tax year reporting
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_tax_year
        ON partner_payouts (tax_year, user_id, status)
        WHERE tax_year IS NOT NULL AND status = 'completed';
        """
    )

    # Date-based analytics
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_payouts_date
        ON partner_payouts (DATE(created_at), status, payout_method);
        """
    )

    # =========================================================================
    # TABLE AND COLUMN COMMENTS
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE partner_payouts IS
        'Tracks commission payments to partners. Each record represents a payout attempt with full audit trail.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.status IS
        'Payout workflow status: pending, processing, completed, failed, cancelled, refunded, on_hold, scheduled';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.gross_amount IS
        'Total commission amount before fees and tax withholding';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.fees IS
        'Payment processing fees (Stripe, PayPal fees, etc.)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.tax_withheld IS
        'Tax amount withheld at source (TDS for India, backup withholding for US, etc.)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.net_amount IS
        'Amount actually received by partner: gross_amount - fees - tax_withheld';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.gateway_payout_id IS
        'Payment gateway payout/transfer ID (e.g., Stripe Transfer ID, PayPal Payout Item ID)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.commission_breakdown IS
        'JSON array of individual conversions included in this payout: [{conversion_id, amount, date}, ...]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.period_start IS
        'Start date of the commission period covered by this payout';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.period_end IS
        'End date of the commission period covered by this payout';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.retry_count IS
        'Number of times this payout has been retried after failure';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.requires_verification IS
        'Whether this payout requires manual verification before processing (large amounts, new partners, etc.)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_payouts.invoice_number IS
        'Unique invoice/receipt number for this payout (e.g., PAY-2026-00001)';
        """
    )

    # =========================================================================
    # TRIGGER - Update updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_partner_payout_updated_at()
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
        DROP TRIGGER IF EXISTS trg_partner_payout_updated_at ON partner_payouts;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_partner_payout_updated_at
        BEFORE UPDATE ON partner_payouts
        FOR EACH ROW
        EXECUTE FUNCTION update_partner_payout_updated_at();
        """
    )

    # =========================================================================
    # TRIGGER - Set status timestamps when status changes
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_partner_payout_status_timestamps()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Set processing_started_at when status changes to processing
            IF NEW.status = 'processing' AND OLD.status != 'processing' THEN
                NEW.processing_started_at = NOW();
            END IF;

            -- Set completed_at when status changes to completed
            IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
                NEW.completed_at = NOW();
            END IF;

            -- Set failed_at when status changes to failed
            IF NEW.status = 'failed' AND OLD.status != 'failed' THEN
                NEW.failed_at = NOW();
                -- Increment retry count and calculate next retry time (exponential backoff)
                NEW.retry_count = COALESCE(OLD.retry_count, 0) + 1;
                IF NEW.retry_count < NEW.max_retries THEN
                    -- Exponential backoff: 1 hour, 4 hours, 16 hours...
                    NEW.next_retry_at = NOW() + (INTERVAL '1 hour' * POWER(4, NEW.retry_count - 1));
                END IF;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_partner_payout_status_timestamps ON partner_payouts;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_partner_payout_status_timestamps
        BEFORE UPDATE ON partner_payouts
        FOR EACH ROW
        EXECUTE FUNCTION set_partner_payout_status_timestamps();
        """
    )

    # =========================================================================
    # TRIGGER - Update partner_applications.total_commission_paid on completion
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_partner_commission_paid()
        RETURNS TRIGGER AS $$
        BEGIN
            -- When payout is completed, update partner's total_commission_paid
            -- and reduce pending_commission
            IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
                UPDATE partner_applications
                SET
                    total_commission_paid = total_commission_paid + NEW.gross_amount,
                    pending_commission = GREATEST(pending_commission - NEW.gross_amount, 0),
                    last_active_at = NOW(),
                    updated_at = NOW()
                WHERE application_id = NEW.partner_application_id;
            END IF;

            -- If payout is refunded, reverse the update
            IF NEW.status = 'refunded' AND OLD.status = 'completed' THEN
                UPDATE partner_applications
                SET
                    total_commission_paid = GREATEST(total_commission_paid - NEW.gross_amount, 0),
                    pending_commission = pending_commission + NEW.gross_amount,
                    updated_at = NOW()
                WHERE application_id = NEW.partner_application_id;
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_update_partner_commission_paid ON partner_payouts;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_update_partner_commission_paid
        AFTER UPDATE ON partner_payouts
        FOR EACH ROW
        EXECUTE FUNCTION update_partner_commission_paid();
        """
    )

    # =========================================================================
    # FUNCTION - Generate invoice number
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION generate_payout_invoice_number()
        RETURNS TRIGGER AS $$
        DECLARE
            year_part VARCHAR(4);
            sequence_num INTEGER;
            new_invoice VARCHAR(50);
        BEGIN
            -- Only generate if invoice_number is not already set and status is completed
            IF NEW.invoice_number IS NULL AND NEW.status = 'completed' THEN
                year_part := EXTRACT(YEAR FROM NOW())::VARCHAR;

                -- Get next sequence number for this year
                SELECT COALESCE(MAX(
                    CAST(SUBSTRING(invoice_number FROM 'PAY-' || year_part || '-([0-9]+)') AS INTEGER)
                ), 0) + 1
                INTO sequence_num
                FROM partner_payouts
                WHERE invoice_number LIKE 'PAY-' || year_part || '-%';

                -- Format: PAY-2026-00001
                new_invoice := 'PAY-' || year_part || '-' || LPAD(sequence_num::VARCHAR, 5, '0');
                NEW.invoice_number := new_invoice;
                NEW.invoice_generated_at := NOW();
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_generate_payout_invoice ON partner_payouts;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_generate_payout_invoice
        BEFORE UPDATE ON partner_payouts
        FOR EACH ROW
        WHEN (NEW.status = 'completed' AND OLD.status != 'completed')
        EXECUTE FUNCTION generate_payout_invoice_number();
        """
    )


def downgrade() -> None:
    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trg_generate_payout_invoice ON partner_payouts;")
    op.execute("DROP TRIGGER IF EXISTS trg_update_partner_commission_paid ON partner_payouts;")
    op.execute("DROP TRIGGER IF EXISTS trg_partner_payout_status_timestamps ON partner_payouts;")
    op.execute("DROP TRIGGER IF EXISTS trg_partner_payout_updated_at ON partner_payouts;")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS generate_payout_invoice_number();")
    op.execute("DROP FUNCTION IF EXISTS update_partner_commission_paid();")
    op.execute("DROP FUNCTION IF EXISTS set_partner_payout_status_timestamps();")
    op.execute("DROP FUNCTION IF EXISTS update_partner_payout_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_date;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_tax_year;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_invoice;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_period;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_gateway;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_completed;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_verification;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_retry;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_pending;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_user;")
    op.execute("DROP INDEX IF EXISTS idx_partner_payouts_application;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS partner_payouts;")
