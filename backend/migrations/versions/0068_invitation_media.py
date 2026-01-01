"""Create invitation_media table for video and audio support.

Feature: 017-digital-wedding-invitations
Revision ID: 0068
Revises: 0067
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0068"
down_revision = "0067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_media table."""
    op.execute(
        """
        CREATE TABLE invitation_media (
            -- Primary key
            media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys (multi-tenant)
            invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Media identity
            media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('video', 'audio')),
            purpose VARCHAR(50) DEFAULT 'content',

            -- Storage
            original_object_key TEXT NOT NULL,
            original_url TEXT,
            original_filename VARCHAR(255),
            original_mime_type VARCHAR(100),
            original_size_bytes BIGINT,

            -- Transcoded variants (for video/audio)
            variants JSONB DEFAULT '[]'::JSONB,
            -- Example: [{"format": "mp4", "resolution": "720p", "object_key": "...", "url": "..."}]

            -- Thumbnail (for video)
            thumbnail_object_key TEXT,
            thumbnail_url TEXT,

            -- Metadata
            duration_seconds DECIMAL(10, 2),
            width INTEGER,
            height INTEGER,

            -- Processing status
            processing_status VARCHAR(20) DEFAULT 'pending'
                CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
            processing_error TEXT,
            processing_started_at TIMESTAMPTZ,
            processing_completed_at TIMESTAMPTZ,

            -- Display
            position INTEGER DEFAULT 0,
            autoplay BOOLEAN DEFAULT TRUE,
            loop BOOLEAN DEFAULT FALSE,
            muted BOOLEAN DEFAULT TRUE,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            created_by_user_id UUID REFERENCES users(user_id)
        );
        """
    )

    # Indexes
    op.execute(
        """
        CREATE INDEX idx_invitation_media_invitation ON invitation_media(invitation_id);
        CREATE INDEX idx_invitation_media_workspace ON invitation_media(workspace_id);
        CREATE INDEX idx_invitation_media_type ON invitation_media(invitation_id, media_type);
        CREATE INDEX idx_invitation_media_processing ON invitation_media(processing_status)
            WHERE processing_status IN ('pending', 'processing');
        """
    )


def downgrade() -> None:
    """Drop invitation_media table."""
    op.execute("DROP TABLE IF EXISTS invitation_media;")
