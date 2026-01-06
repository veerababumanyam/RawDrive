"""Enhance subscription plans table for automated onboarding system.

This migration adds fields to the existing plans table to support:
- Multi-currency pricing (USD/INR with conversion)
- Plan visibility and ordering for pricing pages
- Display metadata (description, highlight labels, feature bullets)
- Plan lifecycle management (status, trial eligibility)
- Stripe integration fields
- Audit timestamps

The enhanced plans table supports the new onboarding flow where users
select plans on the pricing page, complete registration, and process
payment through Stripe.

Revision ID: 0094
Revises: 0093
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0094"
down_revision = "0093"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add enhanced fields to plans table for onboarding system."""

    # =========================================================================
    # ADD NEW COLUMNS TO EXISTING PLANS TABLE
    # =========================================================================

    # Description for marketing/display purposes
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS description TEXT;
    """)

    # Multi-currency support: USD pricing alongside INR
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS price_monthly_usd DECIMAL(10,2);
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS price_annual_usd DECIMAL(10,2);
    """)

    # Plan visibility and ordering for pricing page
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
    """)

    # Highlight label for featured plans (e.g., "Most Popular", "Best Value")
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS highlight_label VARCHAR(50);
    """)

    # Feature bullets for display on pricing cards (ordered list of features)
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS feature_bullets JSONB DEFAULT '[]';
    """)

    # Plan status for lifecycle management
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
    """)

    # Add CHECK constraint for status field
    op.execute("""
        ALTER TABLE plans
        ADD CONSTRAINT plans_status_check
        CHECK (status IN ('active', 'deprecated', 'archived'));
    """)

    # Trial eligibility and duration
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS trial_days INT DEFAULT 0;
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS is_trial_eligible BOOLEAN DEFAULT FALSE;
    """)

    # Stripe product and price IDs for payment integration
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS stripe_price_id_monthly VARCHAR(255);
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS stripe_price_id_annual VARCHAR(255);
    """)

    # USD Stripe price IDs (separate from INR)
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS stripe_price_id_monthly_usd VARCHAR(255);
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS stripe_price_id_annual_usd VARCHAR(255);
    """)

    # Additional limits for enhanced features
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS max_photos_per_gallery INT;
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS max_downloads_monthly INT;
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN DEFAULT TRUE;
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS custom_branding_enabled BOOLEAN DEFAULT FALSE;
    """)

    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS priority_support BOOLEAN DEFAULT FALSE;
    """)

    # Audit timestamp for updates
    op.execute("""
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    """)

    # =========================================================================
    # CREATE INDEXES FOR COMMON QUERIES
    # =========================================================================

    # Index for fetching visible plans in display order (pricing page)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_plans_visible_order
        ON plans(is_visible, display_order)
        WHERE is_visible = TRUE;
    """)

    # Index for looking up plans by status
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_plans_status
        ON plans(status);
    """)

    # Index for Stripe product lookup
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_plans_stripe_product
        ON plans(stripe_product_id)
        WHERE stripe_product_id IS NOT NULL;
    """)

    # =========================================================================
    # CREATE TRIGGER FOR updated_at TIMESTAMP
    # =========================================================================

    # Create function for updating timestamp if it doesn't exist
    op.execute("""
        CREATE OR REPLACE FUNCTION update_plans_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Create trigger to auto-update the updated_at column
    op.execute("""
        DROP TRIGGER IF EXISTS trigger_plans_updated_at ON plans;
        CREATE TRIGGER trigger_plans_updated_at
        BEFORE UPDATE ON plans
        FOR EACH ROW
        EXECUTE FUNCTION update_plans_updated_at();
    """)

    # =========================================================================
    # SEED DEFAULT SUBSCRIPTION PLANS
    # =========================================================================

    # Insert default plans if they don't exist
    # These match RawDrive's target pricing tiers
    op.execute("""
        INSERT INTO plans (
            code, name, description,
            price_monthly, price_annual, currency,
            price_monthly_usd, price_annual_usd,
            storage_bytes, max_galleries, max_clients, max_team_members, ai_credits_monthly,
            max_photos_per_gallery, max_downloads_monthly,
            watermark_enabled, custom_branding_enabled, priority_support,
            is_visible, display_order, highlight_label, status,
            trial_days, is_trial_eligible,
            feature_bullets, features
        )
        VALUES
        (
            'starter', 'Starter', 'Perfect for photographers just getting started',
            999.00, 9990.00, 'INR',
            12.00, 120.00,
            10737418240, 10, 50, 1, 100,
            500, 1000,
            TRUE, FALSE, FALSE,
            TRUE, 1, NULL, 'active',
            14, TRUE,
            '["10 GB storage", "Up to 10 galleries", "50 clients", "100 AI credits/month", "Email support"]'::jsonb,
            '{"face_recognition": true, "auto_culling": false, "client_proofing": true, "download_tracking": true}'::jsonb
        ),
        (
            'professional', 'Professional', 'For growing photography businesses',
            2499.00, 24990.00, 'INR',
            30.00, 300.00,
            107374182400, 50, 200, 3, 500,
            2000, 5000,
            FALSE, TRUE, FALSE,
            TRUE, 2, 'Most Popular', 'active',
            14, TRUE,
            '["100 GB storage", "Up to 50 galleries", "200 clients", "3 team members", "500 AI credits/month", "Custom branding", "Priority email support"]'::jsonb,
            '{"face_recognition": true, "auto_culling": true, "client_proofing": true, "download_tracking": true, "advanced_analytics": true}'::jsonb
        ),
        (
            'studio', 'Studio', 'For professional studios and agencies',
            4999.00, 49990.00, 'INR',
            60.00, 600.00,
            536870912000, 200, 1000, 10, 2000,
            5000, 20000,
            FALSE, TRUE, TRUE,
            TRUE, 3, 'Best Value', 'active',
            14, TRUE,
            '["500 GB storage", "Up to 200 galleries", "1000 clients", "10 team members", "2000 AI credits/month", "Custom branding", "Priority support", "API access"]'::jsonb,
            '{"face_recognition": true, "auto_culling": true, "client_proofing": true, "download_tracking": true, "advanced_analytics": true, "api_access": true, "white_label": true}'::jsonb
        ),
        (
            'enterprise', 'Enterprise', 'Custom solutions for large organizations',
            9999.00, 99990.00, 'INR',
            120.00, 1200.00,
            1099511627776, -1, -1, -1, 10000,
            -1, -1,
            FALSE, TRUE, TRUE,
            TRUE, 4, NULL, 'active',
            30, TRUE,
            '["1 TB+ storage", "Unlimited galleries", "Unlimited clients", "Unlimited team members", "10000 AI credits/month", "Dedicated support", "Custom integrations", "SLA guarantee"]'::jsonb,
            '{"face_recognition": true, "auto_culling": true, "client_proofing": true, "download_tracking": true, "advanced_analytics": true, "api_access": true, "white_label": true, "sso": true, "dedicated_support": true}'::jsonb
        )
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price_monthly = EXCLUDED.price_monthly,
            price_annual = EXCLUDED.price_annual,
            price_monthly_usd = EXCLUDED.price_monthly_usd,
            price_annual_usd = EXCLUDED.price_annual_usd,
            storage_bytes = EXCLUDED.storage_bytes,
            max_galleries = EXCLUDED.max_galleries,
            max_clients = EXCLUDED.max_clients,
            max_team_members = EXCLUDED.max_team_members,
            ai_credits_monthly = EXCLUDED.ai_credits_monthly,
            max_photos_per_gallery = EXCLUDED.max_photos_per_gallery,
            max_downloads_monthly = EXCLUDED.max_downloads_monthly,
            watermark_enabled = EXCLUDED.watermark_enabled,
            custom_branding_enabled = EXCLUDED.custom_branding_enabled,
            priority_support = EXCLUDED.priority_support,
            is_visible = EXCLUDED.is_visible,
            display_order = EXCLUDED.display_order,
            highlight_label = EXCLUDED.highlight_label,
            feature_bullets = EXCLUDED.feature_bullets,
            features = EXCLUDED.features,
            updated_at = NOW();
    """)


def downgrade() -> None:
    """Remove enhanced fields from plans table."""

    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_plans_updated_at ON plans;")
    op.execute("DROP FUNCTION IF EXISTS update_plans_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_plans_stripe_product;")
    op.execute("DROP INDEX IF EXISTS idx_plans_status;")
    op.execute("DROP INDEX IF EXISTS idx_plans_visible_order;")

    # Drop constraint
    op.execute("ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;")

    # Drop new columns (in reverse order of creation)
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS updated_at;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS priority_support;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS custom_branding_enabled;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS watermark_enabled;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS max_downloads_monthly;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS max_photos_per_gallery;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS stripe_price_id_annual_usd;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS stripe_price_id_monthly_usd;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS stripe_price_id_annual;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS stripe_price_id_monthly;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS stripe_product_id;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS is_trial_eligible;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS trial_days;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS status;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS feature_bullets;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS highlight_label;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS display_order;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS is_visible;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS price_annual_usd;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS price_monthly_usd;")
    op.execute("ALTER TABLE plans DROP COLUMN IF EXISTS description;")

    # Note: We don't delete the seeded data since it uses ON CONFLICT DO UPDATE
    # and would just be re-added. The plans table itself remains intact.
