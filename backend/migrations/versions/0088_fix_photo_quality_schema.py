"""Fix photo_quality_analysis schema

Revision ID: 0088
Revises: 0087
Create Date: 2026-01-05 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '0088'
down_revision = '0087'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add session_id column (nullable first)
    op.add_column('photo_quality_analysis', sa.Column('session_id', sa.UUID(), nullable=True))

    # 2. Add Foreign Key to curation_sessions
    op.create_foreign_key(
        'fk_photo_quality_session',
        'photo_quality_analysis', 'curation_sessions',
        ['session_id'], ['session_id'],
        ondelete='CASCADE'
    )

    # 3. Handle existing data compatibility
    # Since existing rows lack session_id, they violate the new schema intention.
    # We delete them as they are likely invalid or cannot be associated with a session.
    op.execute("DELETE FROM photo_quality_analysis WHERE session_id IS NULL")

    # 4. Make session_id NOT NULL
    op.alter_column('photo_quality_analysis', 'session_id', nullable=False)

    # 5. Fix Primary Key
    # Drop existing PK (asset_id)
    op.execute('ALTER TABLE photo_quality_analysis DROP CONSTRAINT photo_quality_analysis_pkey')
    
    # Create new composite PK (asset_id, session_id)
    op.create_primary_key(
        'photo_quality_analysis_pkey',
        'photo_quality_analysis',
        ['asset_id', 'session_id']
    )


def downgrade():
    # Reverse of upgrade
    
    # 1. Drop PK
    op.execute('ALTER TABLE photo_quality_analysis DROP CONSTRAINT photo_quality_analysis_pkey')
    
    # 2. Recreate old PK for asset_id
    op.create_primary_key(
        'photo_quality_analysis_pkey',
        'photo_quality_analysis',
        ['asset_id']
    )

    # 3. Drop FK
    op.drop_constraint('fk_photo_quality_session', 'photo_quality_analysis', type_='foreignkey')

    # 4. Drop session_id column
    op.drop_column('photo_quality_analysis', 'session_id')
