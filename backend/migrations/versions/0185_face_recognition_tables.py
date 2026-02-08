"""Create face_assignments table for linking faces to face_groups.

This migration creates the face_assignments junction table which enables:
- Tracking face-to-group assignment history
- Assignment confidence scores (how confident the clustering algorithm is)
- Assignment source tracking (automatic vs manual)
- Soft assignments for review before confirmation
- Historical record of assignment changes

The existing faces.face_group_id column provides the "current" assignment,
while face_assignments provides the full assignment history and metadata.

Note: This migration complements the existing faces (0025) and face_groups (0026)
tables by adding a proper junction table with assignment metadata.

Revision ID: 0185
Revises: 0184
Create Date: 2026-02-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0185"
down_revision = "0184"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create face_assignments table for face-to-group linking.

    Table structure:
    - id: Primary key UUID
    - workspace_id: Multi-tenant isolation (required)
    - face_id: Reference to face being assigned (required)
    - face_group_id: Reference to target face group (required)
    - confidence: Assignment confidence score (0.0-1.0)
    - source: How the assignment was made (automatic, manual, merged)
    - is_confirmed: Whether assignment has been confirmed by user
    - assigned_by_user_id: User who made/confirmed the assignment (optional)
    - assigned_at: When the assignment was made
    - confirmed_at: When the assignment was confirmed (optional)
    - timestamps: created_at, updated_at
    """

    # Create face_assignments table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS face_assignments (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation - all queries must filter by workspace_id
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Reference to the face being assigned
            face_id UUID NOT NULL REFERENCES faces(id) ON DELETE CASCADE,

            -- Reference to the target face group
            face_group_id UUID NOT NULL REFERENCES face_groups(id) ON DELETE CASCADE,

            -- Assignment confidence score from clustering algorithm (0.0 to 1.0)
            -- Higher scores indicate more certain matches
            -- NULL for manual assignments
            confidence DECIMAL(5,4),

            -- How the assignment was made
            -- automatic: Assigned by clustering algorithm
            -- manual: Explicitly assigned by user
            -- merged: Result of merging face groups
            -- split: Result of splitting a face group
            source VARCHAR(20) NOT NULL DEFAULT 'automatic',

            -- Whether the assignment has been confirmed by a user
            -- Automatic assignments start as unconfirmed
            -- Manual assignments are automatically confirmed
            is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,

            -- User who made or confirmed this assignment
            -- NULL for unconfirmed automatic assignments
            assigned_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- When the assignment was made
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- When the assignment was confirmed by a user
            -- NULL if not yet confirmed
            confirmed_at TIMESTAMPTZ,

            -- Additional metadata about the assignment
            -- E.g., clustering algorithm version, similarity score to centroid
            metadata JSONB DEFAULT '{}',

            -- Timestamps for auditing
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            -- Constraints
            -- Ensure confidence is in valid range when provided
            CONSTRAINT face_assignments_confidence_range CHECK (
                confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
            ),

            -- Ensure source is a valid value
            CONSTRAINT face_assignments_source_valid CHECK (
                source IN ('automatic', 'manual', 'merged', 'split')
            ),

            -- Ensure confirmed_at is set when is_confirmed is true
            CONSTRAINT face_assignments_confirmed_consistency CHECK (
                (is_confirmed = FALSE) OR (confirmed_at IS NOT NULL)
            ),

            -- Unique constraint: A face can only be assigned to a group once
            -- (prevents duplicate assignments, but allows reassignment via delete + insert)
            CONSTRAINT face_assignments_face_group_unique UNIQUE (face_id, face_group_id)
        );
        """
    )

    # Create indexes for common query patterns

    # Index for workspace-scoped queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_assignments_workspace ON face_assignments(workspace_id);"
    )

    # Index for finding all assignments for a face
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_assignments_face ON face_assignments(face_id);"
    )

    # Index for finding all assignments in a face group
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_assignments_group ON face_assignments(face_group_id);"
    )

    # Index for finding unconfirmed assignments (for review queue)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_assignments_unconfirmed
        ON face_assignments(workspace_id, is_confirmed, confidence DESC)
        WHERE is_confirmed = FALSE;
        """
    )

    # Index for finding assignments by source (e.g., all manual assignments)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_assignments_source ON face_assignments(workspace_id, source);"
    )

    # Index for sorting by assignment date
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_assignments_date ON face_assignments(workspace_id, assigned_at DESC);"
    )

    # Create trigger for automatic updated_at timestamp
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_face_assignments_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_face_assignments_updated_at ON face_assignments;
        CREATE TRIGGER trigger_face_assignments_updated_at
            BEFORE UPDATE ON face_assignments
            FOR EACH ROW
            EXECUTE FUNCTION update_face_assignments_updated_at();
        """
    )

    # Add comments for documentation
    op.execute(
        """
        COMMENT ON TABLE face_assignments IS
        'Junction table linking faces to face_groups with assignment metadata. Tracks assignment history, confidence scores, and confirmation status.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN face_assignments.confidence IS
        'Clustering algorithm confidence score (0.0-1.0). NULL for manual assignments. Higher = more certain match.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN face_assignments.source IS
        'How the assignment was made: automatic (clustering), manual (user), merged (group merge), split (group split).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN face_assignments.is_confirmed IS
        'Whether a user has confirmed this assignment. Automatic assignments start unconfirmed for optional review.';
        """
    )


def downgrade() -> None:
    """Drop face_assignments table and related objects.

    WARNING: This will permanently delete all face assignment history data.
    """
    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_face_assignments_updated_at ON face_assignments;")
    op.execute("DROP FUNCTION IF EXISTS update_face_assignments_updated_at();")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_face_assignments_date;")
    op.execute("DROP INDEX IF EXISTS idx_face_assignments_source;")
    op.execute("DROP INDEX IF EXISTS idx_face_assignments_unconfirmed;")
    op.execute("DROP INDEX IF EXISTS idx_face_assignments_group;")
    op.execute("DROP INDEX IF EXISTS idx_face_assignments_face;")
    op.execute("DROP INDEX IF EXISTS idx_face_assignments_workspace;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS face_assignments;")
