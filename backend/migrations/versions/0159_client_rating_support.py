"""Add rating support to client_interactions table.

Revision ID: 0159
Revises: 0158
Create Date: 2026-01-09

Adds 'rating' as a valid interaction type and creates an index for efficient
rating aggregation. Ratings are stored with value (1-5) in the payload JSONB.
"""

from alembic import op
import sqlalchemy as sa

revision = "0159"
down_revision = "0158"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing CHECK constraint
    op.execute(
        """
        ALTER TABLE client_interactions
        DROP CONSTRAINT IF EXISTS client_interactions_type_check;
        """
    )

    # Add new CHECK constraint including 'rating'
    op.execute(
        """
        ALTER TABLE client_interactions
        ADD CONSTRAINT client_interactions_type_check
        CHECK (type IN ('view', 'favorite', 'select', 'comment', 'download', 'rating'));
        """
    )

    # Add index for efficient rating aggregation
    # This index helps when calculating average_rating for gallery_assets
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_client_interactions_rating
        ON client_interactions (gallery_id, asset_id)
        WHERE type = 'rating';
        """
    )

    # Add unique constraint to prevent duplicate ratings by same visitor
    # Using a unique index on (gallery_id, asset_id, visitor_id) for rating type
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_client_interaction_rating
        ON client_interactions (gallery_id, asset_id, (actor->>'visitor_id'))
        WHERE type = 'rating';
        """
    )

    # Add comment explaining the rating payload structure
    op.execute(
        """
        COMMENT ON TABLE client_interactions IS
        'Client interactions with gallery assets. For rating type, payload contains: {value: 1-5}';
        """
    )


def downgrade() -> None:
    # Drop the unique index for ratings
    op.execute("DROP INDEX IF EXISTS uq_client_interaction_rating;")

    # Drop the rating index
    op.execute("DROP INDEX IF EXISTS idx_client_interactions_rating;")

    # Remove the table comment
    op.execute("COMMENT ON TABLE client_interactions IS NULL;")

    # Restore original CHECK constraint (without 'rating')
    op.execute(
        """
        ALTER TABLE client_interactions
        DROP CONSTRAINT IF EXISTS client_interactions_type_check;
        """
    )

    op.execute(
        """
        ALTER TABLE client_interactions
        ADD CONSTRAINT client_interactions_type_check
        CHECK (type IN ('view', 'favorite', 'select', 'comment', 'download'));
        """
    )
