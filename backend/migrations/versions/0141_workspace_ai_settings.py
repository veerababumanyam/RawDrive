"""create_workspace_ai_settings

Revision ID: 0141
Revises: 0134, 0135
Create Date: 2026-01-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0141'
down_revision = ('0134', '0135')
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'workspace_ai_settings',
        sa.Column('setting_id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('api_key_encrypted', sa.LargeBinary(), nullable=True),
        sa.Column('api_key_iv', sa.LargeBinary(), nullable=True),
        sa.Column('api_key_prefix', sa.String(), nullable=True),
        sa.Column('api_key_suffix', sa.String(), nullable=True),
        sa.Column('selected_model_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('last_validated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('validation_error', sa.Text(), nullable=True),
        sa.Column('credits_used', sa.Integer(), nullable=True, default=0),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.workspace_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['selected_model_id'], ['gemini_models.model_id'], ondelete='SET NULL'),
        sa.UniqueConstraint('workspace_id')
    )
    
    op.create_index(op.f('idx_workspace_ai_settings_workspace_id'), 'workspace_ai_settings', ['workspace_id'], unique=True)


def downgrade():
    op.drop_table('workspace_ai_settings')
