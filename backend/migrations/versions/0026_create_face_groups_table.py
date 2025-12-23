"""Create face_groups table for clustering faces by person.

This migration creates the face_groups table which represents clusters of faces
identified as belonging to the same person. Key features:

- User-assignable names for easy identification ("John", "Wedding Party", etc.)
- Representative face selection for thumbnail display
- Centroid vector for efficient similarity matching against new faces
- Face count tracking for statistics

The table also adds the foreign key constraint from faces.face_group_id
to face_groups.id, completing the relationship.

Revision ID: 0026
Revises: 0025
Create Date: 2025-12-23
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create face_groups table and add FK constraint to faces table.
    
    Table structure:
    - id: Primary key UUID
    - workspace_id: Multi-tenant isolation (required)
    - name: User-assigned name (optional, e.g., "John Smith")
    - representative_face_id: Face to use as thumbnail (optional)
    - centroid: Mean embedding of all faces in group (512-dim vector)
    - face_count: Number of faces in this group
    - timestamps: created_at, updated_at
    """
    
    # Create face_groups table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS face_groups (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Multi-tenant isolation - all queries must filter by workspace_id
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            
            -- User-assigned name for this person/group
            -- NULL for unnamed groups (auto-created clusters)
            name VARCHAR(255),
            
            -- Face to use as the representative thumbnail for this group
            -- Should be a high-quality, clear face from the group
            -- NULL if no representative selected yet
            representative_face_id UUID,  -- FK added after faces table constraint
            
            -- Centroid (mean) of all face embeddings in this group
            -- Used for efficient similarity matching when assigning new faces
            -- Recalculated when faces are added/removed from the group
            centroid vector(512),
            
            -- Count of faces in this group (denormalized for performance)
            -- Updated via triggers or application logic when faces change
            face_count INTEGER NOT NULL DEFAULT 0,
            
            -- Timestamps for auditing
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            -- Constraints
            CONSTRAINT face_groups_face_count_positive CHECK (face_count >= 0)
        );
        """
    )
    
    # Create indexes for common query patterns
    
    # Index for workspace-scoped queries
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_groups_workspace ON face_groups(workspace_id);"
    )
    
    # Index for searching groups by name within a workspace
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_groups_name ON face_groups(workspace_id, name);"
    )
    
    # IVFFlat index for efficient centroid similarity search
    # Used when finding the best matching group for a new face
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_groups_centroid ON face_groups 
        USING ivfflat (centroid vector_cosine_ops)
        WITH (lists = 100);
        """
    )
    
    # Now add the foreign key constraints that reference both tables
    
    # Add FK from faces.face_group_id to face_groups.id
    op.execute(
        """
        ALTER TABLE faces 
        ADD CONSTRAINT fk_faces_face_group 
        FOREIGN KEY (face_group_id) 
        REFERENCES face_groups(id) 
        ON DELETE SET NULL;
        """
    )
    
    # Add FK from face_groups.representative_face_id to faces.id
    # Uses SET NULL on delete to handle face deletion gracefully
    op.execute(
        """
        ALTER TABLE face_groups 
        ADD CONSTRAINT fk_face_groups_representative 
        FOREIGN KEY (representative_face_id) 
        REFERENCES faces(id) 
        ON DELETE SET NULL;
        """
    )
    
    # Create trigger for automatic updated_at timestamp
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_face_groups_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_face_groups_updated_at ON face_groups;
        CREATE TRIGGER trigger_face_groups_updated_at
            BEFORE UPDATE ON face_groups
            FOR EACH ROW
            EXECUTE FUNCTION update_face_groups_updated_at();
        """
    )


def downgrade() -> None:
    """Drop face_groups table and related constraints.
    
    WARNING: This will permanently delete all face group data.
    """
    # Drop foreign key constraints first
    op.execute(
        "ALTER TABLE face_groups DROP CONSTRAINT IF EXISTS fk_face_groups_representative;"
    )
    op.execute(
        "ALTER TABLE faces DROP CONSTRAINT IF EXISTS fk_faces_face_group;"
    )
    
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_face_groups_updated_at ON face_groups;")
    op.execute("DROP FUNCTION IF EXISTS update_face_groups_updated_at();")
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_face_groups_centroid;")
    op.execute("DROP INDEX IF EXISTS idx_face_groups_name;")
    op.execute("DROP INDEX IF EXISTS idx_face_groups_workspace;")
    
    # Drop table
    op.execute("DROP TABLE IF EXISTS face_groups;")
