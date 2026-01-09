"""create_workspace_notification_settings

Revision ID: 0143
Revises: 0142
Create Date: 2026-01-09 00:00:02.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0143'
down_revision = '0142'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workspace_notification_settings',
        sa.Column('setting_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('default_email_preferences', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('default_in_app_preferences', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('notification_channels', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], ondelete='CASCADE'),
        sa.UniqueConstraint('workspace_id')
    )
    
    op.create_index(op.f('idx_workspace_notification_settings_workspace_id'), 'workspace_notification_settings', ['workspace_id'], unique=True)


def downgrade():
    op.drop_table('workspace_notification_settings')
