"""add_agent_api_keys

Revision ID: 0134
Revises: 3a46921d84b5
Create Date: 2026-01-08 19:30:00.000000

Phase 4: Google A2A ADKS Integration - Agent API Keys
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0134'
down_revision = '3a46921d84b5'
branch_labels = None
depends_on = None


def upgrade():
    """Add agent_api_keys table for external agent authentication."""

    # Create agent_api_keys table
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    op.create_table(
        'agent_api_keys',
        sa.Column('key_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('key_name', sa.String(200), nullable=False),
        sa.Column('key_hash', sa.String(64), nullable=False),  # SHA-256 hash
        sa.Column('scopes', postgresql.ARRAY(sa.String), nullable=False),
        sa.Column('rate_limit_rpm', sa.Integer, nullable=False, server_default='100'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_by_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('metadata', postgresql.JSONB, nullable=True),
    )

    # Create indexes
    op.create_index(
        'idx_agent_api_keys_workspace',
        'agent_api_keys',
        ['workspace_id', 'is_active'],
    )

    op.create_index(
        'idx_agent_api_keys_hash',
        'agent_api_keys',
        ['key_hash'],
    )

    # Create foreign key constraint
    op.create_foreign_key(
        'fk_agent_api_keys_workspace',
        'agent_api_keys',
        'workspaces',
        ['workspace_id'],
        ['workspace_id'],
        ondelete='CASCADE',
    )

    op.create_foreign_key(
        'fk_agent_api_keys_user',
        'agent_api_keys',
        'users',
        ['created_by_user_id'],
        ['user_id'],
        ondelete='CASCADE',
    )

    # Add comment
    op.execute("""
        COMMENT ON TABLE agent_api_keys IS
        'API keys for external agent authentication (A2A integration)'
    """)


def downgrade():
    """Remove agent_api_keys table."""
    op.drop_table('agent_api_keys')
