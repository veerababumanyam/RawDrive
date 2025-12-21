"""Add avatar_updated activity type to client_activities check constraint.

This migration updates the activity_type check constraint to include
'avatar_updated' for tracking client avatar uploads.

Revision ID: 0019
Revises: 0018
Create Date: 2025-12-21
"""

from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing constraint
    op.execute(
        """
        ALTER TABLE client_activities
        DROP CONSTRAINT IF EXISTS client_activities_activity_type_check;
        """
    )

    # Add the updated constraint with avatar_updated included
    op.execute(
        """
        ALTER TABLE client_activities
        ADD CONSTRAINT client_activities_activity_type_check
        CHECK (activity_type IN (
            'gallery_linked', 'gallery_viewed', 'selection_made',
            'favorite_added', 'comment_added', 'payment_received',
            'communication_sent', 'note_added', 'status_changed',
            'avatar_updated'
        ));
        """
    )


def downgrade() -> None:
    # Drop the updated constraint
    op.execute(
        """
        ALTER TABLE client_activities
        DROP CONSTRAINT IF EXISTS client_activities_activity_type_check;
        """
    )

    # Restore the original constraint without avatar_updated
    op.execute(
        """
        ALTER TABLE client_activities
        ADD CONSTRAINT client_activities_activity_type_check
        CHECK (activity_type IN (
            'gallery_linked', 'gallery_viewed', 'selection_made',
            'favorite_added', 'comment_added', 'payment_received',
            'communication_sent', 'note_added', 'status_changed'
        ));
        """
    )
