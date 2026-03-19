"""Add R2 object key columns to personal_profile_avatars.

Adds nullable r2_key columns for each avatar size so that avatars
can be served from Cloudflare R2 while keeping PG blobs for
backwards compatibility (lazy migration).

Revision ID: 0197
Revises: 0196
Create Date: 2026-03-19
"""

from alembic import op

revision = "0197"
down_revision = "0196"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE personal_profile_avatars
            ADD COLUMN IF NOT EXISTS r2_key_64  VARCHAR(512),
            ADD COLUMN IF NOT EXISTS r2_key_128 VARCHAR(512),
            ADD COLUMN IF NOT EXISTS r2_key_256 VARCHAR(512),
            ADD COLUMN IF NOT EXISTS r2_key_512 VARCHAR(512);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE personal_profile_avatars
            DROP COLUMN IF EXISTS r2_key_64,
            DROP COLUMN IF EXISTS r2_key_128,
            DROP COLUMN IF EXISTS r2_key_256,
            DROP COLUMN IF EXISTS r2_key_512;
        """
    )
