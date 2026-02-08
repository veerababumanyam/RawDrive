"""Add show_people_filter field to galleries table.

This migration adds the show_people_filter column to the galleries table,
enabling photographers to control whether clients can filter photos by
detected people in the gallery view.

When enabled (True), clients viewing the gallery will see a "People" filter
that allows them to find photos of specific individuals that have been
detected and optionally named by the photographer.

Feature: Face Recognition & Tagging
Task: T006 - Add show_people_filter field to Gallery model

Revision ID: 0187
Revises: 0186
Create Date: 2026-02-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0187"
down_revision = "0186"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add show_people_filter column to galleries table.

    New column:
    - show_people_filter: Boolean flag to enable/disable the people filter
      for client gallery views. Defaults to False (disabled).

    When enabled, clients can filter gallery photos by person/face group
    names assigned by the photographer through the face recognition feature.
    """

    # Add show_people_filter column with default False
    # Photographers must explicitly enable this for each gallery
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS show_people_filter BOOLEAN NOT NULL DEFAULT FALSE;
        """
    )

    # Add column comment for documentation
    op.execute(
        """
        COMMENT ON COLUMN galleries.show_people_filter IS
        'When enabled, clients can filter gallery photos by person names detected via face recognition. Defaults to FALSE.';
        """
    )

    # Create partial index for galleries with people filter enabled
    # Useful for analytics and finding galleries using this feature
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_galleries_show_people_filter
        ON galleries(workspace_id)
        WHERE show_people_filter = TRUE AND deleted = FALSE;
        """
    )


def downgrade() -> None:
    """Remove show_people_filter column from galleries table."""

    # Drop index first
    op.execute("DROP INDEX IF EXISTS idx_galleries_show_people_filter;")

    # Drop column
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS show_people_filter;")
