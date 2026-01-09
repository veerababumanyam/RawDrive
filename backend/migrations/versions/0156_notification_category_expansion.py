"""Add asset_processing and rsvp notification categories.

This migration adds two new values to the notification_category enum:
- asset_processing: For upload and processing notifications
- rsvp: For RSVP management notifications

These categories support the enhanced notification preferences feature.

Feature: Notification Preferences Feature
Revision ID: 0156
Revises: 0155
Create Date: 2026-01-09
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0156"
down_revision = "0155"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add asset_processing and rsvp values to notification_category enum."""

    # =========================================================================
    # Add 'asset_processing' to notification_category enum
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            -- Check if value already exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'asset_processing'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_category')
            ) THEN
                ALTER TYPE notification_category ADD VALUE 'asset_processing';
            END IF;
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # Add 'rsvp' to notification_category enum
    # =========================================================================
    op.execute(
        """
        DO $$ BEGIN
            -- Check if value already exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_enum
                WHERE enumlabel = 'rsvp'
                AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_category')
            ) THEN
                ALTER TYPE notification_category ADD VALUE 'rsvp';
            END IF;
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
        """
    )

    # =========================================================================
    # Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TYPE notification_category IS
        'Notification categories for preference matching. Includes: gallery_activity, client_interactions, asset_processing, rsvp, system_alerts, billing, marketing, invitation';
        """
    )


def downgrade() -> None:
    """Note: PostgreSQL does not support removing enum values directly.

    To fully downgrade, you would need to:
    1. Create a new enum without the values
    2. Update all references
    3. Drop the old enum
    4. Rename the new enum

    For safety, this downgrade is a no-op.
    """
    pass
