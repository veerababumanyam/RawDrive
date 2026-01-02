"""Custom fonts table for invitation font uploads.

Revision ID: 0078_custom_fonts
Revises: 0077_email_send_log
Create Date: 2026-01-02

Feature: 019-invitation-indian-languages (Font Enhancement)
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '0078_custom_fonts'
down_revision = '0077_email_send_log'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create custom_fonts table for user-uploaded fonts."""
    op.create_table(
        'custom_fonts',
        sa.Column('font_id', sa.String(36), primary_key=True),
        sa.Column('workspace_id', sa.String(36), nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('family', sa.String(200), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('storage_path', sa.String(500), nullable=False),
        sa.Column('file_size', sa.Integer, nullable=False),
        sa.Column('format', sa.String(10), nullable=False),  # ttf, otf, woff, woff2
        sa.Column('created_by_user_id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.String(50), nullable=False),
        sa.Column('deleted_at', sa.String(50), nullable=True),
        sa.ForeignKeyConstraint(
            ['workspace_id'],
            ['workspaces.workspace_id'],
            ondelete='CASCADE',
        ),
    )

    # Create index for listing fonts by workspace
    op.create_index(
        'ix_custom_fonts_workspace_created',
        'custom_fonts',
        ['workspace_id', 'created_at'],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # Add font columns to invitations table for custom font selection
    op.add_column(
        'invitations',
        sa.Column('custom_font_heading_id', sa.String(36), nullable=True),
    )
    op.add_column(
        'invitations',
        sa.Column('custom_font_body_id', sa.String(36), nullable=True),
    )


def downgrade() -> None:
    """Remove custom fonts support."""
    op.drop_column('invitations', 'custom_font_body_id')
    op.drop_column('invitations', 'custom_font_heading_id')
    op.drop_index('ix_custom_fonts_workspace_created', 'custom_fonts')
    op.drop_table('custom_fonts')
