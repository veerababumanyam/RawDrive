"""Create faces table for storing detected face data.

This migration creates the core faces table which stores:
- Face bounding box coordinates (as JSONB with x, y, width, height percentages)
- Detection confidence score (0-1 range)
- Face embedding vector (512-dimensional for similarity matching)
- Provider information (which AI service detected the face)
- Thumbnail URLs for UI display (small, medium, large sizes)
- Detection metadata (provider-specific data like landmarks, emotions)

The table includes:
- Workspace isolation via workspace_id foreign key
- Photo association via photo_id foreign key
- Optional face group assignment via face_group_id
- IVFFlat index on embedding for efficient similarity search

Revision ID: 0025
Revises: 0024
Create Date: 2025-12-23
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create faces table with all required columns and indexes.
    
    Table structure:
    - id: Primary key UUID
    - workspace_id: Multi-tenant isolation (required)
    - photo_id: Reference to source photo (required)
    - face_group_id: Optional cluster assignment
    - bounding_box: JSONB with {x, y, width, height} as percentages
    - confidence: Detection confidence 0.0-1.0
    - embedding: 512-dimensional vector for similarity search
    - provider: AI provider name (cloud_vision, gemini)
    - detection_metadata: Provider-specific data (landmarks, emotions, etc.)
    - thumbnail_urls: JSONB with {small, medium, large} URLs
    - timestamps: created_at, updated_at
    """
    
    # Create faces table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS faces (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Multi-tenant isolation - all queries must filter by workspace_id
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            
            -- Reference to the source photo containing this face
            photo_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,
            
            -- Optional assignment to a face group (cluster)
            -- NULL means face is ungrouped (new or low confidence)
            face_group_id UUID,  -- FK added after face_groups table exists
            
            -- Bounding box coordinates as percentages (0-100) of image dimensions
            -- Format: {"x": 10.5, "y": 20.3, "width": 15.2, "height": 18.7}
            bounding_box JSONB NOT NULL,
            
            -- Detection confidence score from AI provider (0.0 to 1.0)
            -- Faces below configurable threshold are excluded from auto-grouping
            confidence DECIMAL(5,4) NOT NULL,
            
            -- 512-dimensional face embedding vector for similarity matching
            -- Used with pgvector cosine distance for finding similar faces
            -- NULL if embedding generation failed or is pending
            embedding vector(512),
            
            -- AI provider that detected this face
            -- Values: 'cloud_vision', 'gemini'
            provider VARCHAR(50) NOT NULL,
            
            -- Provider-specific metadata (landmarks, emotions, angles, etc.)
            -- Structure varies by provider - used for debugging and advanced features
            detection_metadata JSONB DEFAULT '{}',
            
            -- Cropped face thumbnail URLs at multiple sizes
            -- Format: {"small": "url", "medium": "url", "large": "url"}
            thumbnail_urls JSONB DEFAULT '{}',
            
            -- Timestamps for auditing
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            -- Constraints
            -- Ensure confidence is in valid range
            CONSTRAINT faces_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
            
            -- Ensure bounding_box has required fields
            CONSTRAINT faces_bounding_box_valid CHECK (
                bounding_box ? 'x' AND 
                bounding_box ? 'y' AND 
                bounding_box ? 'width' AND 
                bounding_box ? 'height'
            )
        );
        """
    )
    
    # Create indexes for common query patterns
    
    # Index for workspace-scoped queries (most common access pattern)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_faces_workspace ON faces(workspace_id);"
    )
    
    # Index for finding all faces in a photo
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_faces_photo ON faces(photo_id);"
    )
    
    # Index for finding all faces in a group
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_faces_group ON faces(face_group_id);"
    )
    
    # Index for filtering by confidence (e.g., finding low-confidence faces)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_faces_confidence ON faces(workspace_id, confidence DESC);"
    )
    
    # IVFFlat index for efficient similarity search on embeddings
    # Uses cosine distance operator for normalized embeddings
    # lists=100 is suitable for up to ~100K faces per workspace
    # Increase lists for larger datasets (sqrt(n) is a good rule of thumb)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_faces_embedding ON faces 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
        """
    )
    
    # Create trigger for automatic updated_at timestamp
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_faces_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_faces_updated_at ON faces;
        CREATE TRIGGER trigger_faces_updated_at
            BEFORE UPDATE ON faces
            FOR EACH ROW
            EXECUTE FUNCTION update_faces_updated_at();
        """
    )


def downgrade() -> None:
    """Drop faces table and related objects.
    
    WARNING: This will permanently delete all face detection data.
    """
    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_faces_updated_at ON faces;")
    op.execute("DROP FUNCTION IF EXISTS update_faces_updated_at();")
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_faces_embedding;")
    op.execute("DROP INDEX IF EXISTS idx_faces_confidence;")
    op.execute("DROP INDEX IF EXISTS idx_faces_group;")
    op.execute("DROP INDEX IF EXISTS idx_faces_photo;")
    op.execute("DROP INDEX IF EXISTS idx_faces_workspace;")
    
    # Drop table
    op.execute("DROP TABLE IF EXISTS faces;")
