"""Add gradient_config JSONB column for gallery branding.

Revision ID: 0040
Revises: 0039
Create Date: 2025-12-28

This migration adds a gradient_config column to store gradient branding
configuration as JSONB. The legacy primary_color column is retained for
backward compatibility during migration.

Schema: {
    "type": "linear",
    "preset_id": "sunset-glow" | null,
    "direction": 135,  // 0-359 degrees
    "colors": [
        {"color": "#FF6B6B", "position": 0},
        {"color": "#FFA502", "position": 100}
    ]
}
"""

from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add gradient_config JSONB column
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS gradient_config JSONB;
        """
    )

    # Add documentation comment
    op.execute(
        """
        COMMENT ON COLUMN galleries.gradient_config IS
        'JSON configuration for gallery header/hero gradient. Schema: {type, preset_id, direction, colors[]}';
        """
    )

    # Add GIN index for potential preset_id queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_galleries_gradient_preset
        ON galleries USING GIN ((gradient_config->'preset_id'));
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_galleries_gradient_preset;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS gradient_config;")
