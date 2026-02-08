"""Create partner_applications table for growth/referral system.

Creates the partner_applications table to track applications to the partner/affiliate
program. Partners are users (typically educators, influencers, or agencies) who want
to earn commission by referring new paying customers to RawDrive.

Feature: Growth & Referrals - Partner Program (Affiliate)
Revision ID: 0181
Revises: 0180
Create Date: 2026-02-01
"""

from alembic import op

revision = "0181"
down_revision = "0180"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # PARTNER_APPLICATIONS TABLE - Tracks partner/affiliate program applications
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS partner_applications (
            application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,

            -- Application status workflow
            status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
                'pending',       -- Application submitted, awaiting review
                'under_review',  -- Admin is actively reviewing
                'approved',      -- Application accepted, partner is active
                'rejected',      -- Application denied
                'suspended',     -- Partner account suspended (fraud, violation)
                'terminated',    -- Partner account permanently terminated
                'withdrawn'      -- Applicant withdrew their application
            )),

            -- Applicant information
            company_name VARCHAR(200),
            company_website VARCHAR(500),
            company_description TEXT,

            -- Business type
            business_type VARCHAR(50) CHECK (business_type IN (
                'individual',        -- Solo photographer/influencer
                'photography_studio', -- Photography business
                'education',         -- Photography educator/course creator
                'agency',            -- Marketing/creative agency
                'media_publication', -- Blog/magazine/publication
                'youtube_channel',   -- YouTube creator
                'social_influencer', -- Instagram/TikTok influencer
                'software_company',  -- Tech company/SaaS
                'other'
            )),

            -- Audience information
            audience_size VARCHAR(30) CHECK (audience_size IN (
                'under_1k',
                '1k_10k',
                '10k_50k',
                '50k_100k',
                '100k_500k',
                '500k_1m',
                'over_1m'
            )),
            primary_audience VARCHAR(100),  -- e.g., "Wedding photographers", "Portrait photographers"
            audience_geography VARCHAR(200),  -- e.g., "India, USA, UK"

            -- Social media / presence
            social_links JSONB DEFAULT '{}',  -- {"instagram": "...", "youtube": "...", "twitter": "...", "linkedin": "..."}
            portfolio_url VARCHAR(500),

            -- Application details
            promotion_methods TEXT,  -- How they plan to promote RawDrive
            monthly_reach INTEGER,  -- Estimated monthly audience reach
            referral_estimate INTEGER,  -- Expected monthly referrals

            -- Contact information (may differ from user's default)
            contact_email VARCHAR(255),
            contact_phone VARCHAR(50),
            contact_name VARCHAR(200),

            -- Terms acceptance
            terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
            terms_accepted_at TIMESTAMPTZ,
            terms_version VARCHAR(20),  -- Version of partner terms accepted

            -- Tax information (for payouts)
            tax_id VARCHAR(100),  -- PAN for India, EIN/SSN for US, etc.
            tax_country VARCHAR(3),  -- ISO 3166-1 alpha-3
            tax_form_submitted BOOLEAN DEFAULT FALSE,
            tax_form_verified BOOLEAN DEFAULT FALSE,

            -- Payout configuration
            payout_method VARCHAR(30) CHECK (payout_method IN (
                'bank_transfer',    -- Direct bank deposit
                'stripe_connect',   -- Stripe Connect
                'paypal',           -- PayPal
                'upi',              -- UPI (India)
                'wise',             -- Wise (TransferWise)
                'check'             -- Physical check
            )),
            payout_details JSONB DEFAULT '{}',  -- Encrypted/tokenized payout info
            payout_currency VARCHAR(3) DEFAULT 'INR',
            payout_minimum DECIMAL(10, 2) DEFAULT 2000.00,  -- Minimum balance for payout

            -- Commission configuration
            commission_rate DECIMAL(5, 4) DEFAULT 0.2000,  -- Default 20%
            commission_type VARCHAR(20) DEFAULT 'percentage' CHECK (commission_type IN (
                'percentage',    -- Percentage of subscription revenue
                'fixed_amount',  -- Fixed amount per conversion
                'tiered'         -- Tiered based on volume (configured in metadata)
            )),
            commission_duration_months INTEGER DEFAULT 12,  -- How long to pay commission (0 = first month only, NULL = lifetime)

            -- Partner tier (can unlock higher commission rates)
            partner_tier VARCHAR(20) DEFAULT 'standard' CHECK (partner_tier IN (
                'standard',   -- Default tier: 20% commission
                'silver',     -- 22% commission, priority support
                'gold',       -- 25% commission, co-marketing opportunities
                'platinum'    -- 30% commission, dedicated partner manager
            )),
            tier_upgraded_at TIMESTAMPTZ,

            -- Performance tracking (denormalized for quick access)
            total_clicks INTEGER NOT NULL DEFAULT 0,
            total_signups INTEGER NOT NULL DEFAULT 0,
            total_conversions INTEGER NOT NULL DEFAULT 0,
            total_revenue_generated DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            total_commission_earned DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            total_commission_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            pending_commission DECIMAL(12, 2) NOT NULL DEFAULT 0.00,

            -- Analytics period tracking
            conversions_this_month INTEGER NOT NULL DEFAULT 0,
            revenue_this_month DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            analytics_reset_at TIMESTAMPTZ DEFAULT DATE_TRUNC('month', NOW()),

            -- Review and approval
            reviewed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            reviewed_at TIMESTAMPTZ,
            review_notes TEXT,
            rejection_reason VARCHAR(200),

            -- Partner referral code link
            referral_code_id UUID REFERENCES referral_codes(code_id) ON DELETE SET NULL,

            -- Additional metadata
            metadata JSONB DEFAULT '{}',
            internal_notes TEXT,  -- Admin-only notes

            -- Compliance flags
            is_verified BOOLEAN DEFAULT FALSE,
            verified_at TIMESTAMPTZ,
            requires_manual_review BOOLEAN DEFAULT FALSE,
            fraud_flags JSONB DEFAULT '[]',  -- Array of fraud indicators

            -- Timestamps
            applied_at TIMESTAMPTZ DEFAULT NOW(),
            approved_at TIMESTAMPTZ,
            suspended_at TIMESTAMPTZ,
            terminated_at TIMESTAMPTZ,
            last_active_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT partner_applications_commission_rate_valid CHECK (
                commission_rate >= 0 AND commission_rate <= 1
            ),
            CONSTRAINT partner_applications_payout_minimum_positive CHECK (
                payout_minimum >= 0
            )
        );
        """
    )

    # =========================================================================
    # INDEXES
    # =========================================================================

    # Primary lookup: find partner by user
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_user
        ON partner_applications (user_id, workspace_id);
        """
    )

    # Workspace-level queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_workspace
        ON partner_applications (workspace_id, status, created_at DESC);
        """
    )

    # Admin review queue: pending applications
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_pending
        ON partner_applications (status, applied_at ASC)
        WHERE status IN ('pending', 'under_review');
        """
    )

    # Active partners lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_active
        ON partner_applications (user_id, status)
        WHERE status = 'approved';
        """
    )

    # Partner tier queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_tier
        ON partner_applications (partner_tier, total_conversions DESC)
        WHERE status = 'approved';
        """
    )

    # Payout processing: partners with pending commission
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_payout
        ON partner_applications (payout_method, pending_commission DESC)
        WHERE status = 'approved' AND pending_commission > 0;
        """
    )

    # Top performers: leaderboard queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_leaderboard
        ON partner_applications (total_revenue_generated DESC, total_conversions DESC)
        WHERE status = 'approved';
        """
    )

    # Referral code link
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_referral_code
        ON partner_applications (referral_code_id)
        WHERE referral_code_id IS NOT NULL;
        """
    )

    # Fraud review queue
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_fraud_review
        ON partner_applications (requires_manual_review, created_at ASC)
        WHERE requires_manual_review = TRUE AND status = 'approved';
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_partner_applications_applied_date
        ON partner_applications (applied_at, status);
        """
    )

    # =========================================================================
    # UNIQUE CONSTRAINTS
    # =========================================================================

    # One application per user per workspace (can reapply after rejection/withdrawal)
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_applications_unique_active
        ON partner_applications (user_id, workspace_id)
        WHERE status IN ('pending', 'under_review', 'approved');
        """
    )

    # =========================================================================
    # TABLE AND COLUMN COMMENTS
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE partner_applications IS
        'Tracks applications to the partner/affiliate program. Partners earn commission for referring paying customers.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.status IS
        'Application workflow status: pending, under_review, approved, rejected, suspended, terminated, withdrawn';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.business_type IS
        'Type of business/entity: individual, photography_studio, education, agency, etc.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.audience_size IS
        'Estimated audience/following size: under_1k, 1k_10k, 10k_50k, etc.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.social_links IS
        'JSON object with social media links: {"instagram": "...", "youtube": "...", "twitter": "..."}';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.commission_rate IS
        'Commission rate as decimal (0.2000 = 20%). Applied to subscription revenue from referred customers.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.commission_duration_months IS
        'How many months to pay commission for each referred customer. 0 = first payment only, NULL = lifetime.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.partner_tier IS
        'Partner tier unlocking higher commission rates: standard (20%), silver (22%), gold (25%), platinum (30%)';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.payout_method IS
        'Preferred method for receiving commission payments: bank_transfer, stripe_connect, paypal, upi, wise, check';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.payout_details IS
        'Encrypted/tokenized payout information specific to the payout method';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.pending_commission IS
        'Commission earned but not yet paid out. Updated when conversions occur.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.referral_code_id IS
        'Links to the partner''s referral_codes entry for tracking conversions';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN partner_applications.fraud_flags IS
        'JSON array of fraud indicators detected: ["same_ip_multiple_signups", "suspicious_conversion_pattern", ...]';
        """
    )

    # =========================================================================
    # TRIGGER - Update updated_at timestamp
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_partner_application_updated_at()
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
        DROP TRIGGER IF EXISTS trg_partner_application_updated_at ON partner_applications;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_partner_application_updated_at
        BEFORE UPDATE ON partner_applications
        FOR EACH ROW
        EXECUTE FUNCTION update_partner_application_updated_at();
        """
    )

    # =========================================================================
    # TRIGGER - Set approved_at when status changes to approved
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_partner_approval_timestamp()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Set approved_at when status changes to approved
            IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
                NEW.approved_at = NOW();
                NEW.last_active_at = NOW();
            END IF;

            -- Set suspended_at when status changes to suspended
            IF NEW.status = 'suspended' AND OLD.status != 'suspended' THEN
                NEW.suspended_at = NOW();
            END IF;

            -- Set terminated_at when status changes to terminated
            IF NEW.status = 'terminated' AND OLD.status != 'terminated' THEN
                NEW.terminated_at = NOW();
            END IF;

            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_partner_status_timestamps ON partner_applications;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_partner_status_timestamps
        BEFORE UPDATE ON partner_applications
        FOR EACH ROW
        EXECUTE FUNCTION set_partner_approval_timestamp();
        """
    )

    # =========================================================================
    # TRIGGER - Reset monthly analytics at month start
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION reset_partner_monthly_analytics()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Check if we've crossed into a new month since last reset
            IF DATE_TRUNC('month', NOW()) > DATE_TRUNC('month', COALESCE(NEW.analytics_reset_at, '1970-01-01'::timestamptz)) THEN
                NEW.conversions_this_month = 0;
                NEW.revenue_this_month = 0.00;
                NEW.analytics_reset_at = DATE_TRUNC('month', NOW());
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_partner_monthly_reset ON partner_applications;
        """
    )

    op.execute(
        """
        CREATE TRIGGER trg_partner_monthly_reset
        BEFORE UPDATE ON partner_applications
        FOR EACH ROW
        EXECUTE FUNCTION reset_partner_monthly_analytics();
        """
    )


def downgrade() -> None:
    # Drop triggers first
    op.execute("DROP TRIGGER IF EXISTS trg_partner_monthly_reset ON partner_applications;")
    op.execute("DROP TRIGGER IF EXISTS trg_partner_status_timestamps ON partner_applications;")
    op.execute("DROP TRIGGER IF EXISTS trg_partner_application_updated_at ON partner_applications;")

    # Drop functions
    op.execute("DROP FUNCTION IF EXISTS reset_partner_monthly_analytics();")
    op.execute("DROP FUNCTION IF EXISTS set_partner_approval_timestamp();")
    op.execute("DROP FUNCTION IF EXISTS update_partner_application_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_unique_active;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_applied_date;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_fraud_review;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_referral_code;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_leaderboard;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_payout;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_tier;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_active;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_pending;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_partner_applications_user;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS partner_applications;")
