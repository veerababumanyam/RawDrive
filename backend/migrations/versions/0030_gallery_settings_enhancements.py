"""Add gallery settings enhancement columns (pin, branding, custom_links).

Revision ID: 0030
Revises: 0029
Create Date: 2025-12-26
"""

from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add PIN protection column
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
        """
    )
    
    # Add branding override columns
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS primary_color VARCHAR(50);
        """
    )
    
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS font_family VARCHAR(100);
        """
    )
    
    # Add custom links JSONB column
    op.execute(
        """
        ALTER TABLE galleries
        ADD COLUMN IF NOT EXISTS custom_links JSONB DEFAULT '[]'::jsonb;
        """
    )
    
    # Add comment for documentation
    op.execute(
        """
        COMMENT ON COLUMN galleries.pin_hash IS 'Hashed PIN for additional gallery access protection';
        """
    )
    op.execute(
        """
        COMMENT ON COLUMN galleries.primary_color IS 'Hex color code for gallery branding override';
        """
    )
    op.execute(
        """
        COMMENT ON COLUMN galleries.font_family IS 'Font family name for gallery typography override';
        """
    )
    op.execute(
        """
        COMMENT ON COLUMN galleries.custom_links IS 'JSON array of {label, url} objects for custom navigation links';
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS custom_links;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS font_family;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS primary_color;")
    op.execute("ALTER TABLE galleries DROP COLUMN IF EXISTS pin_hash;")
