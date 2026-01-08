"""Add AI processing tables for duplicate detection, moderation, tagging, and upscaling

Revision ID: 0128
Revises: 0127
Create Date: 2026-01-08

This migration adds tables for AI processing features:
- asset_embeddings: Stores perceptual hashes and CLIP embeddings for duplicate detection
- ai_processing_results: Stores AI analysis results (moderation, quality scores, upscaling status)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0128'
down_revision: Union[str, None] = '0127'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create AI processing tables with pgvector support."""

    # ==========================================================================
    # asset_embeddings table
    # ==========================================================================
    op.create_table(
        'asset_embeddings',
        sa.Column('asset_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('perceptual_hash', sa.String(length=64), nullable=False,
                  comment='Perceptual hash (pHash) for duplicate detection'),
        sa.Column('clip_embedding', postgresql.ARRAY(sa.Float), nullable=True,
                  comment='CLIP embedding vector (512 dimensions) for semantic similarity'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),

        # Primary key
        sa.PrimaryKeyConstraint('asset_id', name='pk_asset_embeddings'),

        # Foreign keys
        sa.ForeignKeyConstraint(
            ['asset_id'],
            ['assets.asset_id'],
            name='fk_asset_embeddings_asset_id',
            ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['workspace_id'],
            ['workspaces.workspace_id'],
            name='fk_asset_embeddings_workspace_id',
            ondelete='CASCADE'
        ),

        comment='Stores embeddings for duplicate detection (pHash + CLIP)'
    )

    # Indexes for asset_embeddings
    op.create_index(
        'idx_asset_embeddings_workspace',
        'asset_embeddings',
        ['workspace_id']
    )
    op.create_index(
        'idx_asset_embeddings_phash',
        'asset_embeddings',
        ['perceptual_hash']
    )

    # Note: Vector similarity index requires pgvectorscale extension
    # Created separately via raw SQL after table creation
    # op.execute(
    #     """
    #     CREATE INDEX idx_asset_embeddings_clip
    #     ON asset_embeddings
    #     USING ivfflat (clip_embedding vector_cosine_ops)
    #     WITH (lists = 100);
    #     """
    # )

    # ==========================================================================
    # ai_processing_results table
    # ==========================================================================
    op.create_table(
        'ai_processing_results',
        sa.Column('asset_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),

        # Duplicate Detection
        sa.Column('is_duplicate', sa.Boolean, default=False, nullable=False,
                  comment='True if duplicate detected'),
        sa.Column('duplicate_asset_id', postgresql.UUID(as_uuid=True), nullable=True,
                  comment='Original asset ID if duplicate'),
        sa.Column('similarity_score', sa.Numeric(precision=5, scale=4), nullable=True,
                  comment='Similarity score (0.0000 to 1.0000)'),
        sa.Column('duplicate_method', sa.String(length=50), nullable=True,
                  comment='Detection method: perceptual_hash, clip_embedding, exact_match'),

        # Content Moderation
        sa.Column('moderation_status', sa.String(length=20), nullable=True,
                  comment='Moderation status: safe, review, blocked, pending, error'),
        sa.Column('moderation_violations', postgresql.ARRAY(sa.String), nullable=True,
                  comment='List of violations: adult_content, violence, racy_content'),
        sa.Column('safe_search_scores', postgresql.JSONB, nullable=True,
                  comment='Google Vision API Safe Search scores'),
        sa.Column('moderation_confidence', sa.Numeric(precision=5, scale=4), nullable=True,
                  comment='Moderation confidence score (0.0000 to 1.0000)'),

        # Quality Analysis
        sa.Column('quality_score', sa.Integer, nullable=True,
                  comment='Overall quality score (0-100)'),
        sa.Column('blur_score', sa.Numeric(precision=5, scale=2), nullable=True,
                  comment='Blur detection score'),
        sa.Column('exposure_score', sa.Numeric(precision=5, scale=2), nullable=True,
                  comment='Exposure quality score'),
        sa.Column('composition_score', sa.Numeric(precision=5, scale=2), nullable=True,
                  comment='Composition quality score'),

        # AI Tagging
        sa.Column('ai_tags', postgresql.JSONB, nullable=True,
                  comment='AI-generated tags with confidence scores'),
        sa.Column('detected_objects', postgresql.JSONB, nullable=True,
                  comment='Detected objects and their bounding boxes'),
        sa.Column('scene_classification', postgresql.JSONB, nullable=True,
                  comment='Scene classification results'),

        # Upscaling
        sa.Column('upscale_status', sa.String(length=20), nullable=True,
                  comment='Upscaling status: pending, processing, completed, failed'),
        sa.Column('upscaled_asset_id', postgresql.UUID(as_uuid=True), nullable=True,
                  comment='Asset ID of upscaled variant'),
        sa.Column('upscale_factor', sa.Integer, nullable=True,
                  comment='Upscaling factor applied (2x, 4x)'),
        sa.Column('upscale_model', sa.String(length=100), nullable=True,
                  comment='Upscaling model used'),

        # Processing Metadata
        sa.Column('processing_time_ms', sa.Integer, nullable=True,
                  comment='Total AI processing time in milliseconds'),
        sa.Column('features_completed', postgresql.ARRAY(sa.String), nullable=True,
                  comment='List of completed AI features'),
        sa.Column('features_failed', postgresql.ARRAY(sa.String), nullable=True,
                  comment='List of failed AI features'),
        sa.Column('error_message', sa.Text, nullable=True,
                  comment='Error message if processing failed'),

        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),

        # Primary key
        sa.PrimaryKeyConstraint('asset_id', name='pk_ai_processing_results'),

        # Foreign keys
        sa.ForeignKeyConstraint(
            ['asset_id'],
            ['assets.asset_id'],
            name='fk_ai_processing_results_asset_id',
            ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['workspace_id'],
            ['workspaces.workspace_id'],
            name='fk_ai_processing_results_workspace_id',
            ondelete='CASCADE'
        ),
        sa.ForeignKeyConstraint(
            ['duplicate_asset_id'],
            ['assets.asset_id'],
            name='fk_ai_processing_results_duplicate_asset_id',
            ondelete='SET NULL'
        ),
        sa.ForeignKeyConstraint(
            ['upscaled_asset_id'],
            ['assets.asset_id'],
            name='fk_ai_processing_results_upscaled_asset_id',
            ondelete='SET NULL'
        ),

        comment='Stores AI processing results for all features'
    )

    # Indexes for ai_processing_results
    op.create_index(
        'idx_ai_results_workspace',
        'ai_processing_results',
        ['workspace_id']
    )
    op.create_index(
        'idx_ai_results_duplicate',
        'ai_processing_results',
        ['is_duplicate'],
        postgresql_where=sa.text('is_duplicate = TRUE')
    )
    op.create_index(
        'idx_ai_results_moderation',
        'ai_processing_results',
        ['moderation_status']
    )
    op.create_index(
        'idx_ai_results_upscale_status',
        'ai_processing_results',
        ['upscale_status']
    )
    op.create_index(
        'idx_ai_results_quality',
        'ai_processing_results',
        ['quality_score']
    )

    # ==========================================================================
    # Update trigger for updated_at
    # ==========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_ai_processing_results_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trigger_update_ai_processing_results_updated_at
        BEFORE UPDATE ON ai_processing_results
        FOR EACH ROW
        EXECUTE FUNCTION update_ai_processing_results_updated_at();

        CREATE TRIGGER trigger_update_asset_embeddings_updated_at
        BEFORE UPDATE ON asset_embeddings
        FOR EACH ROW
        EXECUTE FUNCTION update_ai_processing_results_updated_at();
        """
    )


def downgrade() -> None:
    """Drop AI processing tables."""

    # Drop triggers
    op.execute('DROP TRIGGER IF EXISTS trigger_update_ai_processing_results_updated_at ON ai_processing_results')
    op.execute('DROP TRIGGER IF EXISTS trigger_update_asset_embeddings_updated_at ON asset_embeddings')
    op.execute('DROP FUNCTION IF EXISTS update_ai_processing_results_updated_at()')

    # Drop tables
    op.drop_table('ai_processing_results')
    op.drop_table('asset_embeddings')
