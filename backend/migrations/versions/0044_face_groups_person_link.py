"""Add person_id to face_groups for linking clusters to named people.

This migration adds a foreign key from face_groups to people table,
enabling searchable face naming.

When a user assigns a name to a face group, they can either:
1. Create a new person record (display_name)
2. Link to an existing person

This enables searching for photos by person name across all their
face clusters.

Revision ID: 0044
Revises: 0043
Create Date: 2025-12-28
"""

from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add person_id column to face_groups
    op.execute(
        """
        ALTER TABLE face_groups
        ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES people(person_id) ON DELETE SET NULL;
        """
    )

    # Add documentation comment
    op.execute(
        """
        COMMENT ON COLUMN face_groups.person_id IS
        'Links face cluster to named person for search and display. Multiple face_groups can link to same person.';
        """
    )

    # Index for finding face groups by person (enables person search)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_groups_person
        ON face_groups(person_id)
        WHERE person_id IS NOT NULL;
        """
    )

    # Index for workspace + person queries (common pattern for people list)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_groups_workspace_person
        ON face_groups(workspace_id, person_id)
        WHERE person_id IS NOT NULL;
        """
    )


def downgrade() -> None:
    # Drop indexes first
    op.execute("DROP INDEX IF EXISTS idx_face_groups_workspace_person;")
    op.execute("DROP INDEX IF EXISTS idx_face_groups_person;")

    # Drop column
    op.execute("ALTER TABLE face_groups DROP COLUMN IF EXISTS person_id;")
