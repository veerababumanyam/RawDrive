"""create_workspace_security_settings

Revision ID: 0142
Revises: 0141
Create Date: 2026-01-09 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0142'
down_revision = '0141'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workspace_security_settings',
        sa.Column('setting_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('require_2fa', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('password_min_length', sa.Integer(), server_default='8', nullable=False),
        sa.Column('password_require_uppercase', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('password_require_lowercase', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('password_require_numbers', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('password_require_special', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('session_timeout_minutes', sa.Integer(), server_default='60', nullable=False),
        sa.Column('max_sessions_per_user', sa.Integer(), server_default='5', nullable=False),
        sa.Column('ip_whitelist', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], ondelete='CASCADE'),
        sa.UniqueConstraint('workspace_id')
    )
    
    op.create_index(op.f('idx_workspace_security_settings_workspace_id'), 'workspace_security_settings', ['workspace_id'], unique=True)


def downgrade():
    op.drop_table('workspace_security_settings')
