"""create user ai provider settings

Revision ID: 0127
Revises: 0126
Create Date: 2026-01-08

Description:
    Create unified user_ai_provider_settings table for storing encrypted
    user credentials for all AI providers (Cloud Vision, Gemini, Video
    Intelligence, OpenAI, etc.).

    This enables users to use their own API keys instead of platform-level
    credentials, giving them control over AI budgets and quotas.

    Features:
    - Encrypted API keys and service account JSON
    - Per-user, per-provider configuration
    - Validation status tracking
    - Usage tracking (credits, last used)
    - Support for both API keys and service account credentials
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0127'
down_revision = '0126'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create user_ai_provider_settings table."""

    # Ensure uuid-ossp extension exists (idempotent)
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    # Create table
    op.create_table(
        'user_ai_provider_settings',
        sa.Column('setting_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),

        # Provider identification
        sa.Column('provider', sa.String(50), nullable=False, comment='Provider name: cloud_vision, gemini, video_intelligence, openai'),

        # Encrypted credentials
        sa.Column('api_key_encrypted', sa.Text, nullable=True, comment='Encrypted API key for key-based auth'),
        sa.Column('api_key_iv', sa.Text, nullable=True, comment='IV for API key encryption'),
        sa.Column('credentials_json_encrypted', sa.Text, nullable=True, comment='Encrypted service account JSON'),
        sa.Column('credentials_iv', sa.Text, nullable=True, comment='IV for credentials JSON encryption'),

        # Masked display (for UI)
        sa.Column('api_key_prefix', sa.String(10), nullable=True, comment='First few characters of API key'),
        sa.Column('api_key_suffix', sa.String(10), nullable=True, comment='Last few characters of API key'),

        # Status tracking
        sa.Column('status', sa.String(20), nullable=False, server_default='not_configured',
                  comment='Status: not_configured, connected, validation_failed'),
        sa.Column('is_enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('last_validated_at', sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('validation_error', sa.Text, nullable=True),

        # Usage tracking
        sa.Column('credits_used', sa.Integer, nullable=False, server_default='0'),
        sa.Column('last_used_at', sa.TIMESTAMP(timezone=True), nullable=True),

        # Metadata
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('NOW()')),

        # Foreign keys
        sa.ForeignKeyConstraint(['user_id'], ['users.user_id'], name='fk_user_ai_provider_user', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], name='fk_user_ai_provider_workspace', ondelete='CASCADE'),

        # Constraints
        sa.UniqueConstraint('user_id', 'provider', name='uq_user_ai_provider'),
        sa.CheckConstraint(
            "status IN ('not_configured', 'connected', 'validation_failed')",
            name='ck_user_ai_provider_status'
        ),
        sa.CheckConstraint(
            "provider IN ('cloud_vision', 'gemini', 'video_intelligence', 'openai')",
            name='ck_user_ai_provider_provider'
        ),
    )

    # Indexes
    op.create_index(
        'idx_user_ai_provider_user',
        'user_ai_provider_settings',
        ['user_id']
    )

    op.create_index(
        'idx_user_ai_provider_workspace',
        'user_ai_provider_settings',
        ['workspace_id']
    )

    op.create_index(
        'idx_user_ai_provider_user_provider',
        'user_ai_provider_settings',
        ['user_id', 'provider']
    )

    op.create_index(
        'idx_user_ai_provider_status',
        'user_ai_provider_settings',
        ['status'],
        postgresql_where=sa.text("status != 'not_configured'")
    )

    op.create_index(
        'idx_user_ai_provider_last_used',
        'user_ai_provider_settings',
        ['last_used_at'],
        postgresql_where=sa.text("last_used_at IS NOT NULL")
    )

    # Create update trigger for updated_at
    op.execute("""
        CREATE OR REPLACE FUNCTION update_user_ai_provider_settings_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        CREATE TRIGGER trigger_update_user_ai_provider_settings_updated_at
        BEFORE UPDATE ON user_ai_provider_settings
        FOR EACH ROW
        EXECUTE FUNCTION update_user_ai_provider_settings_updated_at();
    """)


def downgrade() -> None:
    """Drop user_ai_provider_settings table."""

    # Drop trigger and function
    op.execute('DROP TRIGGER IF EXISTS trigger_update_user_ai_provider_settings_updated_at ON user_ai_provider_settings;')
    op.execute('DROP FUNCTION IF EXISTS update_user_ai_provider_settings_updated_at;')

    # Drop indexes
    op.drop_index('idx_user_ai_provider_last_used', 'user_ai_provider_settings')
    op.drop_index('idx_user_ai_provider_status', 'user_ai_provider_settings')
    op.drop_index('idx_user_ai_provider_user_provider', 'user_ai_provider_settings')
    op.drop_index('idx_user_ai_provider_workspace', 'user_ai_provider_settings')
    op.drop_index('idx_user_ai_provider_user', 'user_ai_provider_settings')

    # Drop table
    op.drop_table('user_ai_provider_settings')
