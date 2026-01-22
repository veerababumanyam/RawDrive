"""Add design_config JSONB column for Gallery Design Studio.

Revision ID: 0166
Revises: 0165
Create Date: 2026-01-22

This migration adds a design_config column to store the complete Gallery Design Studio
configuration including cover styles, typography, themes, and grid settings.

Schema:
{
    "cover": {
        "style": "classic",
        "focalPoint": {"x": 50, "y": 50},
        "titleVisible": true,
        "overlayOpacity": 0.3
    },
    "typography": {
        "pairingId": "modern",
        "customHeadingsFont": null
    },
    "theme": {
        "id": "brand",
        "mode": "system",
        "accentColorOverride": null
    },
    "grid": {
        "style": "vertical",
        "size": "md",
        "spacing": "md"
    }
}
"""

from alembic import op

revision = "0166"
down_revision = "0165"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add design_config JSONB column
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS design_config JSONB;
        """
    )

    # Add documentation comment
    op.execute(
        """
        COMMENT ON COLUMN galleries.design_config IS
        'JSON configuration for Gallery Design Studio: cover styles, typography, themes, grid layout. Schema: {cover, typography, theme, grid}';
        """
    )

    # Add GIN index for efficient queries on nested fields
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_galleries_design_config_gin
        ON galleries USING GIN (design_config);
        """
    )

    # Backfill existing galleries with default configuration
    op.execute(
        """
        UPDATE galleries
        SET design_config = jsonb_build_object(
            'cover', jsonb_build_object(
                'style', 'classic',
                'focalPoint', jsonb_build_object('x', 50, 'y', 50),
                'titleVisible', true,
                'overlayOpacity', 0.3
            ),
            'typography', jsonb_build_object(
                'pairingId', 'modern',
                'customHeadingsFont', null
            ),
            'theme', jsonb_build_object(
                'id', 'brand',
                'mode', 'system',
                'accentColorOverride', null
            ),
            'grid', jsonb_build_object(
                'style', 'vertical',
                'size', 'md',
                'spacing', 'md'
            )
        )
        WHERE design_config IS NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_galleries_design_config_gin;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS design_config;")
