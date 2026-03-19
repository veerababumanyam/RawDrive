"""Add R2 object key columns to company_logo_images.

Adds nullable r2_key columns for each logo size so that company logos
can be served from Cloudflare R2 while keeping PG blobs for
backwards compatibility (lazy migration).

Revision ID: 0199
Revises: 0198
Create Date: 2026-03-19
"""

from alembic import op

revision = "0199"
down_revision = "0198"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE company_logo_images
            ADD COLUMN IF NOT EXISTS r2_key_64  VARCHAR(512),
            ADD COLUMN IF NOT EXISTS r2_key_128 VARCHAR(512),
            ADD COLUMN IF NOT EXISTS r2_key_256 VARCHAR(512),
            ADD COLUMN IF NOT EXISTS r2_key_512 VARCHAR(512);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE company_logo_images
            DROP COLUMN IF EXISTS r2_key_64,
            DROP COLUMN IF EXISTS r2_key_128,
            DROP COLUMN IF EXISTS r2_key_256,
            DROP COLUMN IF EXISTS r2_key_512;
        """
    )
