"""create_workspace_privacy_settings

Revision ID: 0144
Revises: 0143
Create Date: 2026-01-09 00:00:03.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0144'
down_revision = '0143'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workspace_privacy_settings',
        sa.Column('setting_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('analytics_enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('public_profile_enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('data_retention_days', sa.Integer(), server_default='365', nullable=False),
        sa.Column('gdpr_compliance_mode', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], ondelete='CASCADE'),
        sa.UniqueConstraint('workspace_id')
    )
    
    op.create_index(op.f('idx_workspace_privacy_settings_workspace_id'), 'workspace_privacy_settings', ['workspace_id'], unique=True)


def downgrade():
    op.drop_table('workspace_privacy_settings')
