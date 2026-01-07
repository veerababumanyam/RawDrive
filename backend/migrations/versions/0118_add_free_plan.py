"""Add free plan for workspace defaults.

This migration adds a 'free' plan to support the default workspace creation
flow in workspace_service.py. The free plan provides basic functionality for
users who haven't selected a paid plan yet.

Revision ID: 0118
Revises: 0117
Create Date: 2026-01-07
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0118"
down_revision = "0117"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add free plan with basic limits."""

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
        VALUES (
            'free', 'Free', 'Free plan with basic features for individuals',
            0.00, 0.00, 'INR',
            0.00, 0.00,
            1073741824, 3, 10, 1, 50,
            100, 100,
            TRUE, FALSE, FALSE,
            TRUE, 0, NULL, 'active',
            14, TRUE,
            '["1 GB storage", "Up to 3 galleries", "10 clients", "1 team member", "50 AI credits/month", "Watermarked downloads"]'::jsonb,
            '{"face_recognition": false, "auto_culling": false, "client_proofing": true, "download_tracking": true}'::jsonb
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
    """Remove free plan."""
    op.execute("DELETE FROM plans WHERE code = 'free';")
