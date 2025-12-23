"""Create face_group_history table for undo functionality.

This migration creates the face_group_history table which tracks changes
to face group assignments, enabling undo functionality for recent actions.

Key features:
- Records all face group operations (assign, unassign, merge, split)
- Stores source and target group IDs for reversal
- Auto-expires old entries after 24 hours
- Supports workspace-scoped undo operations

Supported actions:
- assign: Face assigned to a group
- unassign: Face removed from a group
- merge: Two groups merged into one
- split: Faces split from a group into a new group
- delete_group: Group deleted (faces become ungrouped)

Revision ID: 0029
Revises: 0028
Create Date: 2025-12-23
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create face_group_history table for undo support.
    
    Table structure:
    - id: Primary key UUID
    - workspace_id: Multi-tenant isolation (required)
    - action: Type of action performed
    - face_id: Face that was affected (for assign/unassign)
    - source_group_id: Original group (for merge/split/unassign)
    - target_group_id: Destination group (for assign/merge)
    - metadata: Additional action-specific data
    - created_at: When action was performed
    - expires_at: When this history entry can be cleaned up
    """
    
    # Create face_group_history table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS face_group_history (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            
            -- Type of action performed
            -- Values: 'assign', 'unassign', 'merge', 'split', 'delete_group', 'create_group', 'rename'
            action VARCHAR(50) NOT NULL,
            
            -- Face that was affected (for face-level operations)
            -- NULL for group-level operations like merge
            face_id UUID,
            
            -- Source group (original location before action)
            -- NULL for new assignments or group creation
            source_group_id UUID,
            
            -- Target group (destination after action)
            -- NULL for unassign or group deletion
            target_group_id UUID,
            
            -- Additional metadata for complex operations
            -- Examples:
            -- - merge: {"merged_face_count": 15, "source_group_name": "Person A"}
            -- - split: {"split_face_ids": ["uuid1", "uuid2"]}
            -- - rename: {"old_name": "Person A", "new_name": "John Smith"}
            metadata JSONB DEFAULT '{}',
            
            -- Timestamp when action was performed
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            -- Timestamp when this history entry expires
            -- Expired entries can be cleaned up by a background job
            -- Default: 24 hours from creation
            expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
            
            -- Constraints
            CONSTRAINT face_group_history_action_valid CHECK (
                action IN ('assign', 'unassign', 'merge', 'split', 'delete_group', 'create_group', 'rename')
            )
        );
        """
    )
    
    # Create indexes for common query patterns
    
    # Index for workspace-scoped undo queries (most recent first)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_face_group_history_workspace 
        ON face_group_history(workspace_id, created_at DESC);
        """
    )
    
    # Index for finding history by face (for face-specific undo)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_group_history_face ON face_group_history(face_id);"
    )
    
    # Index for cleanup job (finding expired entries)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_face_group_history_expires ON face_group_history(expires_at);"
    )
    
    # Create application_settings table if it doesn't exist
    # This table stores configurable settings for face detection
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS application_settings (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Setting key (unique identifier)
            -- Format: "category.subcategory.setting_name"
            -- Examples: "face.similarity_threshold", "face.min_confidence"
            key VARCHAR(255) NOT NULL UNIQUE,
            
            -- Setting value (stored as text, parsed by application)
            value TEXT NOT NULL,
            
            -- Human-readable description of the setting
            description TEXT,
            
            -- Timestamps for auditing
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )
    
    # Create trigger for automatic updated_at timestamp on application_settings
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_application_settings_updated_at()
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
        DROP TRIGGER IF EXISTS trigger_application_settings_updated_at ON application_settings;
        CREATE TRIGGER trigger_application_settings_updated_at
            BEFORE UPDATE ON application_settings
            FOR EACH ROW
            EXECUTE FUNCTION update_application_settings_updated_at();
        """
    )
    
    # Insert default face detection settings
    op.execute(
        """
        INSERT INTO application_settings (key, value, description)
        VALUES 
            ('face.similarity_threshold', '0.85', 'Minimum similarity score (0-1) to consider faces as same person'),
            ('face.min_confidence', '0.7', 'Minimum detection confidence (0-1) to process a face'),
            ('face.batch_size', '10', 'Number of photos to process in a single batch'),
            ('face.max_retries', '3', 'Maximum retry attempts for failed detections'),
            ('face.processing_enabled', 'true', 'Global toggle for face detection processing')
        ON CONFLICT (key) DO NOTHING;
        """
    )


def downgrade() -> None:
    """Drop face_group_history and application_settings tables.
    
    WARNING: This will permanently delete all history and settings data.
    """
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_application_settings_updated_at ON application_settings;")
    op.execute("DROP FUNCTION IF EXISTS update_application_settings_updated_at();")
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_face_group_history_expires;")
    op.execute("DROP INDEX IF EXISTS idx_face_group_history_face;")
    op.execute("DROP INDEX IF EXISTS idx_face_group_history_workspace;")
    
    # Drop tables
    op.execute("DROP TABLE IF EXISTS face_group_history;")
    
    # Remove face detection settings (but keep table if other settings exist)
    op.execute(
        """
        DELETE FROM application_settings 
        WHERE key LIKE 'face.%';
        """
    )
