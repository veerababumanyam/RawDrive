"""Create invitation_images table for Save The Date feature.

This migration creates:
- invitation_images: Images associated with invitations (cover, gallery, logos)

Security considerations:
- Workspace isolation via workspace_id
- Image purpose and position validation

Feature: 016-save-the-date
Revision ID: 0061
Revises: 0060
Create Date: 2025-12-30
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_images table."""

    # =========================================================================
    # 1. Create invitation_image_purpose enum
    # =========================================================================
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_image_purpose') THEN
                CREATE TYPE invitation_image_purpose AS ENUM (
                    'cover', 'gallery', 'logo', 'background', 'pattern'
                );
            END IF;
        END $$;
        """
    )

    # =========================================================================
    # 2. Create invitation_images table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitation_images (
            -- Primary key
            image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys
            invitation_id UUID NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Storage
            object_key TEXT NOT NULL,
            url TEXT NOT NULL,
            thumbnail_url TEXT,

            -- Metadata
            filename VARCHAR(255) NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            size_bytes BIGINT NOT NULL,
            width INTEGER,
            height INTEGER,

            -- Ordering and purpose
            position INTEGER DEFAULT 0,
            purpose invitation_image_purpose DEFAULT 'gallery',

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW(),
            uploaded_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Constraints
            CONSTRAINT invitation_images_position_valid CHECK (position >= 0 AND position < 20),
            CONSTRAINT invitation_images_size_valid CHECK (size_bytes > 0 AND size_bytes <= 10485760)
        );
        """
    )

    # =========================================================================
    # 3. Create indexes
    # =========================================================================
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_images_invitation
        ON invitation_images(invitation_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_images_workspace
        ON invitation_images(workspace_id);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_images_purpose
        ON invitation_images(invitation_id, purpose);
        """
    )

    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_invitation_images_position
        ON invitation_images(invitation_id, position);
        """
    )

    # =========================================================================
    # 4. Add documentation comments
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE invitation_images IS
        'Images associated with invitations: cover photos, gallery, logos, backgrounds';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN invitation_images.object_key IS
        'R2/S3 storage object key following pattern: workspaces/{workspace_id}/invitations/{invitation_id}/images/{filename}';
        """
    )


def downgrade() -> None:
    """Remove invitation_images table."""
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_invitation_images_position;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_images_purpose;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_images_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_invitation_images_invitation;")

    # Drop table
    op.execute("DROP TABLE IF EXISTS invitation_images;")

    # Drop enum
    op.execute("DROP TYPE IF EXISTS invitation_image_purpose;")
