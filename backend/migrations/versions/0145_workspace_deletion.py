"""workspace_deletion

Revision ID: 0145
Revises: 0144
Create Date: 2026-01-09 00:00:04.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0145'
down_revision = '0144'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('workspaces', sa.Column('deletion_requested_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('workspaces', sa.Column('scheduled_deletion_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('workspaces', sa.Column('deletion_reason', sa.Text(), nullable=True))
    op.add_column('workspaces', sa.Column('deletion_requested_by', postgresql.UUID(as_uuid=True), nullable=True))
    
    op.create_foreign_key(
        'fk_workspaces_deletion_requested_by_users',
        'workspaces', 'users',
        ['deletion_requested_by'], ['user_id'],
        ondelete='SET NULL'
    )


def downgrade():
    op.drop_constraint('fk_workspaces_deletion_requested_by_users', 'workspaces', type_='foreignkey')
    op.drop_column('workspaces', 'deletion_requested_by')
    op.drop_column('workspaces', 'deletion_reason')
    op.drop_column('workspaces', 'scheduled_deletion_at')
    op.drop_column('workspaces', 'deletion_requested_at')
