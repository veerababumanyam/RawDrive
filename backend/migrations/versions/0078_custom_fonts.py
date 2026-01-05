"""Custom fonts table for invitation font uploads.

Revision ID: 0078
Revises: 0077
Create Date: 2026-01-02

Feature: 019-invitation-indian-languages (Font Enhancement)
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0078'
down_revision = '0077'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add custom font references to digital_invitations table.
    
    Note: custom_fonts table already exists from migration 0017.
    """
    # Add font columns to digital_invitations table for custom font selection
    op.add_column(
        'digital_invitations',
        sa.Column('custom_font_heading_id', sa.String(36), nullable=True),
    )
    op.add_column(
        'digital_invitations',
        sa.Column('custom_font_body_id', sa.String(36), nullable=True),
    )


def downgrade() -> None:
    """Remove custom font references from digital_invitations."""
    op.drop_column('digital_invitations', 'custom_font_body_id')
    op.drop_column('digital_invitations', 'custom_font_heading_id')
