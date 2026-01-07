"""Backfill missing workspace subscriptions

Revision ID: 0117
Revises: 0116
Create Date: 2026-01-07 10:30:00.000000

This migration ensures all active workspaces have subscription records.
It creates subscriptions with the 'starter' plan for any workspace without one.

CRITICAL: This prevents 404 WORKSPACE_NOT_FOUND errors caused by
workspace_service.py using INNER JOIN on workspace_subscriptions.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0117'
down_revision = '0116'
branch_labels = None
depends_on = None


def upgrade():
    """
    Backfill missing workspace subscriptions.

    For each active workspace without a subscription:
    1. Get the 'starter' plan (default for free tier)
    2. Create a subscription with 30-day trial
    3. Set status to 'active'
    """

    # Use raw SQL for better control
    op.execute("""
        -- Backfill missing workspace subscriptions
        INSERT INTO workspace_subscriptions (
            subscription_id,
            workspace_id,
            plan_id,
            status,
            trial_started_at,
            trial_expires_at,
            current_period_start,
            current_period_end,
            billing_interval,
            currency,
            payment_status,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            w.workspace_id,
            (SELECT plan_id FROM plans WHERE code = 'starter' LIMIT 1),
            'active',
            NOW(),
            NOW() + INTERVAL '30 days',
            NOW(),
            NOW() + INTERVAL '30 days',
            'monthly',
            'INR',
            'none',
            NOW(),
            NOW()
        FROM workspaces w
        LEFT JOIN workspace_subscriptions ws ON ws.workspace_id = w.workspace_id
        WHERE w.status = 'active'
        AND ws.subscription_id IS NULL
        AND EXISTS (SELECT 1 FROM plans WHERE code = 'starter');
    """)

    # Add check constraint to prevent future issues
    # This ensures no active workspace can exist without a subscription
    op.execute("""
        CREATE OR REPLACE FUNCTION check_workspace_has_subscription()
        RETURNS TRIGGER AS $$
        BEGIN
            IF NEW.status = 'active' THEN
                IF NOT EXISTS (
                    SELECT 1 FROM workspace_subscriptions
                    WHERE workspace_id = NEW.workspace_id
                ) THEN
                    RAISE EXCEPTION 'Active workspace must have a subscription record'
                        USING HINT = 'Create a workspace_subscriptions record first';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Create trigger to enforce the constraint
    op.execute("""
        DROP TRIGGER IF EXISTS ensure_workspace_has_subscription ON workspaces;

        CREATE TRIGGER ensure_workspace_has_subscription
        BEFORE UPDATE OF status ON workspaces
        FOR EACH ROW
        WHEN (NEW.status = 'active' AND OLD.status != 'active')
        EXECUTE FUNCTION check_workspace_has_subscription();
    """)

    print("✅ Backfilled workspace subscriptions")
    print("✅ Added constraint to prevent workspaces without subscriptions")


def downgrade():
    """Remove the constraint and trigger."""

    # Remove trigger
    op.execute("""
        DROP TRIGGER IF EXISTS ensure_workspace_has_subscription ON workspaces;
    """)

    # Remove function
    op.execute("""
        DROP FUNCTION IF EXISTS check_workspace_has_subscription();
    """)

    # Note: We don't delete the created subscriptions on downgrade
    # as that would break existing workspaces
    print("⚠️  Trigger and function removed")
    print("⚠️  Created subscriptions NOT deleted (manual cleanup required if needed)")
