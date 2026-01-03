"""Add invitation support to magic_links table.

Revision ID: 0079
Revises: 0078
Create Date: 2026-01-03

This migration:
1. Adds 'invitation' to the magic_link_target_type enum
2. Makes gallery_id nullable (invitations don't have a gallery)
3. Adds invitation_id column with foreign key to digital_invitations
4. Updates the target_id_required constraint to handle invitations
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "0079"
down_revision = "0078"
branch_labels = None
depends_on = None


def upgrade():
    """Add invitation support to magic_links."""

    # 1. Add 'invitation' to the magic_link_target_type enum
    op.execute(
        """
        ALTER TYPE magic_link_target_type ADD VALUE IF NOT EXISTS 'invitation';
        """
    )

    # 2. Add invitation_id column
    op.execute(
        """
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS invitation_id UUID
        REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE;
        """
    )

    # 3. Make gallery_id nullable for invitation links
    op.execute(
        """
        ALTER TABLE magic_links
        ALTER COLUMN gallery_id DROP NOT NULL;
        """
    )

    # 4. Drop and recreate the target_id_required constraint to include invitation logic
    op.execute(
        """
        ALTER TABLE magic_links
        DROP CONSTRAINT IF EXISTS magic_links_target_id_required;
        """
    )

    op.execute(
        """
        ALTER TABLE magic_links
        ADD CONSTRAINT magic_links_target_id_required CHECK (
            (target_type = 'gallery' AND target_id IS NULL AND gallery_id IS NOT NULL) OR
            (target_type IN ('sub_gallery', 'photo') AND target_id IS NOT NULL AND gallery_id IS NOT NULL) OR
            (target_type = 'invitation' AND invitation_id IS NOT NULL AND gallery_id IS NULL)
        );
        """
    )

    # 5. Add index for invitation lookups
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_magic_links_invitation_id
        ON magic_links(invitation_id)
        WHERE invitation_id IS NOT NULL;
        """
    )

    # 6. Add comment
    op.execute(
        """
        COMMENT ON COLUMN magic_links.invitation_id IS
        'Reference to digital invitation for invitation-type magic links';
        """
    )


def downgrade():
    """Remove invitation support from magic_links."""

    # 1. Drop the index
    op.execute("DROP INDEX IF EXISTS idx_magic_links_invitation_id;")

    # 2. Drop and recreate the original constraint
    op.execute(
        """
        ALTER TABLE magic_links
        DROP CONSTRAINT IF EXISTS magic_links_target_id_required;
        """
    )

    op.execute(
        """
        ALTER TABLE magic_links
        ADD CONSTRAINT magic_links_target_id_required CHECK (
            (target_type = 'gallery' AND target_id IS NULL) OR
            (target_type != 'gallery' AND target_id IS NOT NULL)
        );
        """
    )

    # 3. Delete invitation links first (to avoid constraint violation)
    op.execute("DELETE FROM magic_links WHERE target_type = 'invitation';")

    # 4. Make gallery_id NOT NULL again
    op.execute(
        """
        ALTER TABLE magic_links
        ALTER COLUMN gallery_id SET NOT NULL;
        """
    )

    # 5. Drop invitation_id column
    op.execute("ALTER TABLE magic_links DROP COLUMN IF EXISTS invitation_id;")

    # Note: Cannot remove enum value in PostgreSQL easily
