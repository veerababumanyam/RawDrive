"""Add search_engine_indexing_enabled to workspace_privacy_settings.

Revision ID: 0154_add_search_engine_indexing
Revises: 0153_webhook_event_types
Create Date: 2026-01-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0154_add_search_engine_indexing'
down_revision = '0153'
branch_labels = None
depends_on = None


def upgrade():
    """Add search_engine_indexing_enabled column."""
    op.add_column(
        'workspace_privacy_settings',
        sa.Column(
            'search_engine_indexing_enabled',
            sa.Boolean(),
            nullable=False,
            server_default='false',
            comment='Controls whether the company profile should be indexed by search engines'
        )
    )


def downgrade():
    """Remove search_engine_indexing_enabled column."""
    op.drop_column('workspace_privacy_settings', 'search_engine_indexing_enabled')
