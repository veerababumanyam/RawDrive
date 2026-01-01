"""Update digital_invitations and invitation_templates tables.

Feature: 017-digital-wedding-invitations
Revision ID: 0072
Revises: 0071
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0072"
down_revision = "0071"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update existing tables with new columns."""
    
    # digital_invitations updates
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD COLUMN IF NOT EXISTS video_object_key TEXT,
        ADD COLUMN IF NOT EXISTS audio_object_key TEXT,
        ADD COLUMN IF NOT EXISTS has_sub_events BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS layout_density VARCHAR(20) DEFAULT 'normal',
        ADD COLUMN IF NOT EXISTS font_heading VARCHAR(100) DEFAULT 'Playfair Display',
        ADD COLUMN IF NOT EXISTS font_body VARCHAR(100) DEFAULT 'Lora',
        ADD COLUMN IF NOT EXISTS ai_generated_content JSONB DEFAULT '{}'::JSONB;
        """
    )

    # Add constraints separately for safety
    op.execute(
        """
        ALTER TABLE digital_invitations
        ADD CONSTRAINT check_layout_density 
        CHECK (layout_density IN ('compact', 'normal', 'spacious'));
        """
    )

    # invitation_templates updates
    op.execute(
        """
        ALTER TABLE invitation_templates
        ADD COLUMN IF NOT EXISTS gradient_config JSONB DEFAULT '{}'::JSONB,
        ADD COLUMN IF NOT EXISTS animation_config JSONB DEFAULT '{}'::JSONB,
        ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;
        """
    )


def downgrade() -> None:
    """Revert table updates."""
    
    # invitation_templates revert
    op.execute(
        """
        ALTER TABLE invitation_templates
        DROP COLUMN IF EXISTS gradient_config,
        DROP COLUMN IF EXISTS animation_config,
        DROP COLUMN IF EXISTS is_featured,
        DROP COLUMN IF EXISTS download_count;
        """
    )

    # digital_invitations revert
    op.execute(
        """
        ALTER TABLE digital_invitations
        DROP CONSTRAINT IF EXISTS check_layout_density,
        DROP COLUMN IF EXISTS video_object_key,
        DROP COLUMN IF EXISTS audio_object_key,
        DROP COLUMN IF EXISTS has_sub_events,
        DROP COLUMN IF EXISTS layout_density,
        DROP COLUMN IF EXISTS font_heading,
        DROP COLUMN IF EXISTS font_body,
        DROP COLUMN IF EXISTS ai_generated_content;
        """
    )
