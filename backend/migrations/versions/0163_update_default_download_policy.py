"""Update default download_policy to watermarked_only

Revision ID: 0163
Revises: 0162
Create Date: 2026-01-10 13:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0163'
down_revision = '0162'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Change default value of download_policy column in galleries table
    op.alter_column('galleries', 'download_policy',
               existing_type=sa.VARCHAR(length=50),
               server_default='watermarked_only',
               existing_nullable=True)


def downgrade() -> None:
    # Revert default value to view_only
    op.alter_column('galleries', 'download_policy',
               existing_type=sa.VARCHAR(length=50),
               server_default='view_only',
               existing_nullable=True)
