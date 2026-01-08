"""add emotion columns

Revision ID: 0128
Revises: 0127
Create Date: 2026-01-08

Description:
    Add emotion detection columns to asset_analysis and face_detections tables.

    This enables storage of per-face emotion analysis results:
    - emotions JSONB: Full emotion breakdown (joy, sadness, anger, surprise, fear, disgust, contentment)
    - dominant_emotion: Primary detected emotion
    - emotion_confidence: Confidence score for dominant emotion

    Used by AI Microservice emotion detection feature with customer API keys.
"""


from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine.reflection import Inspector

# revision identifiers, used by Alembic.
revision = '0129'
down_revision = '0128'
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    return table_name in inspector.get_table_names()


def column_exists(table_name, column_name):
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    if not table_exists(table_name):
        return False
    columns = [c['name'] for c in inspector.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    """Add emotion detection columns to asset_analysis and face_detection_results."""

    # Extend asset_analysis table
    if not column_exists('asset_analysis', 'emotions'):
        op.add_column('asset_analysis',
            sa.Column('emotions', postgresql.JSONB, nullable=True,
                    comment='Emotion breakdown: {"joy": 0.85, "sadness": 0.02, ...}'))
    
    if not column_exists('asset_analysis', 'dominant_emotion'):
        op.add_column('asset_analysis',
            sa.Column('dominant_emotion', sa.String(50), nullable=True,
                    comment='Primary detected emotion: joy, sadness, anger, surprise, fear, disgust, contentment'))
    
    if not column_exists('asset_analysis', 'emotion_confidence'):
        op.add_column('asset_analysis',
            sa.Column('emotion_confidence', sa.Float, nullable=True,
                    comment='Confidence score for dominant emotion (0-1)'))

    # Extend face_detections table (if it exists)
    # Note: Using table_exists check to handle cases where table doesn't exist yet
    if table_exists('face_detections'):
        if not column_exists('face_detections', 'emotions'):
            op.add_column('face_detections',
                sa.Column('emotions', postgresql.JSONB, nullable=True,
                        comment='Per-face emotion breakdown'))

        if not column_exists('face_detections', 'dominant_emotion'):
            op.add_column('face_detections',
                sa.Column('dominant_emotion', sa.String(50), nullable=True,
                        comment='Primary emotion for this face'))

        if not column_exists('face_detections', 'emotion_confidence'):
            op.add_column('face_detections',
                sa.Column('emotion_confidence', sa.Float, nullable=True,
                        comment='Confidence score for face emotion'))

    # Index for filtering by dominant emotion (asset level)
    # We use IF NOT EXISTS for indexes in raw sql or handle catch
    # But standard create_index doesn't support if_not_exists easily in old alembic versions
    # For now, we assume if columns existed, indexes MIGHT exist. 
    # Let's wrap indexes in try/except block if possible or just let them fail? 
    # Better to check.
    
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)

    existing_indexes_aa = [i['name'] for i in inspector.get_indexes('asset_analysis')]

    if 'idx_asset_analysis_dominant_emotion' not in existing_indexes_aa:
        op.create_index(
            'idx_asset_analysis_dominant_emotion',
            'asset_analysis',
            ['dominant_emotion'],
            postgresql_where=sa.text("dominant_emotion IS NOT NULL")
        )

    # GIN index for JSONB emotion queries (for specific emotion filtering)
    if 'idx_asset_analysis_emotions_gin' not in existing_indexes_aa:
        op.create_index(
            'idx_asset_analysis_emotions_gin',
            'asset_analysis',
            ['emotions'],
            postgresql_using='gin',
            postgresql_where=sa.text("emotions IS NOT NULL")
        )

    # Partial index for high-confidence joy (example for common query pattern)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_analysis_joy
        ON asset_analysis(CAST((emotions->>'joy') AS float))
        WHERE CAST((emotions->>'joy') AS float) >= 0.7
    """)

    # Partial index for high-confidence sadness
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_asset_analysis_sadness
        ON asset_analysis(CAST((emotions->>'sadness') AS float))
        WHERE CAST((emotions->>'sadness') AS float) >= 0.7
    """)

    # Face-level dominant emotion index (only if table exists)
    if table_exists('face_detections'):
        existing_indexes_fd = [i['name'] for i in inspector.get_indexes('face_detections')]
        if 'idx_face_detections_dominant_emotion' not in existing_indexes_fd:
            op.create_index(
                'idx_face_detections_dominant_emotion',
                'face_detections',
                ['dominant_emotion'],
                postgresql_where=sa.text("dominant_emotion IS NOT NULL")
            )


def downgrade() -> None:
    """Remove emotion detection columns."""

    # Drop indexes (with guards)
    if table_exists('face_detections'):
        op.execute("DROP INDEX IF EXISTS idx_face_detections_dominant_emotion")

    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_sadness")
    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_joy")
    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_emotions_gin")
    op.execute("DROP INDEX IF EXISTS idx_asset_analysis_dominant_emotion")

    # Drop columns from face_detections (if table exists)
    if table_exists('face_detections') and column_exists('face_detections', 'emotion_confidence'):
        op.drop_column('face_detections', 'emotion_confidence')
    if table_exists('face_detections') and column_exists('face_detections', 'dominant_emotion'):
        op.drop_column('face_detections', 'dominant_emotion')
    if table_exists('face_detections') and column_exists('face_detections', 'emotions'):
        op.drop_column('face_detections', 'emotions')

    # Drop columns from asset_analysis
    if column_exists('asset_analysis', 'emotion_confidence'):
        op.drop_column('asset_analysis', 'emotion_confidence')
    if column_exists('asset_analysis', 'dominant_emotion'):
        op.drop_column('asset_analysis', 'dominant_emotion')
    if column_exists('asset_analysis', 'emotions'):
        op.drop_column('asset_analysis', 'emotions')
